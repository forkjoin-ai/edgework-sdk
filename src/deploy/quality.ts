import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
  createEdgeworkAuthHeader,
  resolveEdgeworkApiKey,
} from '../edgework-api-key';
import type {
  GatewayQualityTarget,
  QualityAutopilotOptions,
  QualityAutopilotReport,
  QualityIssue,
  QualityIssueCode,
  QualityIssueSeverity,
  QualityPathSpec,
  QualityPathSmokeResult,
  QualityPathStatus,
  QualitySmokeOptions,
  QualityTarget,
  QualityTargetReport,
  QualityTargetSource,
  SitePathSmokeTestOptions,
  SitePathSmokeTestResult,
} from './types';

type WorkerStatus = 'yes' | 'no' | 'n/a';
type ClientStatus = 'yes' | 'no' | 'n/a';

const DEFAULT_GATEWAY_URL = 'https://api.edgework.ai';
const DEFAULT_APPS_DIR = 'apps';
const DEFAULT_SOURCE: QualityTargetSource = 'workspace';

const DEFAULT_PATH_SPECS: QualityPathSpec[] = [
  // Legal/Trust pages
  { path: '/terms', category: 'legal', required: true },
  { path: '/privacy', category: 'legal', required: true },
  { path: '/cookies', category: 'legal', required: true },
  { path: '/help', category: 'legal', required: true },
  { path: '/contact', category: 'legal', required: true },
  { path: '/confidentiality', category: 'legal', required: true },

  // SEO essentials
  { path: '/sitemap.xml', category: 'seo', required: true },
  { path: '/robots.txt', category: 'seo', required: true },

  // Standard app metadata
  { path: '/favicon.ico', category: 'icon', required: false },
  { path: '/favicon.svg', category: 'icon', required: false },
  { path: '/apple-touch-icon.png', category: 'icon', required: false },
  { path: '/site.webmanifest', category: 'manifest', required: false },
  { path: '/manifest.webmanifest', category: 'manifest', required: false },
  { path: '/manifest.json', category: 'manifest', required: false },

  // Agent discovery + LLM metadata
  { path: '/agents.txt', category: 'agent', required: false },
  { path: '/llms.txt', category: 'agent', required: false },
  { path: '/.well-known/agents.json', category: 'agent', required: false },
  { path: '/.well-known/ai-plugin.json', category: 'agent', required: false },

  // Well-known operational files
  {
    path: '/.well-known/security.txt',
    category: 'well-known',
    required: false,
  },
  {
    path: '/.well-known/assetlinks.json',
    category: 'well-known',
    required: false,
  },
  {
    path: '/.well-known/apple-app-site-association',
    category: 'well-known',
    required: false,
  },
];

const SOURCE_OPTIONS = new Set(['workspace', 'gateway', 'all']);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.aeon',
  '.wrangler',
  'coverage',
  'build',
  '.next',
]);

const FILE_EXT_RE = /\.(ts|tsx|js|jsx|html|mdx)$/;

const PAGE_SLUG_RE = /^\/[a-z0-9-]+$/;

export function getDefaultQualityPathSpecs(): QualityPathSpec[] {
  return DEFAULT_PATH_SPECS.map((spec) => ({ ...spec }));
}

function normalizeCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

function normalizeUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolvePathSpecs(options: QualityAutopilotOptions): QualityPathSpec[] {
  const requestedPaths = normalizeUnique([
    ...normalizeCsv(options.paths),
    ...(options.pathSpecs || []).map((spec) => spec.path),
  ]).map(normalizePath);

  const customByPath = new Map<string, QualityPathSpec>();
  for (const spec of options.pathSpecs || []) {
    customByPath.set(normalizePath(spec.path), {
      ...spec,
      path: normalizePath(spec.path),
    });
  }

  const baseSpecs = getDefaultQualityPathSpecs();
  const baseByPath = new Map(baseSpecs.map((spec) => [spec.path, spec]));

  if (requestedPaths.length === 0 && customByPath.size === 0) {
    return baseSpecs;
  }

  const out: QualityPathSpec[] = [];
  for (const path of requestedPaths) {
    const custom = customByPath.get(path);
    if (custom) {
      out.push(custom);
      continue;
    }

    const base = baseByPath.get(path);
    if (base) {
      out.push({ ...base });
      continue;
    }

    out.push({
      path,
      category: 'custom',
      required: false,
      severityWhenMissing: 'warn',
    });
  }

  for (const [path, custom] of customByPath) {
    if (!requestedPaths.includes(path)) {
      out.push(custom);
    }
  }

  return normalizePathSpecs(out);
}

