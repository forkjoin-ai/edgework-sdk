import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { runQualityAutopilot } from '../deploy/quality';

function createWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'edgework-quality-'));
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('quality autopilot', () => {
  let workspace: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    workspace = createWorkspace();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(workspace, { recursive: true, force: true });
  });

  it('flags missing linked legal page implementations', async () => {
    const appDir = join(workspace, 'apps', 'demo');
    writeFile(join(appDir, 'aeon.config.ts'), 'export default {};\n');
    writeFile(
      join(appDir, 'src', 'worker.ts'),
      `
      type PageRoute = { rootId: string };
      const PAGE_ROUTES: Record<string, PageRoute> = {
        '/terms': { rootId: 'terms-root' },
      };
      export default {};
      `
    );
    writeFile(
      join(appDir, 'src', 'client', 'index.tsx'),
      `export const roots = { 'home-root': true };`
    );
    writeFile(
      join(appDir, 'src', 'client', 'nav.tsx'),
      `export const Nav = () => <a href="/terms">Terms</a>;`
    );

    const report = await runQualityAutopilot({
      workspaceRoot: workspace,
      source: 'workspace',
      paths: '/terms',
    });

    expect(report.ok).toBe(false);
    const issues = report.targets[0]?.issues ?? [];
    expect(
      issues.some((issue) => issue.code === 'missing-path-implementation')
    ).toBe(true);
    expect(issues.some((issue) => issue.code === 'missing-client-root')).toBe(
      true
    );
  });

  it('passes when sitemap and robots are implemented as public files', async () => {
    const appDir = join(workspace, 'apps', 'seo-demo');
    writeFile(join(appDir, 'aeon.config.ts'), 'export default {};\n');
    writeFile(join(appDir, 'public', 'sitemap.xml'), '<urlset></urlset>\n');
    writeFile(
      join(appDir, 'public', 'robots.txt'),
      'User-agent: *\nAllow: /\n'
    );

    const report = await runQualityAutopilot({
      workspaceRoot: workspace,
      source: 'workspace',
      paths: '/sitemap.xml,/robots.txt',
    });

    expect(report.ok).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it('recognizes src/index.ts worker routes and sitemap-derived custom paths', async () => {
    const appDir = join(workspace, 'apps', 'route-demo');
    writeFile(join(appDir, 'aeon.config.ts'), 'export default {};\n');
    writeFile(
      join(appDir, 'src', 'index.ts'),
      `
      const ROUTES = ['/terms', '/privacy', '/vision'];
      export default {
        fetch(request: Request): Response {
          const path = new URL(request.url).pathname;
          if (ROUTES.includes(path)) {
            return new Response('ok');
          }
          return new Response('missing', { status: 404 });
        },
      };
      `
    );
    writeFile(join(appDir, 'public', 'terms', 'index.html'), '<h1>Terms</h1>');
    writeFile(
      join(appDir, 'public', 'privacy', 'index.html'),
      '<h1>Privacy</h1>'
    );
    writeFile(
      join(appDir, 'public', 'vision', 'index.html'),
      '<h1>Vision</h1>'
    );
    writeFile(
      join(appDir, 'public', 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://route-demo.edgework.ai/vision</loc></url></urlset>`
    );
    writeFile(
      join(appDir, 'public', 'robots.txt'),
      'User-agent: *\nAllow: /\n'
    );

    const report = await runQualityAutopilot({
      workspaceRoot: workspace,
      source: 'workspace',
      targets: 'route-demo',
      paths: '/terms,/privacy,/sitemap.xml,/robots.txt,/vision',
    });

    expect(report.ok).toBe(true);
    const target = report.targets[0];
    expect(target).toBeDefined();
    expect(
      target?.pathResults.some((pathStatus) => pathStatus.path === '/vision')
    ).toBe(true);
    expect(
      (target?.issues || []).some(
        (issue) => issue.code === 'missing-worker-route'
      )
    ).toBe(false);
  });

  it('fails smoke checks on non-2xx path responses', async () => {
    const appDir = join(workspace, 'apps', 'smoke-demo');
    writeFile(join(appDir, 'aeon.config.ts'), 'export default {};\n');
    writeFile(
      join(appDir, 'app', 'terms', 'page.tsx'),
      'export default function Page(){return null;}\n'
    );

    globalThis.fetch = jest.fn(async (url: string | URL) => {
      const resolved = String(url);
      if (resolved.endsWith('/')) {
        return new Response('<html>ok</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response('not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }) as unknown as typeof globalThis.fetch;

    const report = await runQualityAutopilot({
      workspaceRoot: workspace,
      source: 'workspace',
      paths: '/terms',
      smoke: true,
      processUrlByName: {
        'smoke-demo': 'https://smoke-demo.test',
      },
      smokeTimeoutMs: 2000,
    });

    expect(report.ok).toBe(false);
    const issues = report.targets[0]?.issues ?? [];
    expect(issues.some((issue) => issue.code === 'smoke-path-failed')).toBe(
      true
    );
  });
});
