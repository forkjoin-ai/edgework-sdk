/**
 * Aeon Deploy — Dead simple deployment for Aeon Flux apps
 *
 * Usage:
 *   import { deploy, getStatus, stop, start } from '@a0n/edgework-sdk/deploy';
 *   const result = await deploy({ appDir: './my-site', name: 'halos-agency', ... });
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import type {
  AeonConfig,
  CloneOptions,
  CloneResult,
  DeployConfig,
  DeployResult,
  DeploymentStatus,
  DeploymentMetrics,
  DeploymentLog,
  DeploymentListItem,
  CnameRegistration,
  SeedConfig,
  AeonContainerRepoSeedConfig,
  AeonContainerRepoSeedFile,
  AeonContainerRepoSeedResult,
  AeonContainerSnapshotConfig,
  AeonContainerSnapshotResult,
  ProcessStreamRequest,
  ProcessOpenAIChatRequest,
  ProcessAnthropicMessageRequest,
  ProcessRequestOptions,
  ProcessStreamEvent,
  QualityPolicy,
  SiteSmokeTestOptions,
  SiteSmokeTestResult,
  ScaffoldOptions,
  ScaffoldResult,
  SourceRef,
  QualityIssue,
  QualityIssueCode,
  QualityIssueSeverity,
  QualityPathSpec,
  QualityPathStatus,
  QualityPathSmokeResult,
  QualityTarget,
  QualityTargetSource,
  QualityTargetReport,
  QualitySmokeOptions,
  QualityAutopilotOptions,
  QualityAutopilotResolvedOptions,
  QualityAutopilotReport,
  GatewayQualityTarget,
  SitePathSmokeTestOptions,
  SitePathSmokeTestResult,
  SmokeCleanup,
  SmokeContext,
  SmokeFetchJsonResult,
  SmokeLiveRouteResult,
  SmokeResult,
  SmokeStep,
  SmokeStepResult,
  SmokeSuite,
  McpCallResult,
  McpSession,
  WaitForLiveRouteOptions,
} from './types';
import {
  createEdgeworkAuthHeader,
  resolveEdgeworkApiKey,
} from '../edgework-api-key';
import { scaffoldAeonFoundation, scaffoldMcpServer } from './scaffold';
import { cloneDeploymentToDirectory } from './clone';
import {
  detectFeatureKey,
  loadAeonConfigFromFile,
  resolveAeonConfig,
  serializeAeonToml,
} from './aeon-config';
export {
  formatQualityAutopilotReport,
  getDefaultQualityPathSpecs,
  runQualityAutopilot,
} from './quality';
export { createForgoMCPTools } from './mcp';
export {
  assertFlagsReadable,
  assertPreferencesRoundTrip,
  resolveSmokeBaseUrl,
  resolveSmokeSuiteOptions,
  runSmokeSuite,
  withRetry,
} from './smoke';

export type {
  AeonConfig,
  CloneOptions,
  CloneResult,
  DeployConfig,
  DeployResult,
  DeploymentStatus,
  DeploymentMetrics,
  DeploymentLog,
  DeploymentListItem,
  CnameRegistration,
  SeedConfig,
  AeonContainerRepoSeedConfig,
  AeonContainerRepoSeedFile,
  AeonContainerRepoSeedResult,
  AeonContainerSnapshotConfig,
  AeonContainerSnapshotResult,
  ProcessStreamRequest,
  ProcessOpenAIChatRequest,
  ProcessAnthropicMessageRequest,
  ProcessRequestOptions,
  ProcessStreamEvent,
  QualityPolicy,
  SiteSmokeTestOptions,
  SiteSmokeTestResult,
  ScaffoldOptions,
  ScaffoldResult,
  SourceRef,
  QualityIssue,
  QualityIssueCode,
  QualityIssueSeverity,
  QualityPathSpec,
  QualityPathStatus,
  QualityPathSmokeResult,
  QualityTarget,
  QualityTargetSource,
  QualityTargetReport,
  QualitySmokeOptions,
  QualityAutopilotOptions,
  QualityAutopilotResolvedOptions,
  QualityAutopilotReport,
  GatewayQualityTarget,
  SitePathSmokeTestOptions,
  SitePathSmokeTestResult,
  SmokeCleanup,
  SmokeContext,
  SmokeFetchJsonResult,
  SmokeLiveRouteResult,
  SmokeResult,
  SmokeStep,
  SmokeStepResult,
  SmokeSuite,
  McpCallResult,
  McpSession,
  WaitForLiveRouteOptions,
};

export {
  cloneDeploymentToDirectory,
  detectFeatureKey,
  loadAeonConfigFromFile,
  resolveAeonConfig,
  scaffoldAeonFoundation,
  scaffoldMcpServer,
  serializeAeonToml,
};

/** Default gateway URL */
const DEFAULT_GATEWAY = 'https://api.edgework.ai';

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...createEdgeworkAuthHeader(apiKey),
  };
  return headers;
}

