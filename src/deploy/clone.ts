import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

import {
  createEdgeworkAuthHeader,
  resolveEdgeworkApiKey,
} from '../edgework-api-key';
import { scaffoldAeonFoundation } from './scaffold';
import type { CloneOptions, CloneResult, SourceRef } from './types';

const DEFAULT_GATEWAY_URL = 'https://api.edgework.ai';

interface GatewayListItem {
  cid?: string;
  name?: string;
  state?: string;
}

interface GatewayListResponse {
  processes?: GatewayListItem[];
}

interface GatewayStatusResponse {
  cid: string;
  name: string;
  url?: string;
}

interface SnapshotAsset {
  path: string;
  contentType: string;
  textBody?: string;
  binaryBody?: Uint8Array;
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
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/health' || pathname === '/api/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ ok: true, mode: 'clone' }));
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
    });
    response.end('clone-ready');
  });

  const ready = await new Promise<boolean>((resolvePromise) => {
    server.once('error', () => resolvePromise(false));
    server.listen(0, '127.0.0.1', () => resolvePromise(true));
  });
  if (!ready) {
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

function ensureEmptyDirectory(targetDir: string): void {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    return;
  }

  const entries = readdirSync(targetDir);
  if (entries.length > 0) {
    throw new Error(
      `Target directory must be empty for clone: ${targetDir} (${entries.length} entries found)`
    );
  }
}

function authHeaders(apiKey?: string): Record<string, string> {
  return {
    Accept: '*/*',
    ...createEdgeworkAuthHeader(resolveEdgeworkApiKey(apiKey)),
  };
}

