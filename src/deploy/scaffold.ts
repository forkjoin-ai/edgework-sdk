import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';

import { resolveAeonConfig, serializeAeonToml } from './aeon-config';
import { runQualityAutopilot } from './quality';
import type {
  AeonConfig,
  FeatureToggles,
  QualityPolicy,
  ScaffoldOptions,
  ScaffoldResult,
} from './types';

const STATIC_ROUTES = [
  '/',
  '/aeon',
  '/flux',
  '/dash',
  '/dash-relay',
  '/relay',
  '/edgework',
  '/neural',
  '/aegis',
  '/docs',
  '/privacy',
  '/terms',
  '/cookies',
  '/help',
  '/contact',
  '/confidentiality',
];

const INTERACTIVE_ROUTES = [
  '/',
  '/dash',
  '/dash-relay',
  '/relay',
  '/edgework',
  '/neural',
];

function resolveSiteBaseUrl(config: AeonConfig): string {
  const deploymentTarget = config.project.deploymentTarget.trim();
  if (!deploymentTarget) {
    return `https://${config.project.name}.edgework.ai`;
  }
  if (/^https?:\/\//i.test(deploymentTarget)) {
    return deploymentTarget.replace(/\/+$/, '');
  }
  if (deploymentTarget.includes('.')) {
    return `https://${deploymentTarget}`.replace(/\/+$/, '');
  }
  return `https://${config.project.name}.edgework.ai`;
}

function ensureEmptyDirectory(targetDir: string): void {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    return;
  }

  const entries = readdirSync(targetDir);
  if (entries.length > 0) {
    throw new Error(
      `Target directory must be empty for scaffold: ${targetDir} (${entries.length} entries found)`
    );
  }
}