function resolveContainerApiBase(endpointBaseUrl: string): string {
  const trimmed = endpointBaseUrl.replace(/\/+$/, '');
  if (
    trimmed.endsWith('/api/container') ||
    trimmed.endsWith('/v1/aeon-container')
  ) {
    return trimmed;
  }

  if (/^https?:\/\/[^/]+$/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.hostname.endsWith('halo.place') ||
        parsed.hostname.endsWith('forkjoin.org')
      ) {
        return `${trimmed}/api/container`;
      }
    } catch {
      // Fall through to default container route shape.
    }
    return `${trimmed}/v1/aeon-container`;
  }

  return trimmed;
}

function containerAuthHeaders(
  apiKey?: string,
  ucanToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...createEdgeworkAuthHeader(resolveEdgeworkApiKey(apiKey)),
  };
  if (ucanToken) {
    headers.Authorization = `Bearer ${ucanToken}`;
  }
  return headers;
}

async function containerApiRequest<T>(
  endpointBaseUrl: string,
  path: string,
  options: RequestInit & { apiKey?: string; ucanToken?: string }
): Promise<T> {
  const { apiKey, ucanToken, ...fetchOptions } = options;
  const base = resolveContainerApiBase(endpointBaseUrl);
  const response = await fetch(`${base}${path}`, {
    ...fetchOptions,
    headers: {
      ...containerAuthHeaders(apiKey, ucanToken),
      ...(fetchOptions.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Container API error (${response.status}): ${body || response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

function detectRepoSeedLanguage(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'go':
      return 'go';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'lua':
      return 'lua';
    case 'md':
      return 'markdown';
    case 'json':
      return 'json';
    default:
      return undefined;
  }
}

async function loadRepoSeedFilesFromDir(
  fromDir: string
): Promise<AeonContainerRepoSeedFile[]> {
  const { existsSync, readdirSync, readFileSync, statSync } = await import(
    'fs'
  );
  const { join, relative } = await import('path');

  if (!existsSync(fromDir)) {
    throw new Error(`Seed directory not found: ${fromDir}`);
  }

  const files: AeonContainerRepoSeedFile[] = [];
  const stack: string[] = [fromDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.git')) continue;
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = `/${relative(fromDir, absolutePath).replace(
        /\\/g,
        '/'
      )}`;
      const content = readFileSync(absolutePath, 'utf-8');
      const size = statSync(absolutePath).size;
      if (size > 512_000) {
        // Avoid oversized payloads for single-file ingest requests.
        continue;
      }

      files.push({
        path: relativePath,
        content,
        language: detectRepoSeedLanguage(relativePath),
      });
    }
  }

  return files;
}

async function apiRequest<T>(
  url: string,
  options: RequestInit & { apiKey?: string }
): Promise<T> {
  const { apiKey, ...fetchOpts } = options;
  const resolvedApiKey = resolveEdgeworkApiKey(apiKey);
  const response = await fetch(url, {
    ...fetchOpts,
    headers: {
      ...authHeaders(resolvedApiKey),
      ...(fetchOpts.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || body;
    } catch {
      message = body;
    }
    throw new Error(`Deploy API error (${response.status}): ${message}`);
  }

  return response.json() as Promise<T>;
}

function resolveProcessBaseUrl(
  process: string,
  options?: ProcessRequestOptions
): string {
  if (options?.processUrl) {
    return options.processUrl.replace(/\/+$/, '');
  }
  if (/^https?:\/\//i.test(process)) {
    return process.replace(/\/+$/, '');
  }
  if (process.includes('.')) {
    return `https://${process}`.replace(/\/+$/, '');
  }
  return `https://${process}.edgework.ai`;
}

function processAuthHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...createEdgeworkAuthHeader(resolveEdgeworkApiKey(apiKey)),
  };
}

async function processRequest(
  process: string,
  path: string,
  init: RequestInit,
  options?: ProcessRequestOptions
): Promise<Response> {
  const baseUrl = resolveProcessBaseUrl(process, options);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: options?.signal,
    headers: {
      ...processAuthHeaders(options?.apiKey),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Process request failed (${response.status}): ${
        body || response.statusText
      }`
    );
  }
  return response;
}

async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ProcessStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let dataLines: string[] = [];

  const flush = (): ProcessStreamEvent | null => {
    if (dataLines.length === 0) {
      event = 'message';
      return null;
    }

    const data = dataLines.join('\n');
    const parsedEvent: ProcessStreamEvent = { event, data };
    if (data !== '[DONE]') {
      try {
        parsedEvent.json = JSON.parse(data) as unknown;
      } catch {
        // Non-JSON SSE payloads are still valid.
      }
    }

    event = 'message';
    dataLines = [];
    return parsedEvent;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let lineBreakIndex = buffer.indexOf('\n');
    while (lineBreakIndex >= 0) {
      const rawLine = buffer.slice(0, lineBreakIndex);
      buffer = buffer.slice(lineBreakIndex + 1);
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

      if (line === '') {
        const evt = flush();
        if (evt) {
          yield evt;
        }
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }

      lineBreakIndex = buffer.indexOf('\n');
    }
  }

  if (buffer.length > 0) {
    const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const tailEvent = flush();
  if (tailEvent) {
    yield tailEvent;
  }
}

/**
 * Build an Aeon Flux app directory into deployment artifacts.
 * Returns the manifest and encoded filesystem.
 */
async function buildApp(
  appDir: string,
  appName: string,
  skipBuild?: boolean
): Promise<{
  manifest: Record<string, unknown>;
  files: Record<string, string>;
  sourceBundle: Record<string, unknown>;
}> {
  const { existsSync, readFileSync, readdirSync, statSync } = await import(
    'fs'
  );
  const { createHash } = await import('crypto');
  const { join, relative } = await import('path');

  // Run build if not skipping
  if (!skipBuild) {
    const { execSync } = await import('child_process');
    try {
      execSync('bun run build', { cwd: appDir, stdio: 'pipe' });
    } catch {
      // Try aeon build as fallback
      try {
        execSync('npx aeon build', { cwd: appDir, stdio: 'pipe' });
      } catch {
        // Build may not be needed for static sites
        console.warn('[deploy] Build step skipped — no build script found');
      }
    }
  }

  // Look for manifest
  const manifestPath = join(appDir, 'manifest.json');
  let manifest: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  }

  // Collect files from dist/ or the app dir itself
  const distDir = existsSync(join(appDir, 'dist'))
    ? join(appDir, 'dist')
    : appDir;

  const files: Record<string, string> = {};

  function collectFiles(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Skip node_modules, .git, etc
        if (entry === 'node_modules' || entry === '.git' || entry === '.next') {
          continue;
        }
        collectFiles(fullPath);
      } else if (stat.isFile()) {
        const relPath = '/' + relative(distDir, fullPath);
        const content = readFileSync(fullPath);
        files[relPath] = content.toString('base64');
      }
    }
  }

  collectFiles(distDir);

  if (files['/remoteEntry.js'] && !files['/aeon-remote.json']) {
    const remoteDef = {
      id: `remote.pid.${appName.replace(/[^a-z0-9-]/g, '')}`,
      name: manifest.name || appName,
      entry: '/remoteEntry.js',
      expose: './aeonShellPlugin',
      type: 'var',
      entryGlobalName:
        manifest.entryGlobalName ||
        appName.replace(/[^a-zA-Z0-9]/g, '') + 'Remote',
      enabled: true,
      source: 'network',
    };
    const jsonStr = JSON.stringify(remoteDef, null, 2);
    files['/aeon-remote.json'] =
      typeof Buffer !== 'undefined'
        ? Buffer.from(jsonStr).toString('base64')
        : btoa(jsonStr);
  }

  const sourceFiles: Array<{ path: string; sha256: string; size: number }> = [];
  const sourceDirs = ['src', 'public', 'migrations', 'scripts'];

  for (const sourceDir of sourceDirs) {
    const absolute = join(appDir, sourceDir);
    if (!existsSync(absolute)) continue;

    const stack = [absolute];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      const entries = readdirSync(current);
      for (const entry of entries) {
        const fullPath = join(current, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === '.git') {
            continue;
          }
          stack.push(fullPath);
          continue;
        }
        if (!stat.isFile()) continue;

        const bytes = readFileSync(fullPath);
        const hash = createHash('sha256').update(bytes).digest('hex');
        sourceFiles.push({
          path: `/${relative(appDir, fullPath)}`,
          sha256: hash,
          size: stat.size,
        });
      }
    }
  }

  const sourceBundle: Record<string, unknown> = {
    template: 'aeon-foundation',
    generatedAt: new Date().toISOString(),
    sourceFileCount: sourceFiles.length,
    sourceFiles: sourceFiles.sort((a, b) => a.path.localeCompare(b.path)),
    includes: {
      wranglerToml: existsSync(join(appDir, 'wrangler.toml')),
      aeonToml: existsSync(join(appDir, 'aeon.toml')),
      mcpJson: existsSync(join(appDir, 'mcp.json')),
      migrationsDir: existsSync(join(appDir, 'migrations')),
    },
  };

  // Ensure manifest has required fields
  if (!manifest.entryPoint) {
    manifest.entryPoint = '/index.html';
  }
  if (!manifest.language) {
    manifest.language = 'javascript';
  }

  return { manifest, files, sourceBundle };
}

/**
 * Encode files into an envelope-compatible binary format.
 * Returns base64-encoded envelope data.
 */
function encodeEnvelope(
  manifest: Record<string, unknown>,
  files: Record<string, string>
): string {
  // Create a simple envelope format:
  // JSON header with manifest + file listing
  const envelope = {
    version: 1,
    manifest,
    files,
    timestamp: new Date().toISOString(),
  };

  const json = JSON.stringify(envelope);
  // Convert to base64 for transport
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json).toString('base64');
  }
  return btoa(json);
}

/**
 * Deploy an Aeon Flux app to the edge.
 *
 * @example
 * ```typescript
 * const result = await deploy({
 *   appDir: './my-site',
 *   name: 'halos-agency',
 *   gatewayUrl: 'https://api.edgework.ai',
 *   // apiKey is optional if EDGEWORK_API_KEY is set
 *   ownerDid: 'did:key:z...',
 * });
 * console.log(`Deployed to ${result.url}`);
 * ```
 */
export async function deploy(config: DeployConfig): Promise<DeployResult> {
  const gatewayUrl = config.gatewayUrl || DEFAULT_GATEWAY;

  // Step 1: Build the app
  const { manifest, files, sourceBundle } = await buildApp(
    config.appDir,
    config.name,
    config.build?.skipBuild
  );

  // Step 2: Encode as envelope
  const envelope = encodeEnvelope(manifest, files);

  // Step 3: Upload to gateway
  const result = await apiRequest<DeployResult>(
    `${gatewayUrl}/v1/aeon-deploy/upload`,
    {
      method: 'POST',
      apiKey: config.apiKey,
      body: JSON.stringify({
        name: config.name,
        ownerDid: config.ownerDid,
        manifest,
        envelope,
        sourceBundle,
      }),
    }
  );

  // Step 4: Register CNAME if provided
  if (config.cname && result.cid) {
    try {
      await registerCname(result.cid, config.cname, {
        gatewayUrl,
        apiKey: config.apiKey,
      });
    } catch (err) {
      console.warn(
        `[deploy] CNAME registration failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }
  }

  // Optional side-channel source manifest upload for deploy clone workflows.
  if (result.cid) {
    try {
      await apiRequest<{ ok: boolean }>(
        `${gatewayUrl}/v1/aeon-deploy/${result.cid}/source`,
        {
          method: 'POST',
          apiKey: config.apiKey,
          body: JSON.stringify({
            sourceBundle,
          }),
        }
      );
    } catch {
      // Non-blocking: clone manifest support is best-effort until all gateways expose this endpoint.
    }
  }

  return result;
}

/**
 * Get the status of a deployed process.
 */
export async function getStatus(
  cid: string,
  options?: { gatewayUrl?: string; apiKey?: string }
): Promise<DeploymentStatus> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  return apiRequest<DeploymentStatus>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/status`,
    { method: 'GET', apiKey: options?.apiKey }
  );
}

/**
 * Fetch app content through AeonPID/CID proxy route.
 * Useful when process DNS is not propagated yet.
 */
export async function fetchAppByCid(
  cid: string,
  options?: { gatewayUrl?: string; apiKey?: string; path?: string }
): Promise<Response> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  const params = new URLSearchParams();
  params.set('path', options?.path || '/');
  const response = await fetch(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/app?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(options?.apiKey),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`App proxy error (${response.status}): ${body}`);
  }

  return response;
}

function hasLegacyWorkersRedirect(content: string): boolean {
  const jsLocationRedirect =
    /window\.location(?:\.(?:href|assign|replace))?[\s=('"`]*https?:\/\/[a-z0-9.-]+\.workers\.dev/i;
  const metaRefreshRedirect =
    /<meta[^>]+http-equiv=["']refresh["'][^>]+url=https?:\/\/[^\s"'<>]+\.workers\.dev/i;
  return jsLocationRedirect.test(content) || metaRefreshRedirect.test(content);
}

/**
 * Smoke test a deployed process host and fail if it redirects to workers.dev.
 */
export async function smokeTestSite(
  process: string,
  options?: SiteSmokeTestOptions
): Promise<SiteSmokeTestResult> {
  const baseUrl = resolveProcessBaseUrl(process, options);
  const targetUrl = `${baseUrl}/`;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: options?.signal || controller.signal,
      headers: processAuthHeaders(options?.apiKey),
    });

    const location = response.headers.get('location');
    if (location && /\.workers\.dev/i.test(location)) {
      return {
        ok: false,
        url: targetUrl,
        status: response.status,
        contentType: response.headers.get('content-type'),
        legacyRedirectDetected: true,
        details: `HTTP redirect points to workers.dev: ${location}`,
      };
    }

    const proxyOrigin =
      response.headers.get('x-aeon-proxy-origin') ||
      response.headers.get('x-proxy-origin');
    if (proxyOrigin && /\.workers\.dev/i.test(proxyOrigin)) {
      return {
        ok: false,
        url: targetUrl,
        status: response.status,
        contentType: response.headers.get('content-type'),
        legacyRedirectDetected: true,
        details: `Proxy origin leaks workers.dev upstream: ${proxyOrigin}`,
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
          ok: false,
          url: targetUrl,
          status: response.status,
          contentType,
          legacyRedirectDetected: true,
          details: 'HTML contains legacy workers.dev client-side redirect',
        };
      }
    }

    // Standard smoke check passed, now check health and probe endpoints
    const healthUrl = `${baseUrl}/health`;
    const healthResponse = await fetch(healthUrl, {
      method: 'GET',
      signal: options?.signal || controller.signal,
      headers: processAuthHeaders(options?.apiKey),
    });

    if (!healthResponse.ok) {
      return {
        ok: false,
        url: targetUrl,
        status: healthResponse.status,
        contentType: healthResponse.headers.get('content-type'),
        legacyRedirectDetected: false,
        details: `Health check failed at ${healthUrl}: ${healthResponse.status}`,
      };
    }

    const healthData = (await healthResponse.json()) as { status: string };
    if (healthData.status !== 'ready' && healthData.status !== 'healthy') {
      return {
        ok: false,
        url: targetUrl,
        status: 200,
        contentType: 'application/json',
        legacyRedirectDetected: false,
        details: `Health status not ready: ${healthData.status}`,
      };
    }

    const probeUrl = `${baseUrl}/probe`;
    const probeResponse = await fetch(probeUrl, {
      method: 'GET',
      signal: options?.signal || controller.signal,
      headers: processAuthHeaders(options?.apiKey),
    });

    if (!probeResponse.ok) {
      // Fallback: check /livez if /probe fails (for k8s compatibility)
      const livezUrl = `${baseUrl}/livez`;
      const livezResponse = await fetch(livezUrl, {
        method: 'GET',
        signal: options?.signal || controller.signal,
        headers: processAuthHeaders(options?.apiKey),
      });
      if (!livezResponse.ok) {
        return {
          ok: false,
          url: targetUrl,
          status: probeResponse.status,
          contentType: probeResponse.headers.get('content-type'),
          legacyRedirectDetected: false,
          details: `Probe check failed at both ${probeUrl} and ${livezUrl}`,
        };
      }
    }

    return {
      ok: response.ok,
      url: targetUrl,
      status: response.status,
      contentType,
      legacyRedirectDetected: false,
      details: response.ok
        ? undefined
        : `Unexpected non-2xx status: ${response.status}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Stop (hibernate) a deployed process.
 */
export async function stop(
  cid: string,
  options?: { gatewayUrl?: string; apiKey?: string }
): Promise<{ cid: string; state: string }> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  return apiRequest<{ cid: string; state: string }>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/stop`,
    { method: 'POST', apiKey: options?.apiKey }
  );
}