function normalizePathSpecs(specs: QualityPathSpec[]): QualityPathSpec[] {
  const seen = new Set<string>();
  const out: QualityPathSpec[] = [];

  for (const rawSpec of specs) {
    const path = normalizePath(rawSpec.path);
    if (seen.has(path)) continue;
    seen.add(path);

    out.push({
      ...rawSpec,
      path,
      severityWhenMissing:
        rawSpec.severityWhenMissing || (rawSpec.required ? 'error' : 'warn'),
    });
  }

  return out;
}

function parseSitemapPaths(xml: string): string[] {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const paths: string[] = [];
  for (const match of matches) {
    const loc = match[1]?.trim();
    if (!loc) continue;
    try {
      const parsed = new URL(loc);
      paths.push(normalizePath(parsed.pathname));
    } catch {
      if (loc.startsWith('/')) {
        paths.push(normalizePath(loc));
      }
    }
  }
  return normalizeUnique(paths);
}

function extractRouteLiterals(text: string): string[] {
  const routes = new Set<string>();
  const literalRegex = /['"`](\/[a-z0-9\-./]*)['"`]/gi;
  for (const match of text.matchAll(literalRegex)) {
    const candidate = match[1];
    if (!candidate) continue;
    const normalized = normalizePath(candidate);
    if (!normalized.startsWith('/')) continue;
    if (
      normalized.includes('*') ||
      normalized.includes(':') ||
      normalized.includes('{')
    ) {
      continue;
    }
    routes.add(normalized);
  }
  return [...routes];
}

function discoveredPathSpecsForTarget(
  target: QualityTarget,
  baseSpecs: QualityPathSpec[]
): QualityPathSpec[] {
  if (!target.appDir) return baseSpecs;

  const discoveredPaths = new Set<string>();
  const sitemapPath = join(target.appDir, 'public', 'sitemap.xml');
  if (existsSync(sitemapPath)) {
    const sitemapText = safeReadUtf8(sitemapPath);
    for (const path of parseSitemapPaths(sitemapText)) {
      discoveredPaths.add(path);
    }
  }

  const workerEntryCandidates = [
    join(target.appDir, 'src', 'worker.ts'),
    join(target.appDir, 'src', 'worker.js'),
    join(target.appDir, 'src', 'index.ts'),
    join(target.appDir, 'src', 'index.js'),
    join(target.appDir, 'worker.ts'),
    join(target.appDir, 'index.ts'),
  ];
  for (const candidate of workerEntryCandidates) {
    if (!existsSync(candidate)) continue;
    for (const route of extractRouteLiterals(safeReadUtf8(candidate))) {
      if (
        route === '/' ||
        route.startsWith('/api/') ||
        route === '/health' ||
        route.endsWith('/health') ||
        route === '/readyz' ||
        route === '/probe' ||
        route === '/livez' ||
        route.includes('/ws')
      ) {
        continue;
      }
      discoveredPaths.add(route);
    }
  }

  if (discoveredPaths.size === 0) {
    return baseSpecs;
  }

  const extras: QualityPathSpec[] = [...discoveredPaths]
    .filter((path) => !baseSpecs.some((spec) => spec.path === path))
    .map((path) => ({
      path,
      category: 'custom',
      required: false,
      severityWhenMissing: 'warn' as const,
    }));

  return normalizePathSpecs([...baseSpecs, ...extras]);
}

function buildIssue(
  code: QualityIssueCode,
  severity: QualityIssueSeverity,
  message: string,
  details?: {
    path?: string;
    appDir?: string;
    process?: string;
    suggestion?: string;
  }
): QualityIssue {
  return {
    code,
    severity,
    message,
    path: details?.path,
    appDir: details?.appDir,
    process: details?.process,
    suggestion: details?.suggestion,
  };
}

function safeReadUtf8(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function walkFiles(rootDir: string): string[] {
  const out: string[] = [];

  function visit(dir: string): void {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      let isDirectory = false;
      try {
        isDirectory = statSync(fullPath).isDirectory();
      } catch {
        continue;
      }

      if (isDirectory) {
        if (!SKIP_DIRS.has(entry)) {
          visit(fullPath);
        }
        continue;
      }

      if (FILE_EXT_RE.test(entry)) {
        out.push(fullPath);
      }
    }
  }

  visit(rootDir);
  return out;
}

function discoverWorkspaceTargets(
  workspaceRoot: string,
  appsDir: string
): QualityTarget[] {
  const absoluteAppsDir = resolve(workspaceRoot, appsDir);
  let entries: string[] = [];
  try {
    entries = readdirSync(absoluteAppsDir);
  } catch {
    return [];
  }

  const targets: QualityTarget[] = [];

  for (const entry of entries) {
    const appDir = join(absoluteAppsDir, entry);

    let isDir = false;
    try {
      isDir = statSync(appDir).isDirectory();
    } catch {
      continue;
    }

    if (!isDir) continue;

    const configPath = join(appDir, 'aeon.config.ts');
    if (!existsSync(configPath)) continue;

    targets.push({
      name: entry,
      source: 'workspace',
      appDir,
      configPath,
      aeonPid: entry,
    });
  }

  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

interface GatewayListResponse {
  processes?: Array<{
    name?: string;
    cid?: string;
    state?: string;
  }>;
}

async function discoverGatewayTargets(
  options: QualityAutopilotOptions
): Promise<GatewayQualityTarget[]> {
  const gatewayUrl = (options.gatewayUrl || DEFAULT_GATEWAY_URL).replace(
    /\/+$/,
    ''
  );
  const owner = options.owner?.trim();
  const params = new URLSearchParams();
  if (owner) {
    params.set('owner', owner);
  }

  const qs = params.toString();
  const url = `${gatewayUrl}/v1/aeon-deploy/list${qs ? `?${qs}` : ''}`;
  const apiKey = resolveEdgeworkApiKey(options.apiKey);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...createEdgeworkAuthHeader(apiKey),
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway list failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as GatewayListResponse;
  const processes = Array.isArray(payload.processes) ? payload.processes : [];

  const targets: GatewayQualityTarget[] = [];
  for (const process of processes) {
    const name = process.name?.trim();
    if (!name) continue;

    targets.push({
      name,
      source: 'gateway',
      aeonPid: name,
      cid: process.cid,
      state: process.state,
    });
  }

  targets.sort((a, b) => a.name.localeCompare(b.name));
  return targets;
}

function mergeTargets(
  workspaceTargets: QualityTarget[],
  gatewayTargets: GatewayQualityTarget[]
): QualityTarget[] {
  const out = new Map<string, QualityTarget>();

  for (const target of workspaceTargets) {
    out.set(target.name, { ...target });
  }

  for (const target of gatewayTargets) {
    const existing = out.get(target.name);
    if (!existing) {
      out.set(target.name, { ...target });
      continue;
    }

    out.set(target.name, {
      ...existing,
      source:
        existing.source === 'workspace' ? 'workspace+gateway' : existing.source,
      cid: target.cid || existing.cid,
      state: target.state || existing.state,
      aeonPid: target.aeonPid || existing.aeonPid,
    });
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function applyTargetFilters(
  targets: QualityTarget[],
  options: QualityAutopilotOptions
): QualityTarget[] {
  const includeSet = new Set(
    normalizeCsv(options.targets).map((v) => v.trim())
  );
  const excludeSet = new Set(
    normalizeCsv(options.excludeTargets).map((v) => v.trim())
  );

  return targets.filter((target) => {
    if (includeSet.size > 0 && !includeSet.has(target.name)) {
      return false;
    }
    if (excludeSet.has(target.name)) {
      return false;
    }
    return true;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countPathLinks(files: string[], path: string): number {
  const quoteClass = '["\'`]';
  const escapedPath = escapeRegex(path);
  const linkRegex = new RegExp(
    `${quoteClass}${escapedPath}(?:${quoteClass}|[/?#])`,
    'g'
  );

  let total = 0;
  for (const file of files) {
    const text = safeReadUtf8(file);
    if (!text) continue;
    const matches = text.match(linkRegex);
    if (matches) {
      total += matches.length;
    }
  }

  return total;
}

function pageCandidates(appDir: string, slug: string): string[] {
  return [
    join(appDir, 'public', slug, 'index.html'),
    join(appDir, 'public', `${slug}.html`),
    join(appDir, 'app', slug, 'page.tsx'),
    join(appDir, 'app', slug, 'page.ts'),
    join(appDir, 'app', slug, 'page.jsx'),
    join(appDir, 'app', slug, 'page.js'),
    join(appDir, 'src', 'app', slug, 'page.tsx'),
    join(appDir, 'src', 'app', slug, 'page.ts'),
    join(appDir, 'src', 'app', slug, 'page.jsx'),
    join(appDir, 'src', 'app', slug, 'page.js'),
    join(appDir, 'src', 'pages', `${slug}.tsx`),
    join(appDir, 'src', 'pages', `${slug}.ts`),
    join(appDir, 'src', 'pages', `${slug}.jsx`),
    join(appDir, 'src', 'pages', `${slug}.js`),
    join(appDir, 'client', 'pages', `${slug}.tsx`),
    join(appDir, 'client', 'pages', `${slug}.ts`),
    join(appDir, 'client', 'pages', `${slug}.jsx`),
    join(appDir, 'client', 'pages', `${slug}.js`),
  ];
}

function routeFileCandidates(appDir: string, path: string): string[] {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0) return [];

  const appRouteBase = join(appDir, 'app', ...parts, 'route');
  const srcRouteBase = join(appDir, 'src', 'app', ...parts, 'route');

  return [
    `${appRouteBase}.ts`,
    `${appRouteBase}.tsx`,
    `${appRouteBase}.js`,
    `${appRouteBase}.jsx`,
    `${srcRouteBase}.ts`,
    `${srcRouteBase}.tsx`,
    `${srcRouteBase}.js`,
    `${srcRouteBase}.jsx`,
  ];
}

function nextMetadataCandidates(appDir: string, baseName: string): string[] {
  return [
    join(appDir, 'app', `${baseName}.ts`),
    join(appDir, 'app', `${baseName}.js`),
    join(appDir, 'src', 'app', `${baseName}.ts`),
    join(appDir, 'src', 'app', `${baseName}.js`),
  ];
}

function publicCandidates(appDir: string, relativePath: string): string[] {
  const rel = relativePath.startsWith('/')
    ? relativePath.slice(1)
    : relativePath;
  return [join(appDir, 'public', rel)];
}

function pathCandidates(appDir: string, path: string): string[] {
  if (PAGE_SLUG_RE.test(path)) {
    return pageCandidates(appDir, path.slice(1));
  }

  switch (path) {
    case '/sitemap.xml':
      return [
        ...publicCandidates(appDir, 'sitemap.xml'),
        ...nextMetadataCandidates(appDir, 'sitemap'),
        ...routeFileCandidates(appDir, '/sitemap.xml'),
      ];
    case '/robots.txt':
      return [
        ...publicCandidates(appDir, 'robots.txt'),
        ...nextMetadataCandidates(appDir, 'robots'),
        ...routeFileCandidates(appDir, '/robots.txt'),
      ];
    case '/favicon.ico':
      return [
        ...publicCandidates(appDir, 'favicon.ico'),
        ...routeFileCandidates(appDir, '/favicon.ico'),
        join(appDir, 'app', 'favicon.ico'),
        join(appDir, 'src', 'app', 'favicon.ico'),
      ];
    case '/favicon.svg':
      return [
        ...publicCandidates(appDir, 'favicon.svg'),
        ...routeFileCandidates(appDir, '/favicon.svg'),
        join(appDir, 'app', 'favicon.svg'),
        join(appDir, 'src', 'app', 'favicon.svg'),
      ];
    case '/apple-touch-icon.png':
      return [
        ...publicCandidates(appDir, 'apple-touch-icon.png'),
        ...routeFileCandidates(appDir, '/apple-touch-icon.png'),
        join(appDir, 'app', 'apple-touch-icon.png'),
        join(appDir, 'src', 'app', 'apple-touch-icon.png'),
      ];
    case '/site.webmanifest':
      return [
        ...publicCandidates(appDir, 'site.webmanifest'),
        ...routeFileCandidates(appDir, '/site.webmanifest'),
      ];
    case '/manifest.webmanifest':
      return [
        ...publicCandidates(appDir, 'manifest.webmanifest'),
        ...nextMetadataCandidates(appDir, 'manifest'),
        ...routeFileCandidates(appDir, '/manifest.webmanifest'),
      ];
    case '/manifest.json':
      return [...publicCandidates(appDir, 'manifest.json')];
    case '/agents.txt':
      return [
        ...publicCandidates(appDir, 'agents.txt'),
        ...routeFileCandidates(appDir, '/agents.txt'),
      ];
    case '/llms.txt':
      return [
        ...publicCandidates(appDir, 'llms.txt'),
        ...routeFileCandidates(appDir, '/llms.txt'),
      ];
    case '/.well-known/security.txt':
    case '/.well-known/assetlinks.json':
    case '/.well-known/apple-app-site-association':
    case '/.well-known/agents.json':
    case '/.well-known/ai-plugin.json':
      return [
        ...publicCandidates(appDir, path),
        ...routeFileCandidates(appDir, path),
      ];
    default:
      return [
        ...publicCandidates(appDir, path),
        ...routeFileCandidates(appDir, path),
      ];
  }
}

function findExistingCandidate(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(candidate));
}

function detectWorkerRouteStatus(
  workerText: string,
  routeInventory: Set<string>,
  hasWorkerEntry: boolean,
  hasAssetsFallback: boolean,
  path: string
): WorkerStatus {
  if (!hasWorkerEntry) return 'n/a';
  if (hasAssetsFallback && PAGE_SLUG_RE.test(path)) return 'yes';
  if (routeInventory.has(path)) return 'yes';

  const singleQuoted = `'${path}'`;
  const doubleQuoted = `"${path}"`;
  const tickQuoted = `\`${path}\``;
  if (workerText.includes(singleQuoted) || workerText.includes(doubleQuoted)) {
    return 'yes';
  }
  if (workerText.includes(tickQuoted)) return 'yes';

  return 'no';
}

function detectClientRootStatus(
  clientText: string,
  clientRootExists: boolean,
  slug: string,
  workerStatus: WorkerStatus,
  hasWorkerEntry: boolean
): ClientStatus {
  if (!hasWorkerEntry || workerStatus !== 'yes') return 'n/a';
  if (!clientRootExists) return 'n/a';

  return clientText.includes(`${slug}-root`) ? 'yes' : 'no';
}

function baseMissingSeverity(
  spec: QualityPathSpec,
  linkedCount: number
): QualityIssueSeverity {
  if (linkedCount > 0 && spec.required !== false) {
    return 'error';
  }
  return spec.severityWhenMissing || (spec.required ? 'error' : 'warn');
}

function auditWorkspaceTarget(
  target: QualityTarget,
  specs: QualityPathSpec[]
): QualityTargetReport {
  const appDir = target.appDir;
  if (!appDir) {
    return {
      target,
      pathResults: [],
      issues: [
        buildIssue(
          'invalid-target',
          'error',
          'Target does not include an appDir for local lint checks',
          { process: target.name }
        ),
      ],
      ok: false,
    };
  }

  const files = ['app', 'src', 'client'].flatMap((dirName) =>
    walkFiles(join(appDir, dirName))
  );

  const workerCandidates = [
    join(appDir, 'src', 'worker.ts'),
    join(appDir, 'src', 'worker.js'),
    join(appDir, 'src', 'index.ts'),
    join(appDir, 'src', 'index.js'),
    join(appDir, 'worker.ts'),
    join(appDir, 'index.ts'),
  ];
  const workerTexts = workerCandidates
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => safeReadUtf8(candidate));
  const hasWorkerEntry = workerTexts.length > 0;
  const workerText = workerTexts.join('\n');
  const routeInventory = new Set<string>(extractRouteLiterals(workerText));
  const hasAssetsFallback =
    workerText.includes('ASSETS.fetch(request)') ||
    workerText.includes('ASSETS.fetch(');

  const clientRootCandidates = [
    join(appDir, 'src', 'client', 'index.tsx'),
    join(appDir, 'src', 'client', 'main.tsx'),
    join(appDir, 'client', 'index.tsx'),
    join(appDir, 'client', 'main.tsx'),
  ];
  const clientTexts = clientRootCandidates
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => safeReadUtf8(candidate));
  const clientRootExists = clientTexts.length > 0;
  const clientText = clientTexts.join('\n');

  const pathResults: QualityPathStatus[] = [];
  const issues: QualityIssue[] = [];

  for (const spec of specs) {
    const path = spec.path;
    const linkedCount = countPathLinks(files, path);
    const candidates = pathCandidates(appDir, path);
    const existingCandidate = findExistingCandidate(candidates);
    const exists = Boolean(existingCandidate);

    let worker: WorkerStatus = 'n/a';
    let client: ClientStatus = 'n/a';

    if (PAGE_SLUG_RE.test(path)) {
      worker = detectWorkerRouteStatus(
        workerText,
        routeInventory,
        hasWorkerEntry,
        hasAssetsFallback,
        path
      );
      const slug = path.slice(1);
      client = detectClientRootStatus(
        clientText,
        clientRootExists,
        slug,
        worker,
        hasWorkerEntry
      );
    }

    const pathIssues: QualityIssue[] = [];

    if (!exists) {
      const severity = baseMissingSeverity(spec, linkedCount);
      const candidatePreview = candidates.slice(0, 3).join(' or ');
      const suggestion = candidatePreview
        ? `Create one of: ${candidatePreview}`
        : undefined;

      pathIssues.push(
        buildIssue(
          'missing-path-implementation',
          severity,
          `Missing implementation for ${path}`,
          {
            path,
            appDir,
            process: target.name,
            suggestion,
          }
        )
      );
    }

    if (PAGE_SLUG_RE.test(path) && hasWorkerEntry && worker === 'no') {
      pathIssues.push(
        buildIssue(
          'missing-worker-route',
          'error',
          `Worker PAGE_ROUTES is missing ${path}`,
          {
            path,
            appDir,
            process: target.name,
            suggestion: `Add ${path} to worker route handling (src/index.ts or src/worker.ts)`,
          }
        )
      );
    }

    if (PAGE_SLUG_RE.test(path) && client === 'no') {
      pathIssues.push(
        buildIssue(
          'missing-client-root',
          'error',
          `Client hydration root is missing for ${path}`,
          {
            path,
            appDir,
            process: target.name,
            suggestion: `Add ${path.slice(
              1
            )}-root mapping in src/client/index.tsx`,
          }
        )
      );
    }

    pathResults.push({
      path,
      category: spec.category,
      required: spec.required,
      linkedCount,
      exists,
      candidate: existingCandidate,
      worker,
      client,
      issues: pathIssues,
    });

    issues.push(...pathIssues);
  }

  return {
    target,
    pathResults,
    issues,
    ok: issues.length === 0,
  };
}

function resolveProcessBaseUrl(
  processName: string,
  smokeOptions: QualitySmokeOptions
): string {
  const explicit = smokeOptions.processUrlByName?.[processName];
  if (explicit) return explicit.replace(/\/+$/, '');

  if (/^https?:\/\//i.test(processName)) {
    return processName.replace(/\/+$/, '');
  }

  if (processName.includes('.')) {
    return `https://${processName}`.replace(/\/+$/, '');
  }

  return `https://${processName}.edgework.ai`;
}

function hasLegacyWorkersRedirect(content: string): boolean {
  const jsLocationRedirect =
    /window\.location(?:\.(?:href|assign|replace))?[\s=('"`]*https?:\/\/[a-z0-9.-]+\.workers\.dev/i;
  const metaRefreshRedirect =
    /<meta[^>]+http-equiv=["']refresh["'][^>]+url=https?:\/\/[^\s"'<>]+\.workers\.dev/i;
  return jsLocationRedirect.test(content) || metaRefreshRedirect.test(content);
}

async function smokeFetchPath(
  processName: string,
  path: string,
  options: SitePathSmokeTestOptions
): Promise<QualityPathSmokeResult> {
  const baseUrl = resolveProcessBaseUrl(processName, options);
  const targetUrl = `${baseUrl}${path}`;

  const response = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'manual',
    signal: options.signal,
    headers: {
      Accept: '*/*',
      ...createEdgeworkAuthHeader(resolveEdgeworkApiKey(options.apiKey)),
    },
  });

  const location = response.headers.get('location');
  if (location && /\.workers\.dev/i.test(location)) {
    return {
      path,
      url: targetUrl,
      ok: false,
      status: response.status,
      contentType: response.headers.get('content-type'),
      legacyRedirectDetected: true,
      details: `HTTP redirect points to workers.dev: ${location}`,
    };
  }

  const contentType = response.headers.get('content-type');
  if (
    contentType?.includes('text/html') ||
    contentType?.includes('application/xhtml+xml')
  ) {
    const body = await response.text();
    if (hasLegacyWorkersRedirect(body)) {
      return {
        path,
        url: targetUrl,
        ok: false,
        status: response.status,
        contentType,
        legacyRedirectDetected: true,
        details: 'HTML contains legacy workers.dev client-side redirect',
      };
    }
  }

  return {
    path,
    url: targetUrl,
    ok: response.ok,
    status: response.status,
    contentType,
    legacyRedirectDetected: false,
    details: response.ok
      ? undefined
      : `Unexpected non-2xx status: ${response.status}`,
  };
}

function createSmokeIssue(
  result: QualityPathSmokeResult,
  target: QualityTarget
): QualityIssue {
  const code: QualityIssueCode = result.legacyRedirectDetected
    ? 'legacy-workers-redirect'
    : 'smoke-path-failed';

  return buildIssue(
    code,
    'error',
    `Smoke check failed for ${result.path} (${result.status})`,
    {
      path: result.path,
      process: target.name,
      appDir: target.appDir,
      suggestion: result.details,
    }
  );
}

function withTimeoutSignal(
  timeoutMs: number,
  upstream?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      upstream.addEventListener('abort', onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

async function smokeTargetPaths(
  target: QualityTarget,
  pathSpecs: QualityPathSpec[],
  options: QualitySmokeOptions
): Promise<SitePathSmokeTestResult | undefined> {
  const paths = normalizeUnique([
    '/',
    ...(options.paths || []),
    ...(pathSpecs.map((spec) => spec.path) || []),
  ]).map(normalizePath);

  const timeoutMs = options.timeoutMs || 10_000;
  const signalWrap = withTimeoutSignal(timeoutMs, options.signal);

  try {
    const pathResults: QualityPathSmokeResult[] = [];

    for (const path of paths) {
      const result = await smokeFetchPath(target.name, path, {
        ...options,
        signal: signalWrap.signal,
      });
      pathResults.push(result);
    }

    const failures = pathResults.filter((result) => !result.ok);

    return {
      process: target.name,
      baseUrl: resolveProcessBaseUrl(target.name, options),
      paths: pathResults,
      ok: failures.length === 0,
      failures,
    };
  } finally {
    signalWrap.cleanup();
  }
}

function summarize(targetReports: QualityTargetReport[]): {
  targets: number;
  issues: number;
  errors: number;
  warnings: number;
  smokeFailures: number;
} {
  let issues = 0;
  let errors = 0;
  let warnings = 0;
  let smokeFailures = 0;

  for (const report of targetReports) {
    for (const issue of report.issues) {
      issues += 1;
      if (issue.severity === 'error') {
        errors += 1;
      } else {
        warnings += 1;
      }

      if (
        issue.code === 'smoke-path-failed' ||
        issue.code === 'legacy-workers-redirect'
      ) {
        smokeFailures += 1;
      }
    }
  }

  return {
    targets: targetReports.length,
    issues,
    errors,
    warnings,
    smokeFailures,
  };
}

export async function runQualityAutopilot(
  options: QualityAutopilotOptions = {}
): Promise<QualityAutopilotReport> {
  const workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  const appsDir = options.appsDir || DEFAULT_APPS_DIR;
  const source = options.source || DEFAULT_SOURCE;

  if (!SOURCE_OPTIONS.has(source)) {
    throw new Error(
      `Invalid quality source: ${source}. Expected one of workspace|gateway|all`
    );
  }

  const pathSpecs = resolvePathSpecs(options);

  const workspaceTargets =
    source === 'workspace' || source === 'all'
      ? discoverWorkspaceTargets(workspaceRoot, appsDir)
      : [];

  let gatewayTargets: GatewayQualityTarget[] = [];
  const discoveryIssues: QualityIssue[] = [];

  if (source === 'gateway' || source === 'all') {
    try {
      gatewayTargets = await discoverGatewayTargets(options);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'unknown gateway discovery error';
      discoveryIssues.push(
        buildIssue('gateway-discovery-failed', 'error', message, {
          suggestion:
            'Set EDGEWORK_API_KEY (or --api-key) and ensure gateway access is available',
        })
      );
    }
  }

  const mergedTargets = mergeTargets(workspaceTargets, gatewayTargets);
  const filteredTargets = applyTargetFilters(mergedTargets, options);

  const targetReports: QualityTargetReport[] = [];

  for (const target of filteredTargets) {
    const targetPathSpecs = discoveredPathSpecsForTarget(target, pathSpecs);
    const lintReport =
      target.appDir && (source === 'workspace' || source === 'all')
        ? auditWorkspaceTarget(target, targetPathSpecs)
        : undefined;

    const smokeEnabled = Boolean(options.smoke);
    const smokeReport = smokeEnabled
      ? await smokeTargetPaths(target, targetPathSpecs, {
          apiKey: options.apiKey,
          signal: options.signal,
          timeoutMs: options.smokeTimeoutMs,
          paths: normalizeCsv(options.smokePaths).map(normalizePath),
          processUrlByName: options.processUrlByName,
        })
      : undefined;

    const smokeIssues = smokeReport
      ? smokeReport.failures.map((f) => createSmokeIssue(f, target))
      : [];

    const issues = [...(lintReport?.issues || []), ...smokeIssues];

    targetReports.push({
      target,
      pathResults: lintReport?.pathResults || [],
      smoke: smokeReport,
      issues,
      ok: issues.length === 0,
    });
  }

  if (discoveryIssues.length > 0) {
    targetReports.push({
      target: {
        name: 'gateway-discovery',
        source: 'manual',
      },
      pathResults: [],
      issues: discoveryIssues,
      ok: false,
    });
  }

  const summary = summarize(targetReports);

  return {
    generatedAt: new Date().toISOString(),
    options: {
      workspaceRoot,
      appsDir,
      source,
      smoke: Boolean(options.smoke),
      strict: options.strict ?? true,
      targets: normalizeCsv(options.targets),
      excludeTargets: normalizeCsv(options.excludeTargets),
      pathSpecs,
    },
    targets: targetReports,
    summary,
    ok: summary.errors === 0,
  };
}

function formatPathStatus(pathStatus: QualityPathStatus): string {
  const existence = pathStatus.exists ? 'yes' : 'no';
  const issues =
    pathStatus.issues.length > 0
      ? pathStatus.issues.map((issue) => issue.code).join(',')
      : 'none';

  return `${pathStatus.path} links:${pathStatus.linkedCount} exists:${existence} worker:${pathStatus.worker} client:${pathStatus.client} issues:${issues}`;
}

export function formatQualityAutopilotReport(
  report: QualityAutopilotReport
): string {
  const lines: string[] = [];

  lines.push('Quality Autopilot Report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Source: ${report.options.source}`);
  lines.push(`Smoke: ${report.options.smoke ? 'enabled' : 'disabled'}`);

  for (const target of report.targets) {
    lines.push('');
    lines.push(`${target.target.name} (${target.target.source})`);

    if (target.target.appDir) {
      lines.push(`  appDir: ${target.target.appDir}`);
    }

    if (target.pathResults.length === 0) {
      lines.push('  no local path checks');
    } else {
      for (const pathStatus of target.pathResults) {
        lines.push(`  ${formatPathStatus(pathStatus)}`);
      }
    }

    if (target.smoke) {
      lines.push(
        `  smoke: ${target.smoke.ok ? 'pass' : 'fail'} (${
          target.smoke.baseUrl
        })`
      );
      for (const smokePath of target.smoke.paths) {
        lines.push(
          `    ${smokePath.path} -> ${smokePath.status} ${
            smokePath.ok ? 'ok' : 'fail'
          }`
        );
      }
    }

    if (target.issues.length > 0) {
      for (const issue of target.issues) {
        lines.push(
          `  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`
        );
        if (issue.suggestion) {
          lines.push(`    suggestion: ${issue.suggestion}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('Summary');
  lines.push(`  targets: ${report.summary.targets}`);
  lines.push(`  issues: ${report.summary.issues}`);
  lines.push(`  errors: ${report.summary.errors}`);
  lines.push(`  warnings: ${report.summary.warnings}`);
  lines.push(`  smokeFailures: ${report.summary.smokeFailures}`);

  return lines.join('\n');
}