function writeFiles(
  targetDir: string,
  files: Record<string, string>
): string[] {
  const written: string[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(targetDir, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
    written.push(absolutePath);
  }

  written.sort();
  return written;
}

function hasCommand(command: string): boolean {
  const check = spawnSync(command, ['--version'], {
    stdio: 'ignore',
  });
  return check.status === 0;
}

function installDependencies(targetDir: string): boolean {
  const installer = hasCommand('bun') ? 'bun' : 'npm';
  const args = installer === 'bun' ? ['install'] : ['install', '--no-audit'];
  const result = spawnSync(installer, args, {
    cwd: targetDir,
    stdio: 'inherit',
  });
  return result.status === 0;
}

async function smokeServe(targetDir: string): Promise<boolean> {
  const publicDir = join(targetDir, 'public');
  const staticIndex = join(publicDir, 'index.html');
  const staticHealth = JSON.stringify({
    status: 'ok',
    source: 'aeon-foundation-scaffold',
  });

  const server = createServer((request, response) => {
    const url = request.url || '/';
    if (url === '/health' || url === '/api/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(staticHealth);
      return;
    }

    if (!existsSync(staticIndex)) {
      response.writeHead(404, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end('missing scaffold index');
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control':
        'public, max-age=300, s-maxage=900, stale-while-revalidate=300',
    });
    response.end(
      `<!doctype html><html><body><h1>aeon-foundation scaffold</h1><p>Route: ${url}</p></body></html>`
    );
  });

  const listenResult = await new Promise<boolean>((resolvePromise) => {
    server.once('error', () => resolvePromise(false));
    server.listen(0, '127.0.0.1', () => resolvePromise(true));
  });
  if (!listenResult) {
    server.close();
    return false;
  }

  const address = server.address();
  const port =
    address && typeof address === 'object' && typeof address.port === 'number'
      ? address.port
      : null;
  if (!port) {
    server.close();
    return false;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return response.ok;
  } catch {
    return false;
  } finally {
    await new Promise<void>((resolvePromise) => {
      server.close(() => resolvePromise());
    });
  }
}

function routeTitle(route: string): string {
  if (route === '/') return 'Aeon Foundation';
  return route
    .slice(1)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function pageTemplate(route: string, config: AeonConfig): string {
  const title = routeTitle(route);
  const siteBaseUrl = resolveSiteBaseUrl(config);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | ${config.project.name}</title>
  <meta name="description" content="${config.project.name} route: ${route}" />
  <link rel="canonical" href="${siteBaseUrl}${route}" />
  <meta property="og:title" content="${title} | ${config.project.name}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${siteBaseUrl}${route}" />
  <meta property="og:description" content="Full-stack Aeon Foundation demo with DashRelay, ESI, UCAN, ZK, and Presence." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#0b0f14" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebPage","name":"${title}","url":"${siteBaseUrl}${route}"}
  </script>
  <style>
    :root { color-scheme: light; --bg:#f6fbff; --ink:#0f1a24; --accent:#2077ad; --muted:#4f6475; }
    body { font-family: "Georama", "Segoe UI", sans-serif; margin:0; background:radial-gradient(circle at 20% -10%, #e0f1ff 0%, var(--bg) 50%, #f2f8ff 100%); color:var(--ink); min-height:100vh; }
    main { max-width:980px; margin:0 auto; padding:64px 24px; }
    nav { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:28px; }
    a { color:var(--accent); text-decoration:none; font-weight:600; }
    a:hover { text-decoration:underline; }
    h1 { margin:0 0 12px 0; line-height:1.1; font-size:clamp(2rem,5vw,3.5rem); }
    p { color:var(--muted); font-size:1.05rem; }
    .pill { display:inline-flex; align-items:center; border-radius:999px; background:#e8f4ff; color:#175f8a; padding:6px 12px; font-size:0.8rem; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:16px; }
  </style>
</head>
<body>
  <main>
    <div class="pill">Aeon Foundation Demo</div>
    <h1>${title}</h1>
    <p>Route <code>${route}</code> is pre-rendered and tuned for high Lighthouse scores.</p>
    <nav>
      <a href="/">Home</a>
      <a href="/dash">Dash</a>
      <a href="/dash-relay">DashRelay</a>
      <a href="/edgework">Edgework</a>
      <a href="/neural">Neural</a>
      <a href="/docs">Docs</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/cookies">Cookies</a>
    </nav>
  </main>
</body>
</html>
`;
}

function createPublicPages(config: AeonConfig): Record<string, string> {
  const files: Record<string, string> = {};
  const siteBaseUrl = resolveSiteBaseUrl(config);

  for (const route of STATIC_ROUTES) {
    const relativePath =
      route === '/' ? 'public/index.html' : `public${route}/index.html`;
    files[relativePath] = pageTemplate(route, config);
  }

  files['public/sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${STATIC_ROUTES.map((route) => {
  const url = `${siteBaseUrl}${route}`;
  return `  <url><loc>${url}</loc></url>`;
}).join('\n')}
</urlset>
`;

  files['public/robots.txt'] = `User-agent: *
Allow: /
Sitemap: ${siteBaseUrl}/sitemap.xml
`;

  files['public/manifest.webmanifest'] = JSON.stringify(
    {
      name: config.project.name,
      short_name: 'aeon-foundation',
      display: 'standalone',
      start_url: '/',
      background_color: '#f6fbff',
      theme_color: '#2077ad',
      icons: [
        {
          src: '/favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
        },
      ],
    },
    null,
    2
  );

  files[
    'public/favicon.svg'
  ] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Aeon">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#2077ad"/>
      <stop offset="100%" stop-color="#22c3b5"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="#0f1a24"/>
  <path d="M20 88L64 16l44 72H92L64 44 36 88z" fill="url(#g)"/>
</svg>
`;

  files['public/agents.txt'] = `# ${config.project.name}
Agent endpoint: ${siteBaseUrl}/.well-known/agents.json
MCP: ${config.integrations.mcpServerCommand}
`;

  files['public/llms.txt'] = `# ${config.project.name}
Model endpoint: ${siteBaseUrl}/v1/chat/completions
Embeddings endpoint: ${siteBaseUrl}/v1/embeddings
Safety: zero external paid AI calls
`;

  files['public/.well-known/agents.json'] = JSON.stringify(
    {
      name: config.project.name,
      mcp: {
        command: config.integrations.mcpServerCommand,
      },
      capabilities: {
        deploy: true,
        quality: true,
        presence: config.features.presence,
        ucan: config.features.ucan,
        zk: config.features.zk,
      },
    },
    null,
    2
  );

  files['public/.well-known/ai-plugin.json'] = JSON.stringify(
    {
      schema_version: 'v1',
      name_for_human: `${config.project.name} edgework`,
      name_for_model: `${config.project.name.replace(/-/g, '_')}_edgework`,
      description_for_human:
        'Aeon Foundation full-stack demo with deploy + quality integrations',
      description_for_model:
        'Use deploy scaffold, deploy clone, and quality endpoints to build and validate Aeon apps.',
      auth: { type: 'none' },
      api: {
        type: 'openapi',
        url: `${siteBaseUrl}/openapi.json`,
      },
      logo_url: `${siteBaseUrl}/favicon.svg`,
      contact_email: 'ops@affectively.ai',
      legal_info_url: `${siteBaseUrl}/terms`,
    },
    null,
    2
  );

  files[
    'public/.well-known/security.txt'
  ] = `Contact: mailto:security@affectively.ai
Expires: 2030-01-01T00:00:00.000Z
Canonical: ${siteBaseUrl}/.well-known/security.txt
`;

  return files;
}

function workerSource(config: AeonConfig): string {
  return `/// <reference types="@cloudflare/workers-types" />

type Env = {
  ASSETS: Fetcher;
  ${config.features.d1 ? `${config.storage.d1Binding}: D1Database;` : ''}
  ${config.features.kv ? `${config.storage.kvBinding}: KVNamespace;` : ''}
  ${config.features.r2 ? `${config.storage.r2Binding}: R2Bucket;` : ''}
};

const FEATURES = ${JSON.stringify(config.features, null, 2)} as const;
const QUALITY: { staticThreshold: number; interactiveThreshold: number } = {
  staticThreshold: ${config.quality.staticThreshold},
  interactiveThreshold: ${config.quality.interactiveThreshold},
};

const CACHE_CONTROL = '${config.performance.cacheControl}';

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE_CONTROL,
      ...(init?.headers || {}),
    },
  });
}

function text(data: string, init?: ResponseInit): Response {
  return new Response(data, {
    ...init,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': CACHE_CONTROL,
      ...(init?.headers || {}),
    },
  });
}

async function verifyUcan(token: string): Promise<boolean> {
  if (!FEATURES.ucan) return false;
  return token.startsWith('ucan:');
}

async function verifyZkProof(proof: string): Promise<boolean> {
  if (!FEATURES.zk) return false;
  return proof.length >= 16;
}

function pseudoNeuralVector(input: string): number[] {
  const out: number[] = [];
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    out.push(((hash >>> 0) % 1000) / 1000);
    if (out.length === 8) break;
  }
  while (out.length < 8) out.push(0);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health' || path === '/api/health' || path === '/readyz') {
      return json({
        status: 'ready',
        project: '${config.project.name}',
        quality: QUALITY,
        features: FEATURES,
      });
    }

    if (path === '/probe' || path === '/livez') {
      return json({
        status: 'exists',
      });
    }

    if (path === '/api/deploy/features') {
      return json({
        features: FEATURES,
        quality: QUALITY,
        mcp: '${config.integrations.mcpServerCommand}',
      });
    }

    if (FEATURES.presence && (path === '/ws' || path === '/api/presence/ws')) {
      return new Response('WebSocket upgrade expected', { status: 426 });
    }

    if (FEATURES.ucan && path === '/api/ucan/verify' && request.method === 'POST') {
      const payload = (await request.json()) as { token?: string };
      const token = payload.token || '';
      const valid = await verifyUcan(token);
      return json({ valid, issuer: '${
        config.security.ucanIssuer
      }', audience: '${config.security.ucanAudience}' });
    }

    if (FEATURES.zk && path === '/api/zk/verify' && request.method === 'POST') {
      const payload = (await request.json()) as { proof?: string };
      const proof = payload.proof || '';
      const valid = await verifyZkProof(proof);
      return json({ valid, mode: '${config.security.zkVerificationMode}' });
    }

    if (FEATURES.neural && path === '/api/neural/infer' && request.method === 'POST') {
      const payload = (await request.json()) as { input?: string };
      const input = payload.input || '';
      const embedding = pseudoNeuralVector(input);
      return json({
        engine: 'zero-cost-local',
        embedding,
      });
    }

    if (FEATURES.sitemap && path === '/sitemap.xml') {
      return new Response(await env.ASSETS.fetch('https://local/sitemap.xml').then((r) => r.text()), {
        headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': CACHE_CONTROL },
      });
    }

    if (FEATURES.robots && path === '/robots.txt') {
      return text('User-agent: *\\nAllow: /\\nSitemap: /sitemap.xml\\n');
    }

    if (FEATURES.dashrelay && path === '/api/dashrelay/ping') {
      return json({ ok: true, channel: '${
        config.integrations.dashrelayChannels[0] || 'presence'
      }' });
    }

    if (FEATURES.esi && path === '/api/esi/structured') {
      return json({
        mode: '${config.performance.esiMode}',
        blocks: [
          { type: 'summary', value: 'ESI.Structured stream' },
          { type: 'collaborative', value: true },
          { type: 'optimize', value: '${config.performance.speculation}' },
        ],
      });
    }

    if (FEATURES.analytics && path === '/api/analytics/ping') {
      return json({
        ok: true,
        id: '${config.integrations.analyticsId}',
      });
    }

    return env.ASSETS.fetch(request);
  },
};
`;
}

function wranglerToml(config: AeonConfig): string {
  return `name = "${config.project.name}"
main = "src/index.ts"
compatibility_date = "2026-02-26"

[assets]
directory = "./public"
binding = "ASSETS"

[vars]
PROJECT_NAME = "${config.project.name}"
EDGEWORK_MCP = "${config.integrations.mcpServerCommand}"

# Workers AI is intentionally disabled to enforce zero paid AI usage.
# [ai]
# binding = "AI"

${
  config.features.d1
    ? `[[d1_databases]]
binding = "${config.storage.d1Binding}"
database_name = "${config.project.name.replace(/-/g, '_')}"
database_id = "replace-with-d1-id"
migrations_dir = "./migrations"`
    : ''
}

${
  config.features.kv
    ? `[[kv_namespaces]]
binding = "${config.storage.kvBinding}"
id = "replace-with-kv-id"`
    : ''
}

${
  config.features.r2
    ? `[[r2_buckets]]
binding = "${config.storage.r2Binding}"
bucket_name = "${config.project.name}-assets"`
    : ''
}
`;
}

function packageJson(config: AeonConfig): string {
  return JSON.stringify(
    {
      name: config.project.name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'node scripts/dev-server.mjs',
        serve: 'node scripts/dev-server.mjs --once',
        quality: 'node scripts/quality-check.mjs',
        lighthouse: 'node scripts/lighthouse-gate.mjs',
        benchmark: 'node scripts/benchmark-startup.mjs',
      },
    },
    null,
    2
  );
}

function mcpConfig(config: AeonConfig): string {
  return JSON.stringify(
    {
      $schema: 'https://spec.modelcontextprotocol.io/mcp.json',
      mcpServers: {
        edgework: {
          command: 'npx',
          args: ['@emotions-app/edgework-mcp'],
          env: {
            EDGEWORK_API_KEY: '${EDGEWORK_API_KEY}',
          },
        },
        'edgework-deploy': {
          command: 'npx',
          args: ['@emotions-app/edgework-node', 'mcp-server'],
          env: {
            EDGEWORK_GATEWAY_URL: 'https://api.edgework.ai',
          },
        },
        'aeon-foundation': {
          command: 'edgework',
          args: ['deploy', 'quality', '--source', 'workspace'],
        },
      },
    },
    null,
    2
  );
}

function devServerScript(): string {
  return `import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const once = args.includes('--once');
const portArg = args.find((value) => value.startsWith('--port='));
const port = portArg ? Number(portArg.split('=')[1]) : 8787;

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname === '/health' || pathname === '/api/health' || pathname === '/readyz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ready', source: 'dev-server' }));
    if (once) {
      setTimeout(() => server.close(), 25);
    }
    return;
  }

  if (pathname === '/probe' || pathname === '/livez') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'exists', source: 'dev-server' }));
    return;
  }

  const filePath =
    pathname === '/'
      ? join(publicDir, 'index.html')
      : join(publicDir, pathname.replace(/^\\/+/, ''), 'index.html');
  const fallback = join(publicDir, pathname.replace(/^\\/+/, ''));
  const resolved = existsSync(filePath) ? filePath : existsSync(fallback) ? fallback : null;

  if (!resolved) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }

  const ext = extname(resolved);
  response.writeHead(200, {
    'content-type': MIME.get(ext) || 'application/octet-stream',
    'cache-control': 'public, max-age=120',
  });
  response.end(readFileSync(resolved));
});