/**
 * Start (wake) a hibernated process.
 */
export async function start(
  cid: string,
  options?: { gatewayUrl?: string; apiKey?: string }
): Promise<{ cid: string; state: string }> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  return apiRequest<{ cid: string; state: string }>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/start`,
    { method: 'POST', apiKey: options?.apiKey }
  );
}

/**
 * Migrate a process to a different execution tier.
 */
export async function migrate(
  cid: string,
  tier: 'browser' | 'peer' | 'edge',
  options?: { gatewayUrl?: string; apiKey?: string }
): Promise<{ cid: string; tier: string; state: string }> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  return apiRequest<{ cid: string; tier: string; state: string }>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/migrate`,
    {
      method: 'POST',
      apiKey: options?.apiKey,
      body: JSON.stringify({ tier }),
    }
  );
}

/**
 * Get process logs.
 */
export async function logs(
  cid: string,
  options?: {
    gatewayUrl?: string;
    apiKey?: string;
    limit?: number;
    level?: string;
  }
): Promise<{ logs: DeploymentLog[]; count: number }> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.level) params.set('level', options.level);
  const qs = params.toString();
  return apiRequest<{ logs: DeploymentLog[]; count: number }>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/logs${qs ? '?' + qs : ''}`,
    { method: 'GET', apiKey: options?.apiKey }
  );
}

/**
 * Get process metrics.
 */
export async function metrics(
  cid: string,
  options?: { gatewayUrl?: string; apiKey?: string }
): Promise<DeploymentMetrics> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  return apiRequest<DeploymentMetrics>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/metrics`,
    { method: 'GET', apiKey: options?.apiKey }
  );
}

