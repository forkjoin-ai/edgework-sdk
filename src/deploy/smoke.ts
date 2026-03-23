import { writeFile } from 'node:fs/promises';

const DEFAULT_SMOKE_MAX_WAIT_MS = 120_000;
const DEFAULT_SMOKE_RETRY_INTERVAL_MS = 5_000;
const MCP_SESSION_HEADER = 'mcp-session-id';

type Awaitable<T> = T | Promise<T>;

type SmokeHeaders = HeadersInit | undefined;

export interface SmokeCleanup {
  name: string;
  run: () => Awaitable<void>;
}

export interface SmokeStep {
  name: string;
  run: (context: SmokeContext) => Awaitable<void>;
}

export interface SmokeStepResult {
  name: string;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error?: string;
}

export interface SmokeLiveRouteResult {
  path: string;
  url: string;
  attempts: number;
  status: number;
  durationMs: number;
}

export interface SmokeResult {
  suite: string;
  baseUrl: string;
  runId: string;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  liveRoute?: SmokeLiveRouteResult;
  steps: SmokeStepResult[];
  cleanup: {
    attempted: number;
    failed: number;
    failures: string[];
  };
  metadata: Record<string, unknown>;
  failedStep?: string;
  failureMessage?: string;
}

export interface WaitForLiveRouteOptions {
  path: string;
  init?: RequestInit;
  timeoutMs?: number;
  retryIntervalMs?: number;
  validate?: (response: Response, bodyText: string) => boolean;
}

export interface ProbeHtmlOptions {
  headers?: SmokeHeaders;
}

export interface ProbeJsonOptions {
  headers?: SmokeHeaders;
}

export interface ProbeExpectedStatusOptions {
  headers?: SmokeHeaders;
}

export interface ProbeWellKnownOptions {
  headers?: SmokeHeaders;
}

export interface SmokeSuite {
  name: string;
  baseUrl: string;
  waitFor?: WaitForLiveRouteOptions;
  steps: SmokeStep[];
  reportPath?: string;
  runId?: string;
  maxWaitMs?: number;
  retryIntervalMs?: number;
}

export interface McpSession {
  endpoint: string;
  sessionId: string;
  initializedAt: string;
}

export interface McpCallResult<TResult = unknown> {
  id: string | number | null;
  sessionId: string;
  result: TResult;
}

export interface SmokeFetchJsonResult<T> {
  response: Response;
  text: string;
  data: T;
}

export interface SmokeContext {
  baseUrl: string;
  runId: string;
  maxWaitMs: number;
  retryIntervalMs: number;
  metadata: Record<string, unknown>;
  state: Map<string, unknown>;
  onCleanup: (name: string, cleanup: () => Awaitable<void>) => void;
  setMetadata: (key: string, value: unknown) => void;
  assert: (condition: unknown, message: string) => asserts condition;
  fail: (message: string) => never;
  resolveUrl: (pathOrUrl: string) => string;
  fetch: (pathOrUrl: string, init?: RequestInit) => Promise<Response>;
  fetchText: (
    pathOrUrl: string,
    init?: RequestInit
  ) => Promise<{ response: Response; text: string }>;
  fetchJson: <T>(
    pathOrUrl: string,
    init?: RequestInit
  ) => Promise<SmokeFetchJsonResult<T>>;
  probeHtml: (
    pathOrUrl: string,
    options?: ProbeHtmlOptions
  ) => Promise<{ response: Response; text: string }>;
  probeJson: <T>(
    pathOrUrl: string,
    options?: ProbeJsonOptions
  ) => Promise<SmokeFetchJsonResult<T>>;
  probeExpectedStatus: (
    pathOrUrl: string,
    expectedStatus: number | number[],
    options?: ProbeExpectedStatusOptions
  ) => Promise<Response>;
  probeWellKnown: <T>(
    pathOrUrl: string,
    options?: ProbeWellKnownOptions
  ) => Promise<SmokeFetchJsonResult<T>>;
  waitForLiveRoute: (
    options: WaitForLiveRouteOptions
  ) => Promise<SmokeLiveRouteResult>;
  withRetry: <T>(
    label: string,
    run: () => Promise<T>,
    options?: { timeoutMs?: number; retryIntervalMs?: number }
  ) => Promise<T>;
  mcpInitialize: <TResult = unknown>(
    pathOrUrl?: string,
    params?: Record<string, unknown>,
    init?: RequestInit
  ) => Promise<McpCallResult<TResult>>;
  mcpListTools: <TResult = unknown>(
    pathOrUrl?: string,
    init?: RequestInit
  ) => Promise<McpCallResult<TResult>>;
  mcpListResources: <TResult = unknown>(
    pathOrUrl?: string,
    init?: RequestInit
  ) => Promise<McpCallResult<TResult>>;
  mcpCallTool: <TResult = unknown>(
    name: string,
    args?: Record<string, unknown>,
    pathOrUrl?: string,
    init?: RequestInit
  ) => Promise<McpCallResult<TResult>>;
  mcpReadResource: <TResult = unknown>(
    uri: string,
    pathOrUrl?: string,
    init?: RequestInit
  ) => Promise<McpCallResult<TResult>>;
}