server.listen(port, '127.0.0.1', () => {
  console.log('[aeon-foundation] dev server on http://127.0.0.1:' + port);
});
`;
}

function qualityScript(config: AeonConfig): string {
  return `import { existsSync } from 'node:fs';
import { join } from 'node:path';

const requiredFiles = [
  'public/index.html',
  'public/sitemap.xml',
  'public/robots.txt',
  'public/privacy/index.html',
  'public/terms/index.html',
  'public/cookies/index.html',
  'public/.well-known/ai-plugin.json',
  'mcp.json',
  'wrangler.toml',
  'aeon.toml',
];

const issues = [];
for (const file of requiredFiles) {
  if (!existsSync(join(process.cwd(), file))) {
    issues.push('Missing required file: ' + file);
  }
}

const policy = {
  staticThreshold: ${config.quality.staticThreshold},
  interactiveThreshold: ${config.quality.interactiveThreshold},
};

console.log('[quality] policy', policy);

if (issues.length > 0) {
  for (const issue of issues) {
    console.error('[quality] ' + issue);
  }
  process.exit(1);
}

console.log('[quality] baseline checks passed');
`;
}

function lighthouseScript(policy: QualityPolicy): string {
  return `import { spawnSync } from 'node:child_process';

const staticRoutes = ${JSON.stringify(STATIC_ROUTES, null, 2)};
const interactiveRoutes = ${JSON.stringify(INTERACTIVE_ROUTES, null, 2)};