/**
 * List all deployments.
 */
export async function list(options?: {
  gatewayUrl?: string;
  apiKey?: string;
  owner?: string;
}): Promise<{ processes: DeploymentListItem[]; count: number }> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  const params = new URLSearchParams();
  if (options?.owner) params.set('owner', options.owner);
  const qs = params.toString();
  return apiRequest<{ processes: DeploymentListItem[]; count: number }>(
    `${gatewayUrl}/v1/aeon-deploy/list${qs ? '?' + qs : ''}`,
    { method: 'GET', apiKey: options?.apiKey }
  );
}

/**
 * Register a custom domain (CNAME) for a process.
 */
export async function registerCname(
  cid: string,
  domain: string,
  options?: { gatewayUrl?: string; apiKey?: string }
): Promise<CnameRegistration> {
  const gatewayUrl = options?.gatewayUrl || DEFAULT_GATEWAY;
  return apiRequest<CnameRegistration>(
    `${gatewayUrl}/v1/aeon-deploy/${cid}/cname`,
    {
      method: 'POST',
      apiKey: options?.apiKey,
      body: JSON.stringify({ domain }),
    }
  );
}

/**
 * Seed D1/KV data for a deployed process.
 */
export async function seed(config: SeedConfig): Promise<{ ok: boolean }> {
  const { existsSync, readFileSync, readdirSync } = await import('fs');
  const { join } = await import('path');

  if (!existsSync(config.fromDir)) {
    throw new Error(`Seed directory not found: ${config.fromDir}`);
  }

  const gatewayUrl = config.gatewayUrl || DEFAULT_GATEWAY;

  // Read all seed files
  const seedFiles = readdirSync(config.fromDir).filter(
    (f) => f.endsWith('.json') || f.endsWith('.sql')
  );

  for (const file of seedFiles) {
    const content = readFileSync(join(config.fromDir, file), 'utf-8');
    const key = file.replace(/\.(json|sql)$/, '');

    // POST to the process's KV via the deploy API
    // This is a simplified approach — full implementation would use bulk KV operations
    await apiRequest<{ ok: boolean }>(
      `${gatewayUrl}/v1/aeon-deploy/${config.name}/seed`,
      {
        method: 'POST',
        apiKey: config.apiKey,
        body: JSON.stringify({
          key,
          content,
          type: file.endsWith('.sql') ? 'sql' : 'json',
        }),
      }
    );
  }

  return { ok: true };
}

