declare module '@emotions-app/shared-ui/types/agent-website' {
  export type AgentWebsiteDomainType = 'individual' | 'collab';

  export interface AgentWebsiteTokenBurn {
    txHash: string;
    siteHash: string;
    amountAffect: string;
    renewalCount: number;
    blockNumber: number;
    verifiedAt: string;
  }

  export const MAX_RENEWAL_COUNT: number;

  export function calculateRenewalCost(renewalCount: number): number;
}

declare module '@emotions-app/shared-utils/edge/forgo-logs-types' {
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

  export interface ForgoLogQuery {
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
    sortBy?: 'createdAt' | 'level';
    sortOrder?: 'asc' | 'desc';
  }

  export type ForgoRollupGranularity = 'hourly' | 'daily' | 'weekly';
  export type ForgoTierName = 'free' | 'pro' | 'enterprise';

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

  export interface ForgoRollupQuery {
    orgId: string;
    granularity: ForgoRollupGranularity;
    metricName?: string;
    dimensions?: Record<string, string>;
    since?: number;
    until?: number;
  }

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

  export interface ForgoQuotaStatus {
    orgId: string;
    tierName: ForgoTierName;
    logsToday: number;
    maxLogsPerDay: number;
    remaining: number;
    allowed: boolean;
  }
}