async function fetchGatewayList(
  gatewayUrl: string,
  apiKey?: string
): Promise<GatewayListItem[]> {
  const response = await fetch(`${gatewayUrl}/v1/aeon-deploy/list`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as GatewayListResponse;
  return Array.isArray(payload.processes) ? payload.processes : [];
}

async function fetchGatewayStatus(
  gatewayUrl: string,
  cid: string,
  apiKey?: string
): Promise<GatewayStatusResponse | null> {
  const response = await fetch(`${gatewayUrl}/v1/aeon-deploy/${cid}/status`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GatewayStatusResponse;
}

function classifySource(input: string): SourceRef {
  const value = input.trim();

  try {
    const parsedUrl = new URL(value);
    const processName = parsedUrl.hostname.split('.')[0] || undefined;
    return {
      input,
      kind: 'url',
      value,
      processName,
      baseUrl: parsedUrl.origin,
    };
  } catch {
    // Continue with non-URL classifiers.
  }

  if (value.startsWith('did:')) {
    return {
      input,
      kind: 'pid',
      value,
      processName: value,
      baseUrl: `https://${value}.edgework.ai`,
    };
  }

  if (/^[a-f0-9]{24,}$/i.test(value)) {
    return {
      input,
      kind: 'deployment-id',
      value,
      cid: value,
    };
  }

  if (/^bafy[a-z0-9]+$/i.test(value)) {
    return {
      input,
      kind: 'cid',
      value,
      cid: value,
    };
  }

  return {
    input,
    kind: 'slug',
    value,
    processName: value,
    baseUrl: `https://${value}.edgework.ai`,
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

async function resolveSource(
  source: string,
  gatewayUrl: string,
  apiKey?: string
): Promise<SourceRef> {
  const ref = classifySource(source);
  const list = await fetchGatewayList(gatewayUrl, apiKey);

  if (ref.kind === 'deployment-id' || ref.kind === 'cid') {
    const status = await fetchGatewayStatus(gatewayUrl, ref.value, apiKey);
    if (status) {
      return {
        ...ref,
        cid: status.cid,
        processName: status.name,
        baseUrl:
          status.url && status.url.startsWith('http')
            ? status.url
            : `https://${status.name}.edgework.ai`,
      };
    }

    const byCid = list.find((item) => item.cid === ref.value);
    if (byCid?.name) {
      return {
        ...ref,
        cid: byCid.cid,
        processName: byCid.name,
        baseUrl: `https://${byCid.name}.edgework.ai`,
      };
    }
  }

  if (ref.kind === 'slug' || ref.kind === 'pid') {
    const byName = list.find((item) => item.name === ref.value);
    if (byName?.name) {
      return {
        ...ref,
        processName: byName.name,
        cid: byName.cid,
        baseUrl: `https://${byName.name}.edgework.ai`,
      };
    }
  }

  if (ref.kind === 'url' && ref.processName) {
    const byUrlName = list.find((item) => item.name === ref.processName);
    if (byUrlName?.cid) {
      return {
        ...ref,
        cid: byUrlName.cid,
      };
    }
  }

  if (!ref.baseUrl && ref.processName) {
    ref.baseUrl = `https://${ref.processName}.edgework.ai`;
  }
  return ref;
}

function parseSitemapLocations(xml: string): string[] {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((match) => match[1]).filter(Boolean);
}

function normalizePathForSnapshot(pathname: string): string {
  if (!pathname.startsWith('/')) return '/';
  const clean = pathname.split('#')[0].split('?')[0];
  return clean || '/';
}

function snapshotTargetPath(pathname: string, contentType: string): string {
  const normalized = normalizePathForSnapshot(pathname);
  const extension = extname(normalized);

  if (normalized === '/') {
    return 'public/index.html';
  }
  if (!extension) {
    return `public${normalized}/index.html`;
  }
  return `public${normalized}`;
}

async function fetchAsset(
  baseUrl: string,
  pathname: string,
  apiKey?: string
): Promise<SnapshotAsset | null> {
  const targetUrl = `${baseUrl.replace(/\/+$/, '')}${pathname}`;
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  if (!response.ok) {
    return null;
  }

  const contentType =
    response.headers.get('content-type') || 'application/octet-stream';
  if (
    contentType.includes('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('svg')
  ) {
    const textBody = await response.text();
    return {
      path: pathname,
      contentType,
      textBody,
    };
  }

  const binary = new Uint8Array(await response.arrayBuffer());
  return {
    path: pathname,
    contentType,
    binaryBody: binary,
  };
}

async function downloadSnapshotAssets(
  source: SourceRef,
  apiKey?: string
): Promise<SnapshotAsset[]> {
  if (!source.baseUrl) return [];

  const assets: SnapshotAsset[] = [];
  const sitemap = await fetchAsset(source.baseUrl, '/sitemap.xml', apiKey);
  if (sitemap) {
    assets.push(sitemap);
  }

  const locs = sitemap?.textBody ? parseSitemapLocations(sitemap.textBody) : [];
  const routes = uniqueSorted([
    '/',
    ...locs.map((loc) => {
      try {
        return normalizePathForSnapshot(new URL(loc).pathname);
      } catch {
        return '/';
      }
    }),
    '/robots.txt',
    '/manifest.webmanifest',
    '/favicon.svg',
    '/agents.txt',
    '/llms.txt',
    '/.well-known/ai-plugin.json',
  ]);

  for (const route of routes) {
    if (route === '/sitemap.xml' && sitemap) {
      continue;
    }
    const asset = await fetchAsset(source.baseUrl, route, apiKey);
    if (asset) {
      assets.push(asset);
    }
  }

  return assets;
}

function writeSnapshotAssets(
  targetDir: string,
  assets: SnapshotAsset[]
): string[] {
  const filesWritten: string[] = [];

  for (const asset of assets) {
    const relativeTarget = snapshotTargetPath(asset.path, asset.contentType);
    const absoluteTarget = join(targetDir, relativeTarget);
    mkdirSync(dirnameFor(absoluteTarget), { recursive: true });

    if (typeof asset.textBody === 'string') {
      writeFileSync(absoluteTarget, asset.textBody, 'utf8');
    } else if (asset.binaryBody) {
      writeFileSync(absoluteTarget, Buffer.from(asset.binaryBody));
    } else {
      continue;
    }
    filesWritten.push(relativeTarget);
  }

  return uniqueSorted(filesWritten);
}

function dirnameFor(pathname: string): string {
  const index = pathname.lastIndexOf('/');
  if (index <= 0) return pathname;
  return pathname.slice(0, index);
}

export async function cloneDeploymentToDirectory(
  options: CloneOptions
): Promise<CloneResult> {
  const targetDir = resolve(options.targetDir);
  ensureEmptyDirectory(targetDir);

  const gatewayUrl = (options.gatewayUrl || DEFAULT_GATEWAY_URL).replace(
    /\/+$/,
    ''
  );
  const source = await resolveSource(
    options.source,
    gatewayUrl,
    options.apiKey
  );

  const filesWritten: string[] = [];
  const downloadedPaths: string[] = [];

  if (!options.envTemplateOnly) {
    const scaffold = await scaffoldAeonFoundation({
      targetDir,
      preset: 'all',
      quality: true,
      install: false,
      serve: false,
    });
    for (const absolutePath of scaffold.filesWritten) {
      filesWritten.push(absolutePath);
    }

    const assets = await downloadSnapshotAssets(source, options.apiKey);
    const writtenSnapshotPaths = writeSnapshotAssets(targetDir, assets);
    downloadedPaths.push(...writtenSnapshotPaths);
  } else {
    writeFileSync(
      join(targetDir, '.env.example'),
      `EDGEWORK_API_KEY=ew_live_replace_me\nEDGEWORK_GATEWAY_URL=${gatewayUrl}\n`,
      'utf8'
    );
    filesWritten.push(join(targetDir, '.env.example'));
  }

  const cloneManifestPath = join(targetDir, '.aeon', 'clone-manifest.json');
  mkdirSync(dirnameFor(cloneManifestPath), { recursive: true });
  writeFileSync(
    cloneManifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source,
        mode: options.mode || 'full',
        downloadedPaths,
      },
      null,
      2
    ),
    'utf8'
  );
  filesWritten.push(cloneManifestPath);

  const installed = options.install ? installDependencies(targetDir) : false;
  const served = options.serve ? await smokeServe(targetDir) : false;

  if (options.install && !installed) {
    throw new Error(`Dependency installation failed in ${targetDir}`);
  }
  if (options.serve && !served) {
    throw new Error(`Serve smoke check failed in ${targetDir}`);
  }

  return {
    targetDir,
    source,
    filesWritten: uniqueSorted(filesWritten),
    installed,
    served,
    downloadedPaths: uniqueSorted(downloadedPaths),
  };
}
