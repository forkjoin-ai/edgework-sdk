/**
 * Aeon Deploy Types — Configuration and result types for deployment
 */

export interface DeployConfig {
  /** Directory containing the Aeon Flux app to deploy */
  appDir: string;
  /** Process name (DNS-safe, lowercase alphanumeric + hyphens) */
  name: string;
  /** Gateway URL for deployment API */
  gatewayUrl: string;
  /** Owner DID (decentralized identifier) */
  ownerDid: string;
  /** Optional custom domain (CNAME) */
  cname?: string;
  /** Optional API key for authentication (falls back to EDGEWORK_API_KEY env var) */
  apiKey?: string;
  /** Preferred execution tier */
  tier?: 'browser' | 'peer' | 'edge';
  /** Build options */
  build?: {
    /** Skip build step (use existing dist/) */
    skipBuild?: boolean;
    /** Additional build flags */
    flags?: string[];
  };
}

export interface DeployResult {
  /** Content-addressed identifier (SHA-256 of envelope) */
  cid: string;
  /** Process name */
  name: string;
  /** Public URL */
  url: string;
  /** R2 storage key for the envelope */
  r2Key: string;
  /** Whether this was an update to an existing deployment */
  updated: boolean;
  /** ISO timestamp of deployment */
  deployedAt?: string;
  /** Git commit hash of deployed code */
  commitHash?: string;
  /** CI build ID */
  buildId?: string;
}

export type DeploymentState =
  | 'spawn'
  | 'loading'
  | 'running'
  | 'migrating'
  | 'hibernated'
  | 'terminated';

export interface DeploymentStatus {
  cid: string;
  name: string;
  ownerDid: string;
  state: DeploymentState;
  tier: 'browser' | 'peer' | 'edge';
  url: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
  tokensSpent: number;
  manifest: Record<string, unknown>;
}

export interface DeploymentMetrics {
  cid: string;
  requestCount: number;
  tokensSpent: number;
  state: DeploymentState;
  tier: string;
  uptimeMs: number;
  requestsPerMinute: string;
}

export interface DeploymentLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  createdAt: string;
}

export interface DeploymentListItem {
  cid: string;
  name: string;
  ownerDid: string;
  state: DeploymentState;
  tier: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
  tokensSpent: number;
}

export interface CnameRegistration {
  domain: string;
  processName: string;
  verified: boolean;
  instructions: string;
}

export interface SeedConfig {
  /** Process name to seed data for */
  name: string;
  /** Directory containing seed files */
  fromDir: string;
  /** Gateway URL */
  gatewayUrl: string;
  /** API key for authentication (falls back to EDGEWORK_API_KEY env var) */
  apiKey?: string;
}

export type AeonContainerRepoSourceType =
  | 'github-public'
  | 'github-private'
  | 'local-import';

export interface AeonContainerRepoSeedFile {
  path: string;
  content: string;
  language?: string;
}

export interface AeonContainerRepoSeedConfig {
  containerId: string;
  endpointBaseUrl: string;
  sourceType?: AeonContainerRepoSourceType;
  repoUrl?: string;
  repoRef?: string;
  fromDir?: string;
  files?: AeonContainerRepoSeedFile[];
  ucanToken?: string;
  apiKey?: string;
}

export interface AeonContainerRepoSeedResult {
  ok: boolean;
  repo_id: string;
  container_id: string;
  source_type: AeonContainerRepoSourceType;
  total_files: number;
  indexed_files: number;
  symbols: number;
}

export interface AeonContainerSnapshotConfig {
  containerId: string;
  endpointBaseUrl: string;
  ucanToken?: string;
  apiKey?: string;
}

export interface AeonContainerSnapshotResult {
  snapshot_id: string;
  snapshot_key: string;
  files_count: number;
  manifest_hash: string;
  timestamp: number;
}

export type ProcessStreamFormat = 'text' | 'metadata' | 'openai' | 'anthropic';

export interface ProcessRequestOptions {
  /** Override process base URL (e.g. https://my-process.edgework.ai) */
  processUrl?: string;
  /** Optional API key for auth headers */
  apiKey?: string;
  /** Optional abort signal */
  signal?: AbortSignal;
}