function normalizeBaseUrl(rawBaseUrl: string): string {
  return rawBaseUrl.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRunId(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : crypto.randomUUID();
}

function resolveMaxWaitMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SMOKE_MAX_WAIT_MS;
}

function resolveRetryIntervalMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SMOKE_RETRY_INTERVAL_MS;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function mergeHeaders(
  headers: SmokeHeaders,
  extraHeaders?: SmokeHeaders
): Headers {
  const merged = new Headers(headers ?? {});
  const additions = new Headers(extraHeaders ?? {});
  additions.forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}

function parseJsonText<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Expected JSON response but received invalid JSON: ${toErrorMessage(
        error
      )}`
    );
  }
}

function detectLegacyWorkersRedirect(content: string): boolean {
  const jsLocationRedirect =
    /window\.location(?:\.(?:href|assign|replace))?[\s=('"`]*https?:\/\/[a-z0-9.-]+\.workers\.dev/i;
  const metaRefreshRedirect =
    /<meta[^>]+http-equiv=["']refresh["'][^>]+url=https?:\/\/[^\s"'<>]+\.workers\.dev/i;
  return jsLocationRedirect.test(content) || metaRefreshRedirect.test(content);
}

async function readResponseText(response: Response): Promise<string> {
  return response.text();
}

async function readJsonResponse<T>(
  pathOrUrl: string,
  fetcher: (pathOrUrl: string, init?: RequestInit) => Promise<Response>,
  init?: RequestInit
): Promise<SmokeFetchJsonResult<T>> {
  const response = await fetcher(pathOrUrl, init);
  const text = await readResponseText(response);
  if (!response.ok) {
    throw new Error(
      `${pathOrUrl} returned ${response.status}: ${text || response.statusText}`
    );
  }
  return {
    response,
    text,
    data: parseJsonText<T>(text),
  };
}

export function resolveSmokeBaseUrl(
  defaultBaseUrl: string,
  specificEnvVar?: string
): string {
  const specificValue =
    specificEnvVar !== undefined ? process.env[specificEnvVar]?.trim() : '';
  if (specificValue) {
    return normalizeBaseUrl(specificValue);
  }
  const sharedValue = process.env.SMOKE_BASE_URL?.trim();
  if (sharedValue) {
    return normalizeBaseUrl(sharedValue);
  }
  return normalizeBaseUrl(defaultBaseUrl);
}

export function resolveSmokeSuiteOptions(
  baseUrl: string,
  options?: Pick<
    SmokeSuite,
    'runId' | 'maxWaitMs' | 'retryIntervalMs' | 'reportPath'
  >
): {
  baseUrl: string;
  runId: string;
  maxWaitMs: number;
  retryIntervalMs: number;
  reportPath?: string;
} {
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    runId: normalizeRunId(options?.runId ?? process.env.SMOKE_RUN_ID),
    maxWaitMs:
      options?.maxWaitMs ?? resolveMaxWaitMs(process.env.SMOKE_MAX_WAIT_MS),
    retryIntervalMs:
      options?.retryIntervalMs ??
      resolveRetryIntervalMs(process.env.SMOKE_RETRY_INTERVAL_MS),
    reportPath:
      options?.reportPath ??
      (process.env.SMOKE_REPORT_PATH?.trim() || undefined),
  };
}

export async function withRetry<T>(
  label: string,
  run: () => Promise<T>,
  options?: { timeoutMs?: number; retryIntervalMs?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SMOKE_MAX_WAIT_MS;
  const retryIntervalMs =
    options?.retryIntervalMs ?? DEFAULT_SMOKE_RETRY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (true) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      const delayMs = Math.min(retryIntervalMs, remainingMs);
      if (delayMs <= 1) {
        await new Promise<void>((resolvePromise) => {
          queueMicrotask(resolvePromise);
        });
        continue;
      }
      await new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, delayMs);
      });
    }
  }

  throw new Error(
    `${label} did not succeed within ${timeoutMs}ms: ${toErrorMessage(
      lastError
    )}`
  );
}