/**
 * Seed repository content into aeon-container D1 index.
 * This is the Dash -> D1 bridge for CLI-seeded workspaces.
 */
export async function seedContainerRepo(
  config: AeonContainerRepoSeedConfig
): Promise<AeonContainerRepoSeedResult> {
  const sourceType =
    config.sourceType || (config.repoUrl ? 'github-public' : 'local-import');
  let files = config.files || [];

  if (sourceType === 'local-import' && config.fromDir) {
    files = await loadRepoSeedFilesFromDir(config.fromDir);
  }

  if (sourceType === 'local-import' && files.length === 0) {
    throw new Error(
      'No local files to ingest. Provide --from directory or inline files.'
    );
  }

  if (sourceType !== 'local-import' && !config.repoUrl) {
    throw new Error('repoUrl is required for github source ingest');
  }

  return containerApiRequest<AeonContainerRepoSeedResult>(
    config.endpointBaseUrl,
    '/repos/ingest',
    {
      method: 'POST',
      apiKey: config.apiKey,
      ucanToken: config.ucanToken,
      body: JSON.stringify({
        container_id: config.containerId,
        source_type: sourceType,
        repo_url: config.repoUrl,
        repo_ref: config.repoRef || 'HEAD',
        files: sourceType === 'local-import' ? files : undefined,
      }),
    }
  );
}