export interface ProcessStreamRequest {
  /** Prompt text (alias: text/input/message) */
  prompt?: string;
  text?: string;
  input?: string;
  message?: string;
  /** Stream format */
  format?: ProcessStreamFormat;
  /** Model hint */
  model?: string;
  /** Optional system instruction */
  system?: string;
  /** Chunk size for text streaming */
  chunkSize?: number;
  /** Generation controls */
  maxTokens?: number;
  temperature?: number;
}

export interface ProcessOpenAIChatRequest {
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'developer';
    content: string;
  }>;
}

export interface ProcessAnthropicMessageRequest {
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'developer';
    content:
      | string
      | Array<{
          type: 'text';
          text: string;
        }>;
  }>;
}

export interface ProcessStreamEvent {
  event: string;
  data: string;
  json?: unknown;
}

export interface SiteSmokeTestOptions extends ProcessRequestOptions {
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

export interface SiteSmokeTestResult {
  ok: boolean;
  url: string;
  status: number;
  contentType: string | null;
  legacyRedirectDetected: boolean;
  details?: string;
}

export type QualityTargetSource =
  | 'workspace'
  | 'gateway'
  | 'all'
  | 'workspace+gateway'
  | 'manual';

export type QualityIssueSeverity = 'error' | 'warn';

export type QualityIssueCode =
  | 'missing-path-implementation'
  | 'missing-worker-route'
  | 'missing-client-root'
  | 'smoke-path-failed'
  | 'legacy-workers-redirect'
  | 'gateway-discovery-failed'
  | 'invalid-target';

export interface QualityIssue {
  code: QualityIssueCode;
  severity: QualityIssueSeverity;
  message: string;
  path?: string;
  process?: string;
  appDir?: string;
  suggestion?: string;
}

export interface QualityPathSpec {
  path: string;
  category:
    | 'legal'
    | 'seo'
    | 'icon'
    | 'manifest'
    | 'agent'
    | 'well-known'
    | 'custom';
  required: boolean;
  severityWhenMissing?: QualityIssueSeverity;
}

export interface QualityTarget {
  name: string;
  source: QualityTargetSource;
  appDir?: string;
  configPath?: string;
  aeonPid?: string;
  cid?: string;
  state?: string;
}

export interface GatewayQualityTarget extends QualityTarget {
  source: 'gateway';
}

export interface QualityPathStatus {
  path: string;
  category: QualityPathSpec['category'];
  required: boolean;
  linkedCount: number;
  exists: boolean;
  candidate?: string;
  worker: 'yes' | 'no' | 'n/a';
  client: 'yes' | 'no' | 'n/a';
  issues: QualityIssue[];
}

export interface QualityPathSmokeResult {
  path: string;
  url: string;
  ok: boolean;
  status: number;
  contentType: string | null;
  legacyRedirectDetected: boolean;
  details?: string;
}

export interface SitePathSmokeTestOptions {
  apiKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  processUrlByName?: Record<string, string>;
}

export interface SitePathSmokeTestResult {
  process: string;
  baseUrl: string;
  paths: QualityPathSmokeResult[];
  ok: boolean;
  failures: QualityPathSmokeResult[];
}

export interface SmokeCleanup {
  name: string;
  run: () => void | Promise<void>;
}

export interface SmokeStep {
  name: string;
  run: (context: SmokeContext) => void | Promise<void>;
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
  onCleanup: (name: string, cleanup: () => void | Promise<void>) => void;
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
    options?: { headers?: HeadersInit | undefined }
  ) => Promise<{ response: Response; text: string }>;
  probeJson: <T>(
    pathOrUrl: string,
    options?: { headers?: HeadersInit | undefined }
  ) => Promise<SmokeFetchJsonResult<T>>;
  probeExpectedStatus: (
    pathOrUrl: string,
    expectedStatus: number | number[],
    options?: { headers?: HeadersInit | undefined }
  ) => Promise<Response>;
  probeWellKnown: <T>(
    pathOrUrl: string,
    options?: { headers?: HeadersInit | undefined }
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

export interface QualitySmokeOptions extends SitePathSmokeTestOptions {
  paths?: string[];
}

export interface QualityTargetReport {
  target: QualityTarget;
  pathResults: QualityPathStatus[];
  smoke?: SitePathSmokeTestResult;
  issues: QualityIssue[];
  ok: boolean;
}

export interface QualityAutopilotResolvedOptions {
  workspaceRoot: string;
  appsDir: string;
  source: QualityTargetSource;
  smoke: boolean;
  strict: boolean;
  targets: string[];
  excludeTargets: string[];
  pathSpecs: QualityPathSpec[];
}

export interface QualityAutopilotReport {
  generatedAt: string;
  options: QualityAutopilotResolvedOptions;
  targets: QualityTargetReport[];
  summary: {
    targets: number;
    issues: number;
    errors: number;
    warnings: number;
    smokeFailures: number;
  };
  ok: boolean;
}

export interface QualityAutopilotOptions {
  workspaceRoot?: string;
  appsDir?: string;
  source?: 'workspace' | 'gateway' | 'all';
  targets?: string;
  excludeTargets?: string;
  paths?: string;
  pathSpecs?: QualityPathSpec[];
  smoke?: boolean;
  smokePaths?: string;
  smokeTimeoutMs?: number;
  strict?: boolean;
  gatewayUrl?: string;
  owner?: string;
  processUrlByName?: Record<string, string>;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface FeatureToggles {
  analytics: boolean;
  sitemap: boolean;
  robots: boolean;
  metadata: boolean;
  esi: boolean;
  dashrelay: boolean;
  dash: boolean;
  neural: boolean;
  presence: boolean;
  ucan: boolean;
  zk: boolean;
  d1: boolean;
  r2: boolean;
  kv: boolean;
  mcp: boolean;
}

export interface QualityPolicy {
  staticThreshold: number;
  interactiveThreshold: number;
  crawlFromSitemap: boolean;
  strict: boolean;
  ratchetToHundred: boolean;
}

export interface AeonConfig {
  project: {
    name: string;
    runtime: 'cloudflare-worker';
    deploymentTarget: string;
  };
  preset: 'all' | 'core' | 'minimal' | 'mcp-server';
  features: FeatureToggles;
  quality: QualityPolicy;
  integrations: {
    dashrelayChannels: string[];
    analyticsId: string;
    observabilitySink: string;
    mcpServerCommand: string;
  };
  storage: {
    d1Binding: string;
    kvBinding: string;
    r2Binding: string;
    migrationStrategy: 'safe';
  };
  security: {
    ucanIssuer: string;
    ucanAudience: string;
    zkVerificationMode: 'strict' | 'permissive';
  };
  performance: {
    esiMode: 'deep' | 'light';
    prefetch: boolean;
    speculation: boolean;
    cacheControl: string;
  };
}

export interface ScaffoldOptions {
  targetDir: string;
  preset?: AeonConfig['preset'];
  configPath?: string;
  enable?: string[];
  disable?: string[];
  install?: boolean;
  serve?: boolean;
  quality?: boolean;
}

export type SourceRefKind = 'url' | 'slug' | 'pid' | 'deployment-id' | 'cid';

export interface SourceRef {
  input: string;
  kind: SourceRefKind;
  value: string;
  processName?: string;
  cid?: string;
  baseUrl?: string;
}

export interface CloneOptions {
  source: string;
  targetDir: string;
  mode?: 'full';
  install?: boolean;
  serve?: boolean;
  envTemplateOnly?: boolean;
  gatewayUrl?: string;
  apiKey?: string;
}

export interface ScaffoldResult {
  targetDir: string;
  config: AeonConfig;
  filesWritten: string[];
  installed: boolean;
  served: boolean;
  qualityReport?: {
    ok: boolean;
    issues: string[];
  };
}

export interface CloneResult {
  targetDir: string;
  source: SourceRef;
  filesWritten: string[];
  installed: boolean;
  served: boolean;
  downloadedPaths: string[];
}
