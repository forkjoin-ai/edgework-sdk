import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveAeonConfig } from '../deploy/aeon-config';
import { cloneDeploymentToDirectory } from '../deploy/clone';
import { runQualityAutopilot } from '../deploy/quality';
import { scaffoldAeonFoundation } from '../deploy/scaffold';

describe('aeon scaffold + clone workflows', () => {
  let workspaceRoot: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'edgework-scaffold-'));
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('scaffolded demo passes quality autopilot local lint', async () => {
    const appDir = join(workspaceRoot, 'apps', 'demo');
    await scaffoldAeonFoundation({
      targetDir: appDir,
      preset: 'all',
      quality: true,
    });

    expect(existsSync(join(appDir, 'mcp.json'))).toBe(true);
    expect(existsSync(join(appDir, 'public', 'sitemap.xml'))).toBe(true);

    const report = await runQualityAutopilot({
      workspaceRoot,
      source: 'workspace',
      targets: 'demo',
    });

    expect(report.ok).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it('resolves config precedence as CLI > aeon.toml > preset defaults', () => {
    const configPath = join(workspaceRoot, 'aeon.toml');
    writeFileSync(
      configPath,
      `[project]
name = "foundation-demo"
deploymentTarget = "affectively.app"

preset = "minimal"

[features]
analytics = false
dashrelay = true
`,
      'utf8'
    );

    const resolved = resolveAeonConfig({
      projectName: 'foundation-demo',
      preset: 'all',
      configPath,
      enable: ['analytics'],
      disable: ['dashrelay'],
    });

    expect(resolved.project.deploymentTarget).toBe('affectively.app');
    expect(resolved.features.analytics).toBe(true);
    expect(resolved.features.dashrelay).toBe(false);
  });

  it('clones from slug source with downloaded snapshot pages', async () => {
    globalThis.fetch = jest.fn(async (url: string | URL) => {
      const resolved = String(url);

      if (resolved.endsWith('/v1/aeon-deploy/list')) {
        return new Response(
          JSON.stringify({
            processes: [{ name: 'affectively-app', cid: 'cid-test-123' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (resolved.endsWith('/sitemap.xml')) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://affectively-app.edgework.ai/privacy</loc></url><url><loc>https://affectively-app.edgework.ai/docs</loc></url></urlset>`,
          {
            status: 200,
            headers: { 'Content-Type': 'application/xml; charset=utf-8' },
          }
        );
      }

      if (resolved.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /\n', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      if (resolved.includes('/.well-known/ai-plugin.json')) {
        return new Response('{"schema_version":"v1"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      return new Response('<html><body>snapshot</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof globalThis.fetch;

    const targetDir = join(workspaceRoot, 'cloned-app');
    const clone = await cloneDeploymentToDirectory({
      source: 'affectively-app',
      targetDir,
      mode: 'full',
      install: false,
      serve: false,
    });

    expect(clone.source.kind).toBe('slug');
    expect(clone.downloadedPaths.length).toBeGreaterThan(0);
    expect(existsSync(join(targetDir, 'public', 'privacy', 'index.html'))).toBe(
      true
    );

    const manifest = JSON.parse(
      readFileSync(join(targetDir, '.aeon', 'clone-manifest.json'), 'utf8')
    ) as {
      source: { input: string; kind: string };
    };
    expect(manifest.source.input).toBe('affectively-app');
    expect(manifest.source.kind).toBe('slug');
  });
});