/**
 * Persist a workspace snapshot to D1-backed aeon-container metadata.
 */
export async function snapshotContainerWorkspace(
  config: AeonContainerSnapshotConfig
): Promise<AeonContainerSnapshotResult> {
  return containerApiRequest<AeonContainerSnapshotResult>(
    config.endpointBaseUrl,
    `/fs/${encodeURIComponent(config.containerId)}/snapshot`,
    {
      method: 'POST',
      apiKey: config.apiKey,
      ucanToken: config.ucanToken,
      body: '{}',
    }
  );
}

/**
 * Stream generic process SSE output from /stream.
 */
export async function streamProcess(
  process: string,
  request: ProcessStreamRequest,
  options?: ProcessRequestOptions
): Promise<AsyncGenerator<ProcessStreamEvent>> {
  const payload: Record<string, unknown> = {
    format: request.format || 'text',
  };

  if (request.model) payload.model = request.model;
  if (request.system) payload.system = request.system;
  if (typeof request.chunkSize === 'number')
    payload.chunkSize = request.chunkSize;
  if (typeof request.maxTokens === 'number')
    payload.maxTokens = request.maxTokens;
  if (typeof request.temperature === 'number') {
    payload.temperature = request.temperature;
  }

  const inputText =
    request.text || request.prompt || request.input || request.message || '';
  if (inputText) {
    payload.text = inputText;
  }

  const response = await processRequest(
    process,
    '/stream',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    options
  );

  if (!response.body) {
    throw new Error('Process stream response did not include a body');
  }

  return parseSseStream(response.body);
}