export async function runSmokeSuite(suite: SmokeSuite): Promise<SmokeResult> {
  const resolved = resolveSmokeSuiteOptions(suite.baseUrl, {
    runId: suite.runId,
    maxWaitMs: suite.maxWaitMs,
    retryIntervalMs: suite.retryIntervalMs,
    reportPath: suite.reportPath,
  });
  const cleanups: SmokeCleanup[] = [];
  const metadata: Record<string, unknown> = {};
  const state = new Map<string, unknown>();
  const mcpSessions = new Map<string, McpSession>();
  let liveRouteResult: SmokeLiveRouteResult | undefined;
  const startedAt = Date.now();
  const stepResults: SmokeStepResult[] = [];
  let failedStep: string | undefined;
  let failureMessage: string | undefined;

  const context: SmokeContext = {
    baseUrl: resolved.baseUrl,
    runId: resolved.runId,
    maxWaitMs: resolved.maxWaitMs,
    retryIntervalMs: resolved.retryIntervalMs,
    metadata,
    state,
    onCleanup: (name, cleanup) => {
      cleanups.push({ name, run: cleanup });
    },
    setMetadata: (key, value) => {
      metadata[key] = value;
    },
    assert: (condition, message): asserts condition => {
      if (!condition) {
        throw new Error(message);
      }
    },
    fail: (message): never => {
      throw new Error(message);
    },
    resolveUrl: (pathOrUrl): string => {
      if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
      }
      const normalizedPath = pathOrUrl.startsWith('/')
        ? pathOrUrl
        : `/${pathOrUrl}`;
      return `${resolved.baseUrl}${normalizedPath}`;
    },
    fetch: async (pathOrUrl, init) => {
      return fetch(context.resolveUrl(pathOrUrl), init);
    },
    fetchText: async (pathOrUrl, init) => {
      const response = await context.fetch(pathOrUrl, init);
      const text = await readResponseText(response);
      return { response, text };
    },
    fetchJson: async <T>(pathOrUrl: string, init?: RequestInit) => {
      return readJsonResponse<T>(pathOrUrl, context.fetch, init);
    },
    probeHtml: async (pathOrUrl, options) => {
      const { response, text } = await context.fetchText(pathOrUrl, {
        method: 'GET',
        headers: options?.headers,
      });
      if (!response.ok) {
        throw new Error(
          `${pathOrUrl} returned ${response.status}: ${
            text || response.statusText
          }`
        );
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error(
          `${pathOrUrl} did not return HTML (content-type: ${
            contentType || 'unknown'
          })`
        );
      }
      if (detectLegacyWorkersRedirect(text)) {
        throw new Error(`${pathOrUrl} leaked a legacy workers.dev redirect`);
      }
      return { response, text };
    },
    probeJson: async <T>(pathOrUrl: string, options?: ProbeJsonOptions) => {
      return readJsonResponse<T>(pathOrUrl, context.fetch, {
        method: 'GET',
        headers: options?.headers,
      });
    },
    probeExpectedStatus: async (pathOrUrl, expectedStatus, options) => {
      const response = await context.fetch(pathOrUrl, {
        method: 'GET',
        headers: options?.headers,
      });
      const accepted = Array.isArray(expectedStatus)
        ? expectedStatus
        : [expectedStatus];
      if (!accepted.includes(response.status)) {
        const text = await response.text();
        throw new Error(
          `${pathOrUrl} returned ${response.status}; expected ${accepted.join(
            ', '
          )}: ${text || response.statusText}`
        );
      }
      return response;
    },
    probeWellKnown: async <T>(
      pathOrUrl: string,
      options?: ProbeWellKnownOptions
    ) => {
      return readJsonResponse<T>(pathOrUrl, context.fetch, {
        method: 'GET',
        headers: options?.headers,
      });
    },
    waitForLiveRoute: async (
      options: WaitForLiveRouteOptions
    ): Promise<SmokeLiveRouteResult> => {
      const targetUrl = context.resolveUrl(options.path);
      const started = Date.now();
      let attempts = 0;
      let finalStatus = 0;
      await withRetry(
        `wait for ${targetUrl}`,
        async () => {
          attempts += 1;
          const response = await context.fetch(targetUrl, options.init);
          const text = await response.text();
          finalStatus = response.status;
          const isValid = options.validate
            ? options.validate(response, text)
            : response.ok;
          if (!isValid) {
            throw new Error(
              `${targetUrl} returned ${response.status}: ${
                text || response.statusText
              }`
            );
          }
          return undefined;
        },
        {
          timeoutMs: options.timeoutMs ?? resolved.maxWaitMs,
          retryIntervalMs: options.retryIntervalMs ?? resolved.retryIntervalMs,
        }
      );
      return {
        path: options.path,
        url: targetUrl,
        attempts,
        status: finalStatus,
        durationMs: Date.now() - started,
      };
    },
    withRetry: async <T>(
      label: string,
      run: () => Promise<T>,
      options?: { timeoutMs?: number; retryIntervalMs?: number }
    ): Promise<T> => {
      return withRetry(label, run, {
        timeoutMs: options?.timeoutMs ?? resolved.maxWaitMs,
        retryIntervalMs: options?.retryIntervalMs ?? resolved.retryIntervalMs,
      });
    },
    mcpInitialize: async <TResult = unknown>(
      pathOrUrl = '/mcp',
      params?: Record<string, unknown>,
      init?: RequestInit
    ): Promise<McpCallResult<TResult>> => {
      return requestMcp<TResult>(
        context,
        mcpSessions,
        pathOrUrl,
        'initialize',
        params,
        init
      );
    },
    mcpListTools: async <TResult = unknown>(
      pathOrUrl = '/mcp',
      init?: RequestInit
    ): Promise<McpCallResult<TResult>> => {
      return requestMcp<TResult>(
        context,
        mcpSessions,
        pathOrUrl,
        'tools/list',
        undefined,
        init
      );
    },
    mcpListResources: async <TResult = unknown>(
      pathOrUrl = '/mcp',
      init?: RequestInit
    ): Promise<McpCallResult<TResult>> => {
      return requestMcp<TResult>(
        context,
        mcpSessions,
        pathOrUrl,
        'resources/list',
        undefined,
        init
      );
    },
    mcpCallTool: async <TResult = unknown>(
      name: string,
      args?: Record<string, unknown>,
      pathOrUrl = '/mcp',
      init?: RequestInit
    ): Promise<McpCallResult<TResult>> => {
      return requestMcp<TResult>(
        context,
        mcpSessions,
        pathOrUrl,
        'tools/call',
        {
          name,
          arguments: args ?? {},
        },
        init
      );
    },
    mcpReadResource: async <TResult = unknown>(
      uri: string,
      pathOrUrl = '/mcp',
      init?: RequestInit
    ): Promise<McpCallResult<TResult>> => {
      return requestMcp<TResult>(
        context,
        mcpSessions,
        pathOrUrl,
        'resources/read',
        { uri },
        init
      );
    },
  };

  if (suite.waitFor) {
    try {
      liveRouteResult = await context.waitForLiveRoute(suite.waitFor);
    } catch (error) {
      failedStep = 'waitForLiveRoute';
      failureMessage = toErrorMessage(error);
    }
  }

  if (!failureMessage) {
    for (const step of suite.steps) {
      const stepStarted = Date.now();
      const startedIso = new Date(stepStarted).toISOString();
      try {
        await step.run(context);
        stepResults.push({
          name: step.name,
          ok: true,
          startedAt: startedIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - stepStarted,
        });
      } catch (error) {
        failedStep = step.name;
        failureMessage = toErrorMessage(error);
        stepResults.push({
          name: step.name,
          ok: false,
          startedAt: startedIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - stepStarted,
          error: failureMessage,
        });
        break;
      }
    }
  }

  const cleanupFailures: string[] = [];
  for (const cleanup of [...cleanups].reverse()) {
    try {
      await cleanup.run();
    } catch (error) {
      cleanupFailures.push(`${cleanup.name}: ${toErrorMessage(error)}`);
    }
  }

  const finishedAt = Date.now();
  const result: SmokeResult = {
    suite: suite.name,
    baseUrl: resolved.baseUrl,
    runId: resolved.runId,
    ok:
      failureMessage === undefined &&
      cleanupFailures.length === 0 &&
      stepResults.every((step) => step.ok),
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    ...(liveRouteResult ? { liveRoute: liveRouteResult } : {}),
    steps: stepResults,
    cleanup: {
      attempted: cleanups.length,
      failed: cleanupFailures.length,
      failures: cleanupFailures,
    },
    metadata,
    ...(failedStep ? { failedStep } : {}),
    ...(failureMessage ? { failureMessage } : {}),
  };

  if (resolved.reportPath) {
    await writeFile(
      resolved.reportPath,
      JSON.stringify(result, null, 2),
      'utf8'
    );
  }

  return result;
}