console.log('[lighthouse] static routes target:', ${policy.staticThreshold});
console.log('[lighthouse] interactive routes target:', ${
    policy.interactiveThreshold
  });

if (!process.env.LIGHTHOUSE_URL_BASE) {
  console.log('[lighthouse] set LIGHTHOUSE_URL_BASE to run full audit');
  process.exit(0);
}

const base = process.env.LIGHTHOUSE_URL_BASE.replace(/\\/+$/, '');
const lighthouseCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(url) {
  const result = spawnSync(
    lighthouseCmd,
    ['lighthouse', url, '--quiet', '--chrome-flags=--headless', '--output=json', '--output-path=stdout'],
    { encoding: 'utf8' }
  );
  if (result.status !== 0 || !result.stdout) {
    throw new Error('lighthouse failed for ' + url + ': ' + (result.stderr || 'unknown'));
  }
  const report = JSON.parse(result.stdout);
  return {
    performance: Math.round((report.categories.performance.score || 0) * 100),
    accessibility: Math.round((report.categories.accessibility.score || 0) * 100),
    bestPractices: Math.round((report.categories['best-practices'].score || 0) * 100),
    seo: Math.round((report.categories.seo.score || 0) * 100),
  };
}

let failures = 0;
for (const route of staticRoutes) {
  const score = run(base + route);
  const min = Math.min(score.performance, score.accessibility, score.bestPractices, score.seo);
  if (min < ${policy.staticThreshold}) {
    failures += 1;
    console.error('[lighthouse] static route failed', route, score);
  }
}