/**
 * Stream OpenAI-compatible chat completions from a process host.
 */
export async function streamProcessOpenAIChat(
  process: string,
  request: ProcessOpenAIChatRequest,
  options?: ProcessRequestOptions
): Promise<AsyncGenerator<ProcessStreamEvent>> {
  const response = await processRequest(
    process,
    '/v1/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: true }),
    },
    options
  );

  if (!response.body) {
    throw new Error('OpenAI process stream response did not include a body');
  }

  return parseSseStream(response.body);
}

/**
 * Stream Anthropic-compatible message events from a process host.
 */
export async function streamProcessAnthropicMessages(
  process: string,
  request: ProcessAnthropicMessageRequest,
  options?: ProcessRequestOptions
): Promise<AsyncGenerator<ProcessStreamEvent>> {
  const response = await processRequest(
    process,
    '/anthropic/v1/messages',
    {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: true }),
    },
    options
  );

  if (!response.body) {
    throw new Error('Anthropic process stream response did not include a body');
  }

  return parseSseStream(response.body);
}

/* ------------------------------------------------------------------ */
/*  registerAeonPid — Programmatic AeonPID registration               */
/* ------------------------------------------------------------------ */

export interface RegisterAeonPidConfig {
  appName: string;
  env?: 'dev' | 'staging' | 'production';
  gatewayUrl?: string;
  ownerDid?: string;
  apiKey?: string;
  appDir?: string;
  dryRun?: boolean;
}

export interface RegisterAeonPidResult {
  cid: string;
  processName: string;
  siteHost: string;
  state: string;
}

interface RegistrationApp {
  appDir: string;
  cleanup: () => void;
}

function processNameForEnv(
  app: string,
  env: 'dev' | 'staging' | 'production'
): string {
  switch (env) {
    case 'production':
      return app;
    case 'staging':
      return `staging-${app}`;
    case 'dev':
      return `dev-${app}`;
  }
}

function siteHostForEnv(
  app: string,
  env: 'dev' | 'staging' | 'production'
): string {
  switch (env) {
    case 'production':
      return `www-${app}.edgework.ai`;
    case 'staging':
      return `staging-www-${app}.edgework.ai`;
    case 'dev':
      return `dev-www-${app}.edgework.ai`;
  }
}

function registerReadPackageVersion(appDir: string): string {
  const packageJsonPath = join(appDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return '0.0.0';
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    version?: string;
  };
  return packageJson.version || '0.0.0';
}