export async function assertPreferencesRoundTrip(
  context: SmokeContext,
  options: {
    path?: string;
    headers?: SmokeHeaders;
    update: Record<string, unknown>;
    verify?: (preferences: Record<string, unknown>) => boolean;
  }
): Promise<Record<string, unknown>> {
  const path = options.path ?? '/api/preferences';
  const initial = await context.fetchJson<{
    preferences: Record<string, unknown>;
  }>(path, {
    method: 'GET',
    headers: options.headers,
  });
  context.assert(
    isRecord(initial.data.preferences),
    `${path} did not return preferences`
  );

  const updated = await context.fetchJson<{
    preferences: Record<string, unknown>;
  }>(path, {
    method: 'PUT',
    headers: mergeHeaders(options.headers, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(options.update),
  });
  context.assert(
    isRecord(updated.data.preferences),
    `${path} did not return updated preferences`
  );

  if (options.verify) {
    context.assert(
      options.verify(updated.data.preferences),
      `${path} did not persist the expected preference update`
    );
  }

  const reread = await context.fetchJson<{
    preferences: Record<string, unknown>;
  }>(path, {
    method: 'GET',
    headers: options.headers,
  });
  context.assert(
    isRecord(reread.data.preferences),
    `${path} did not return readable preferences after update`
  );
  if (options.verify) {
    context.assert(
      options.verify(reread.data.preferences),
      `${path} did not preserve the preference update on reread`
    );
  }

  return reread.data.preferences;
}

export async function assertFlagsReadable(
  context: SmokeContext,
  options?: {
    path?: string;
    headers?: SmokeHeaders;
    minimumFlags?: number;
  }
): Promise<Record<string, unknown>> {
  const path = options?.path ?? '/api/flags';
  const minimumFlags = options?.minimumFlags ?? 1;
  const response = await context.fetchJson<Record<string, unknown>>(path, {
    method: 'GET',
    headers: options?.headers,
  });
  const flags = response.data.flags;
  context.assert(Array.isArray(flags), `${path} did not return a flags array`);
  context.assert(
    flags.length >= minimumFlags,
    `${path} returned fewer than ${minimumFlags} flags`
  );
  return response.data;
}

async function requestMcp<TResult>(
  context: SmokeContext,
  sessions: Map<string, McpSession>,
  pathOrUrl: string,
  method: string,
  params?: Record<string, unknown>,
  init?: RequestInit
): Promise<McpCallResult<TResult>> {
  const endpoint = context.resolveUrl(pathOrUrl);
  const existingSession = sessions.get(endpoint);
  const headers = mergeHeaders(init?.headers, {
    'content-type': 'application/json',
  });
  if (existingSession) {
    headers.set(MCP_SESSION_HEADER, existingSession.sessionId);
  }

  const response = await context.fetch(endpoint, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}:${crypto.randomUUID()}`,
      method,
      ...(params ? { params } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `MCP ${method} on ${endpoint} returned ${response.status}: ${
        text || response.statusText
      }`
    );
  }

  const payload = parseJsonText<Record<string, unknown>>(text);
  const error = payload.error;
  if (isRecord(error)) {
    const message =
      typeof error.message === 'string' ? error.message : JSON.stringify(error);
    throw new Error(`MCP ${method} on ${endpoint} failed: ${message}`);
  }

  const sessionId = response.headers.get(MCP_SESSION_HEADER);
  if (!existingSession) {
    if (!sessionId) {
      throw new Error(
        `MCP ${method} on ${endpoint} did not return ${MCP_SESSION_HEADER}`
      );
    }
    sessions.set(endpoint, {
      endpoint,
      sessionId,
      initializedAt: new Date().toISOString(),
    });
  } else if (sessionId && sessionId !== existingSession.sessionId) {
    sessions.set(endpoint, {
      endpoint,
      sessionId,
      initializedAt: existingSession.initializedAt,
    });
  }

  const activeSession = sessions.get(endpoint);
  if (!activeSession) {
    throw new Error(`MCP ${method} on ${endpoint} has no active session`);
  }

  return {
    id:
      typeof payload.id === 'string' || typeof payload.id === 'number'
        ? payload.id
        : null,
    sessionId: activeSession.sessionId,
    result: payload.result as TResult,
  };
}
