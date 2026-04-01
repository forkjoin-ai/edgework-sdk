/**
 * Forgo Logs — Shared Types
 *
 * All interfaces and types for the self-hosted observability platform.
 * Used across CRDT manager, D1 sink, R2 archiver, worker routes, and MCP tools.
 */

// ── Log Entry ────────────────────────────────────────────────────────

export type ForgoLogSource =
  | 'forgo-cd'
  | 'workflow'
  | 'worker'
  | 'app'
  | 'gnosis'
  | 'system';
export type ForgoLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type ForgoLogCategory =
  | 'deploy'
  | 'health'
  | 'request'
  | 'build'
  | 'topological'
  | 'cron'
  | 'general';

export interface ForgoLogEntry {
  id: string;
  orgId: string;
  source: ForgoLogSource;
  level: ForgoLogLevel;
  category: ForgoLogCategory;
  message: string;
  metadata?: Record<string, unknown>;
  encryptedPayload?: string;
  encryptionKeyId?: string;
  traceId?: string;
  spanId?: string;
  workerName?: string;
  createdAt: number;
  expiresAt: number;
}

// ── Analytics Event ──────────────────────────────────────────────────

export type ForgoAnalyticsEventType =
  | 'deploy'
  | 'rollback'
  | 'health_check'
  | 'build'
  | 'topological'
  | 'error'
  | 'metric';

export interface ForgoAnalyticsEvent {
  id: string;
  orgId: string;
  eventType: ForgoAnalyticsEventType;
  eventName: string;
  value?: number;
  dimensions?: Record<string, string>;
  createdAt: number;
}

// ── Rollup ───────────────────────────────────────────────────────────

export type ForgoRollupGranularity = 'hourly' | 'daily' | 'weekly';

export interface ForgoRollup {
  orgId: string;
  granularity: ForgoRollupGranularity;
  metricName: string;
  dimensions?: Record<string, string>;
  periodStart: number;
  periodEnd: number;
  count: number;
  sum: number;
  min?: number;
  max?: number;
  avg?: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

// ── Tier Config ──────────────────────────────────────────────────────

export type ForgoTierName = 'free' | 'pro' | 'enterprise';

export interface TierConfig {
  tierName: ForgoTierName;
  hotWindowMs: number;
  warmWindowMs: number;
  coldWindowMs: number;
  maxLogsPerDay: number;
  rollupAccess: ForgoRollupGranularity[];
  realtimeStream: boolean;
}

export const DEFAULT_TIERS: Record<ForgoTierName, TierConfig> = {
  free: {
    tierName: 'free',
    hotWindowMs: 24 * 60 * 60 * 1000, // 24h
    warmWindowMs: 7 * 24 * 60 * 60 * 1000, // 7d
    coldWindowMs: 30 * 24 * 60 * 60 * 1000, // 30d
    maxLogsPerDay: 10_000,
    rollupAccess: ['daily'],
    realtimeStream: false,
  },
  pro: {
    tierName: 'pro',
    hotWindowMs: 7 * 24 * 60 * 60 * 1000, // 7d
    warmWindowMs: 30 * 24 * 60 * 60 * 1000, // 30d
    coldWindowMs: 90 * 24 * 60 * 60 * 1000, // 90d
    maxLogsPerDay: 100_000,
    rollupAccess: ['hourly', 'daily'],
    realtimeStream: true,
  },
  enterprise: {
    tierName: 'enterprise',
    hotWindowMs: 90 * 24 * 60 * 60 * 1000, // 90d
    warmWindowMs: 365 * 24 * 60 * 60 * 1000, // 365d
    coldWindowMs: 3 * 365 * 24 * 60 * 60 * 1000, // ~3yr
    maxLogsPerDay: 1_000_000,
    rollupAccess: ['hourly', 'daily', 'weekly'],
    realtimeStream: true,
  },
};

// ── Filters & Queries ────────────────────────────────────────────────

export interface ForgoLogFilter {
  orgId?: string;
  source?: ForgoLogSource;
  level?: ForgoLogLevel;
  category?: ForgoLogCategory;
  workerName?: string;
  traceId?: string;
  search?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface ForgoEventFilter {
  orgId?: string;
  eventType?: ForgoAnalyticsEventType;
  eventName?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface ForgoLogQuery extends ForgoLogFilter {
  sortBy?: 'createdAt' | 'level';
  sortOrder?: 'asc' | 'desc';
}

export interface ForgoRollupQuery {
  orgId: string;
  granularity: ForgoRollupGranularity;
  metricName?: string;
  dimensions?: Record<string, string>;
  since?: number;
  until?: number;
}

// ── Archive Manifest ─────────────────────────────────────────────────

export interface ForgoArchiveManifest {
  id: string;
  orgId: string;
  r2Key: string;
  logCount: number;
  sizeBytes: number;
  periodStart: number;
  periodEnd: number;
  encryptionKeyId: string;
  createdAt: number;
}

// ── Encryption Key Record ────────────────────────────────────────────

export interface ForgoEncryptionKeyRecord {
  id: string;
  orgId: string;
  publicKeyJwk: string;
  createdAt: number;
  rotatedAt?: number;
  active: boolean;
}

// ── UCAN Capabilities ───────────────────────────────────────────────

export interface ForgoUCANCapability {
  can: string;
  with: string;
}

export const FORGO_CAPABILITIES = {
  LOG_WRITE: { can: 'forgo-logs:write', with: 'org:{orgId}' },
  LOG_READ: { can: 'forgo-logs:read', with: 'org:{orgId}' },
  LOG_ADMIN: { can: 'forgo-logs:admin', with: 'org:{orgId}' },
  ANALYTICS: { can: 'forgo-analytics:read', with: 'org:{orgId}' },
  ARCHIVE: { can: 'forgo-archive:read', with: 'org:{orgId}' },
  STREAM: { can: 'forgo-stream:connect', with: 'org:{orgId}' },
} as const;

// ── Pipeline Health ──────────────────────────────────────────────────

export interface ForgoPipelineHealth {
  d1BufferStats: Record<string, number>;
  archiveStatus: {
    lastArchiveAt: number | null;
    pendingArchiveCount: number;
  };
  rollupStatus: {
    lastHourlyAt: number | null;
    lastDailyAt: number | null;
    lastWeeklyAt: number | null;
  };
  quotaUsage: {
    orgId: string;
    logsToday: number;
    maxLogsPerDay: number;
    remaining: number;
  };
}

// ── Quota ────────────────────────────────────────────────────────────

export interface ForgoQuotaStatus {
  orgId: string;
  tierName: ForgoTierName;
  logsToday: number;
  maxLogsPerDay: number;
  remaining: number;
  allowed: boolean;
}

// ── Deep Link Utility ────────────────────────────────────────────────

export function getForgoLogUrl(
  orgId: string,
  processName: string,
  format: 'web' | 'aeon' = 'web'
): string {
  if (format === 'aeon') return `aeon://logs/${orgId}/${processName}`;
  return `https://dashrelay.dev/logs/${orgId}/${processName}`;
}

// ── CRDT Map Names ───────────────────────────────────────────────────

export const FORGO_CRDT_MAPS = {
  LOGS: 'forgo-logs',
  EVENTS: 'forgo-events',
  METRICS: 'forgo-metrics',
} as const;

// ── Max Entries (Prune thresholds) ───────────────────────────────────

export const MAX_LOG_ENTRIES = 5000;
export const MAX_EVENT_ENTRIES = 2000;
export const MAX_METRIC_ENTRIES = 500;