function createRegistrationApp(
  appDir: string,
  appName: string,
  processName: string,
  env: 'dev' | 'staging' | 'production',
  siteHost: string
): RegistrationApp {
  const stagingDir = mkdtempSync(
    join(tmpdir(), `edgework-sdk-register-${appName}-${env}-`)
  );
  const distDir = join(stagingDir, 'dist');
  mkdirSync(distDir, { recursive: true });

  const version = registerReadPackageVersion(appDir);
  const workerUrl = `https://${siteHost}`;
  const manifest = {
    name: processName,
    version,
    description: `${appName} registration envelope for edgework.ai`,
    entryPoint: '/index.html',
    language: 'typescript',
    runtime: 'cloudflare-workers',
    tier: 'edge',
    routes: ['/'],
    workerUrl,
    capabilities: ['services'],
    metadata: {
      environment: env,
      siteHost,
      generatedBy: 'edgework-sdk/registerAeonPid',
      generatedAt: new Date().toISOString(),
    },
  };

  writeFileSync(
    join(stagingDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${processName}</title>
  <meta name="description" content="Edgework registration envelope for ${appName}" />
</head>
<body>
  <main>
    <h1>${appName} registered</h1>
    <p>Process: <strong>${processName}</strong></p>
    <p>Host: <a href="https://${siteHost}">${siteHost}</a></p>
  </main>
</body>
</html>
`;

  writeFileSync(join(distDir, 'index.html'), indexHtml);

  return {
    appDir: stagingDir,
    cleanup: () => {
      rmSync(stagingDir, { recursive: true, force: true });
    },
  };
}

function registerSleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Register an app with the Edgework deploy gateway (AeonPID).
 *
 * This is the canonical programmatic entry point — CLI commands and scripts
 * are thin wrappers around this function.
 */
export async function registerAeonPid(
  config: RegisterAeonPidConfig
): Promise<RegisterAeonPidResult> {
  const env = config.env || 'production';
  const gatewayUrl = config.gatewayUrl || DEFAULT_GATEWAY;
  const ownerDid =
    config.ownerDid ||
    process.env.EDGEWORK_OWNER_DID ||
    'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
  const apiKey = config.apiKey || resolveEdgeworkApiKey();

  const processName = processNameForEnv(config.appName, env);
  const siteHost = siteHostForEnv(config.appName, env);

  // Resolve app directory — check cwd first (when run from app dir),
  // then try repo-root/apps/<name>
  let appDir: string;
  if (config.appDir) {
    appDir = resolvePath(config.appDir);
  } else {
    const cwd = process.cwd();
    const cwdAppsPath = join(cwd, 'apps', config.appName);
    if (existsSync(join(cwdAppsPath, 'package.json'))) {
      appDir = cwdAppsPath;
    } else if (
      existsSync(join(cwd, 'package.json')) &&
      cwd.endsWith(config.appName)
    ) {
      appDir = cwd;
    } else {
      appDir = cwdAppsPath;
    }
  }

  if (!existsSync(join(appDir, 'package.json'))) {
    throw new Error(
      `Unable to resolve app directory for "${config.appName}". Expected ${appDir}/package.json to exist.`
    );
  }

  const registrationApp = createRegistrationApp(
    appDir,
    config.appName,
    processName,
    env,
    siteHost
  );

  console.log(`Registering AeonPID: ${processName}`);
  console.log(`  app:       ${config.appName}`);
  console.log(`  env:       ${env}`);
  console.log(`  host:      ${siteHost}`);
  console.log(`  gateway:   ${gatewayUrl}`);
  console.log(`  owner DID: ${ownerDid}`);
  console.log(`  app dir:   ${registrationApp.appDir}`);

  try {
    if (config.dryRun) {
      console.log('Dry run enabled. Skipping deploy call.');
      return { cid: 'dry-run', processName, siteHost, state: 'dry-run' };
    }

    let cid: string;

    try {
      const result = await deploy({
        appDir: registrationApp.appDir,
        name: processName,
        gatewayUrl,
        ownerDid,
        apiKey,
        tier: 'edge',
        build: { skipBuild: true },
      });

      cid = result.cid;
      console.log('AeonPID registration complete.');
      console.log(`  cid:     ${result.cid}`);
      console.log(`  url:     ${result.url}`);
      console.log(`  r2 key:  ${result.r2Key}`);
      console.log(`  updated: ${result.updated}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const payloadTooLarge =
        message.includes('Deploy API error (413)') ||
        message.toLowerCase().includes('payload too large') ||
        message.toLowerCase().includes('socket connection was closed') ||
        message.toLowerCase().includes('fetch failed');

      if (!payloadTooLarge) {
        throw error;
      }

      console.warn(
        `AeonPID upload too large for ${processName}; checking existing process...`
      );

      const processes = await list({ gatewayUrl, apiKey });
      const existing = processes.processes.find((p) => p.name === processName);

      if (!existing) {
        throw error;
      }

      console.warn(`Reusing existing AeonPID ${processName} (${existing.cid})`);
      cid = existing.cid;
    }

    // Poll for non-spawn state
    let state = 'spawn';
    let latest = await getStatus(cid, { gatewayUrl, apiKey });
    state = latest.state;

    if (state === 'spawn') {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await registerSleepMs(1000);
        latest = await getStatus(cid, { gatewayUrl, apiKey });
        state = latest.state;
        if (state !== 'spawn') break;
      }
    }

    console.log('Gateway status:');
    console.log(`  state: ${state}`);
    console.log(`  tier:  ${latest.tier}`);

    return { cid, processName, siteHost, state };
  } finally {
    registrationApp.cleanup();
  }
}