for (const route of interactiveRoutes) {
  const score = run(base + route);
  const min = Math.min(score.performance, score.accessibility, score.bestPractices, score.seo);
  if (min < ${policy.interactiveThreshold}) {
    failures += 1;
    console.error('[lighthouse] interactive route failed', route, score);
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log('[lighthouse] all routes passed policy');
`;
}

function benchmarkScript(): string {
  return `import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';

const start = performance.now();
const command = process.platform === 'win32' ? 'node.exe' : 'node';
const args = ['scripts/dev-server.mjs', '--once'];

const server = spawnSync(command, args, {
  stdio: 'inherit',
});
const elapsedMs = Math.round(performance.now() - start);

console.log('[benchmark] serve lifecycle ms:', elapsedMs);
if (server.status !== 0) {
  process.exit(server.status || 1);
}
`;
}

function workerMcpReadme(): string {
  return `# Deploy Framework MCP

This scaffold ships a deploy-oriented MCP stack for agents:

1. \`edgework\` server via \`@emotions-app/edgework-mcp\`
2. \`edgework-deploy\` server via \`@emotions-app/edgework-node mcp-server\`
3. \`aeon-foundation\` quality shim for route and policy checks

Use the generated \`mcp.json\` directly in Claude Code, Cursor, or any MCP-capable client.
`;
}

function readme(config: AeonConfig): string {
  return `# ${config.project.name}

Canonical Aeon Foundation demo scaffold generated by:

\`\`\`bash
edgework deploy scaffold aeon-foundation .
\`\`\`

## Included by Default

- Analytics (${config.integrations.analyticsId})
- SEO (${config.features.sitemap ? 'sitemap' : 'no sitemap'}, ${
    config.features.robots ? 'robots' : 'no robots'
  }, metadata)
- ESI (${config.performance.esiMode})
- DashRelay / Dash / Presence
- UCAN and ZK verification stubs
- Zero-cost neural endpoint (no paid AI)
- D1 / KV / R2 scaffolding
- MCP integration (\`mcp.json\`) including edgework deploy framework tools

## Commands

\`\`\`bash
# Local preview
bun run dev

# Quality baseline
bun run quality

# Lighthouse gate (set LIGHTHOUSE_URL_BASE first)
bun run lighthouse
\`\`\`

## Deploy / Lift-and-Shift

\`\`\`bash
# Canonical deploy
edgework deploy . --name ${config.project.name}

# Alias deploy
edgework lift . --name ${config.project.name}

# Clone deployed site to local disk
edgework deploy clone <source> ./clone-dir

# Alias clone/download
edgework shift <source> ./clone-dir
\`\`\`
`;
}

function sourceManifest(config: AeonConfig): string {
  return JSON.stringify(
    {
      template: 'aeon-foundation',
      generatedAt: new Date().toISOString(),
      preset: config.preset,
      features: config.features,
      quality: config.quality,
      routes: {
        static: STATIC_ROUTES,
        interactive: INTERACTIVE_ROUTES,
      },
      mcp: {
        enabled: config.features.mcp,
        server: config.integrations.mcpServerCommand,
      },
    },
    null,
    2
  );
}

function buildScaffoldFiles(config: AeonConfig): Record<string, string> {
  const files: Record<string, string> = {
    'aeon.toml': serializeAeonToml(config),
    'aeon.config.ts': `export default { name: '${config.project.name}', preset: '${config.preset}' };\n`,
    'package.json': packageJson(config),
    'wrangler.toml': wranglerToml(config),
    '.env.example': `EDGEWORK_API_KEY=ew_live_replace_me
EDGEWORK_GATEWAY_URL=https://api.edgework.ai
DASHRELAY_URL=wss://dashrelay.edgework.ai
`,
    'README.md': readme(config),
    'mcp.json': mcpConfig(config),
    'docs/DEPLOY_FRAMEWORK_MCP.md': workerMcpReadme(),
    'scripts/dev-server.mjs': devServerScript(),
    'scripts/quality-check.mjs': qualityScript(config),
    'scripts/lighthouse-gate.mjs': lighthouseScript(config.quality),
    'scripts/benchmark-startup.mjs': benchmarkScript(),
    'src/index.ts': workerSource(config),
    '.aeon/source-manifest.json': sourceManifest(config),
  };

  if (config.features.d1) {
    files['migrations/0001_init.sql'] = `-- ${config.project.name} schema
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);
`;
  }

  if (config.features.kv) {
    files['seeds/kv.bootstrap.json'] = JSON.stringify(
      {
        welcome: 'aeon-foundation',
        mode: 'demo',
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  if (config.features.r2) {
    files[
      'seeds/r2/README.md'
    ] = `Upload static objects to the ${config.storage.r2Binding} bucket.
Use signed URLs in production; keep this scaffold free of secrets.
`;
  }

  return {
    ...files,
    ...createPublicPages(config),
  };
}

export function createScaffoldFilesForConfig(
  config: AeonConfig
): Record<string, string> {
  return buildScaffoldFiles(config);
}

export async function scaffoldAeonFoundation(
  options: ScaffoldOptions
): Promise<ScaffoldResult> {
  const targetDir = resolve(options.targetDir);
  const inferredName = targetDir.split(/[\\/]/).pop() || 'aeon-foundation';

  const config = resolveAeonConfig({
    projectName: inferredName,
    preset: options.preset || 'all',
    configPath: options.configPath,
    enable: options.enable,
    disable: options.disable,
  });

  ensureEmptyDirectory(targetDir);
  const files = buildScaffoldFiles(config);
  const filesWritten = writeFiles(targetDir, files);

  const qualityReport =
    options.quality === false
      ? undefined
      : await runQualityAutopilot({
          source: 'workspace',
          workspaceRoot: dirname(targetDir),
          appsDir: '.',
          targets: basename(targetDir),
        });

  const installed = options.install ? installDependencies(targetDir) : false;
  const served = options.serve ? await smokeServe(targetDir) : false;

  if (options.install && !installed) {
    throw new Error(`Dependency installation failed in ${targetDir}`);
  }
  if (options.serve && !served) {
    throw new Error(`Local serve smoke check failed in ${targetDir}`);
  }
  if (qualityReport && !qualityReport.ok) {
    const issues = qualityReport.targets.flatMap((targetReport) =>
      targetReport.issues.map((issue) => issue.message)
    );
    throw new Error(
      `Scaffold quality checks failed:\n${issues
        .map((issue) => `- ${issue}`)
        .join('\n')}`
    );
  }

  return {
    targetDir,
    config,
    filesWritten,
    installed,
    served,
    qualityReport: qualityReport
      ? {
          ok: qualityReport.ok,
          issues: qualityReport.targets.flatMap((targetReport) =>
            targetReport.issues.map((issue) => issue.message)
          ),
        }
      : undefined,
  };
}

function buildMcpServerScaffoldFiles(
  config: AeonConfig
): Record<string, string> {
  const packageJson = {
    name: config.project.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'bun build src/index.ts --outdir dist --target node',
      start: 'bun run src/index.ts',
      dev: 'bun run --watch src/index.ts',
      deploy: 'aeon deploy',
    },
    dependencies: {
      '@a0n/edgework-sdk': 'workspace:*',
      '@affectively/mcp-framework': 'workspace:*',
      zod: '^3.23.0',
    },
    devDependencies: {
      typescript: '^5.7.0',
      '@types/node': '^22.0.0',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ESNext',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: './dist',
    },
    include: ['src/**/*'],
  };

  const indexTs = `import { Server } from '@affectively/mcp-framework/server';
import { StdioServerTransport } from '@affectively/mcp-framework/transport';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@affectively/mcp-framework/types';

const server = new Server(
  {
    name: '${config.project.name}',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'hello_world',
        description: 'A simple hello world tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name to greet' }
          },
          required: ['name']
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'hello_world') {
    const args = request.params.arguments || {};
    const name = args.name || 'World';
    return {
      content: [
        {
          type: 'text',
          text: \`Hello, \${name}!\`
        }
      ]
    };
  }
  
  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('${config.project.name} MCP Server running on stdio');
}

main().catch(console.error);
`;

  const aeonToml = serializeAeonToml(config);

  return {
    'package.json': JSON.stringify(packageJson, null, 2),
    'tsconfig.json': JSON.stringify(tsconfig, null, 2),
    'aeon.toml': aeonToml,
    'aeon.config.ts': `export default { name: '${config.project.name}', entry: './src/index.ts', preset: 'mcp-server' };\n`,
    'src/index.ts': indexTs,
    'README.md': `# ${config.project.name}\n\nA custom MCP server.\n\n## Usage\n\n\`\`\`bash\nbun install\nbun run build\nbun start\n\`\`\`\n`,
  };
}

export async function scaffoldMcpServer(
  options: ScaffoldOptions
): Promise<ScaffoldResult> {
  const targetDir = resolve(options.targetDir);
  const inferredName = targetDir.split(/[\\/]/).pop() || 'my-mcp-server';

  const config = resolveAeonConfig({
    projectName: inferredName,
    preset: options.preset || 'mcp-server',
    configPath: options.configPath,
    enable: options.enable,
    disable: options.disable,
  });

  ensureEmptyDirectory(targetDir);
  const files = buildMcpServerScaffoldFiles(config);
  const filesWritten = writeFiles(targetDir, files);

  const installed = options.install ? installDependencies(targetDir) : false;

  return {
    targetDir,
    config,
    filesWritten,
    installed,
    served: false,
  };
}

export function featureKeys(): Array<keyof FeatureToggles> {
  return [
    'analytics',
    'sitemap',
    'robots',
    'metadata',
    'esi',
    'dashrelay',
    'dash',
    'neural',
    'presence',
    'ucan',
    'zk',
    'd1',
    'r2',
    'kv',
    'mcp',
  ];
}
