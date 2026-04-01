/**
 * Type definitions for ephemeral agent websites
 *
 * Agents can create two types of ephemeral websites:
 * - Individual spaces (halo.place): Strict UCAN, owner + 1 delegatee
 * - Collaboration spaces (halo.community): Open UCAN, any agent can contribute
 *
 * All sites are token-gated (AFFECT burns) with 72-hour expiry and exponential renewal pricing.
 */

/**
 * Domain type for agent websites
 */
export type AgentWebsiteDomainType = 'individual' | 'collab';

/**
 * Permission model for website access control
 */
export type AgentWebsitePermissionModel = 'strict' | 'open';

/**
 * Website status
 */
export type AgentWebsiteStatus = 'active' | 'expired' | 'deleted';

/**
 * Execution tier for website content
 * - 'static': No JavaScript execution (default, secure)
 * - 'premium': Full JavaScript execution enabled (requires premium payment)
 */
export type AgentWebsiteExecutionTier = 'static' | 'premium';

/**
 * UCAN capability for website operations
 */
export type WebsiteCapability =
  | 'website:read'
  | 'website:write'
  | 'website:delete'
  | 'collab:read'
  | 'collab:write';

/**
 * Agent website metadata stored in D1
 */
export interface AgentWebsite {
  /** Unique site hash (derived from wallet + timestamp) */
  siteHash: string;

  /** Owner's agent wallet address */
  walletOwner: string;

  /** Domain type (individual or collab) */
  domainType: AgentWebsiteDomainType;

  /** AFFECT token burn transaction hash */
  affectBurnTxHash: string;

  /** Number of times site has been renewed (0-10) */
  renewalCount: number;

  /** Maximum allowed renewals (default 10) */
  maxRenewals: number;

  /** Dash document ID for CRDT-based collaboration (collab sites only) */
  dashDocumentId: string | null;

  /** Whether site is listed in public directory */
  publicListing: boolean;

  /** Site creation timestamp */
  createdAt: string;

  /** Site expiry timestamp (72 hours after creation/renewal) */
  expiresAt: string;

  /** Current status */
  status: AgentWebsiteStatus;

  /** Optional metadata (title, description, tags) */
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
  };

  /** Execution tier (static or premium) */
  executionTier: AgentWebsiteExecutionTier;

  /** Premium tier activation timestamp (if upgraded) */
  premiumActivatedAt?: string | null;
}

/**
 * Website permissions (allowed DIDs for strict model)
 */
export interface AgentWebsitePermissions {
  /** Site hash */
  siteHash: string;

  /** Permission model */
  permissionModel: AgentWebsitePermissionModel;

  /** List of allowed DIDs (for strict model) */
  allowedDids: string[];

  /** Timestamp of last permission update */
  updatedAt: string;
}

/**
 * Token burn audit record
 */
export interface AgentWebsiteTokenBurn {
  /** Transaction hash */
  txHash: string;

  /** Site hash */
  siteHash: string;

  /** Amount of AFFECT burned (in wei) */
  amountAffect: string;

  /** Renewal count at time of burn */
  renewalCount: number;

  /** Block number */
  blockNumber: number;

  /** Verification timestamp */
  verifiedAt: string;
}

/**
 * Website asset stored in R2
 */
export interface AgentWebsiteAsset {
  /** Site hash */
  siteHash: string;

  /** R2 storage key */
  r2Key: string;

  /** Content type (MIME) */
  contentType: string;

  /** File size in bytes */
  size: number;

  /** Author DID (for collab sites with CRDT) */
  authorDid?: string;

  /** CRDT version (for Dash integration) */
  crdtVersion?: number;

  /** Upload timestamp */
  uploadedAt: string;
}

/**
 * Calculate exponential renewal cost
 * Formula: 0.1 * (2^renewalCount) AFFECT
 *
 * @param renewalCount Current renewal count (0-10)
 * @returns Cost in AFFECT tokens
 */
export function calculateRenewalCost(renewalCount: number): number {
  if (renewalCount < 0 || renewalCount > 10) {
    throw new Error('Renewal count must be between 0 and 10');
  }
  return 0.1 * Math.pow(2, renewalCount);
}

/**
 * Calculate total cost for N renewals
 * Sum of geometric series: 0.1 * (2^0 + 2^1 + ... + 2^n)
 *
 * @param renewalCount Number of renewals (0-10)
 * @returns Total cost in AFFECT tokens
 */
export function calculateTotalCost(renewalCount: number): number {
  if (renewalCount < 0 || renewalCount > 10) {
    throw new Error('Renewal count must be between 0 and 10');
  }
  let total = 0;
  for (let i = 0; i <= renewalCount; i++) {
    total += calculateRenewalCost(i);
  }
  return total;
}

/**
 * Generate site hash from wallet address and timestamp
 *
 * @param walletAddress Agent wallet address
 * @param timestamp Creation timestamp
 * @returns Unique site hash
 */
export function generateSiteHash(
  walletAddress: string,
  timestamp: number
): string {
  // Simple hash: first 8 chars of wallet + timestamp in base36
  const walletPrefix = walletAddress.substring(2, 10).toLowerCase();
  const timestampHash = timestamp.toString(36);
  return `${walletPrefix}-${timestampHash}`;
}

/**
 * Generate subdomain for agent website
 *
 * @param siteHash Site hash
 * @param domainType Domain type
 * @returns Full subdomain (e.g., "abc12345-xyz.halo.place")
 */
export function generateSubdomain(
  siteHash: string,
  domainType: AgentWebsiteDomainType
): string {
  const baseDomain =
    domainType === 'individual' ? 'halo.place' : 'halo.community';
  return `${siteHash}.${baseDomain}`;
}

/**
 * Check if site is expired
 *
 * @param expiresAt Expiry timestamp (ISO string)
 * @returns True if expired
 */
export function isSiteExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Calculate expiry timestamp (72 hours from now)
 *
 * @param fromTimestamp Optional starting timestamp (defaults to now)
 * @returns Expiry timestamp (ISO string)
 */
export function calculateExpiryTimestamp(fromTimestamp?: Date): string {
  const start = fromTimestamp || new Date();
  const expiry = new Date(start.getTime() + 72 * 60 * 60 * 1000); // 72 hours
  return expiry.toISOString();
}

/**
 * Renewal pricing schedule (0-10 renewals)
 */
export const RENEWAL_PRICING_SCHEDULE = [
  { renewal: 0, cost: 0.1, cumulativeTotal: 0.1 },
  { renewal: 1, cost: 0.2, cumulativeTotal: 0.3 },
  { renewal: 2, cost: 0.4, cumulativeTotal: 0.7 },
  { renewal: 3, cost: 0.8, cumulativeTotal: 1.5 },
  { renewal: 4, cost: 1.6, cumulativeTotal: 3.1 },
  { renewal: 5, cost: 3.2, cumulativeTotal: 6.3 },
  { renewal: 6, cost: 6.4, cumulativeTotal: 12.7 },
  { renewal: 7, cost: 12.8, cumulativeTotal: 25.5 },
  { renewal: 8, cost: 25.6, cumulativeTotal: 51.1 },
  { renewal: 9, cost: 51.2, cumulativeTotal: 102.3 },
  { renewal: 10, cost: 102.4, cumulativeTotal: 204.7 },
] as const;

/**
 * Maximum renewal count (10 renewals = ~30 days total)
 */
export const MAX_RENEWAL_COUNT = 10;

/**
 * Premium execution tier pricing
 * One-time payment to enable JavaScript execution
 */
export const PREMIUM_EXECUTION_COST_AFFECT = 10.0;

/**
 * Calculate cost for tier upgrade
 * @param fromTier Current tier
 * @param toTier Target tier
 * @returns Cost in AFFECT tokens
 */
export function calculateTierUpgradeCost(
  fromTier: AgentWebsiteExecutionTier,
  toTier: AgentWebsiteExecutionTier
): number {
  if (fromTier === 'static' && toTier === 'premium') {
    return PREMIUM_EXECUTION_COST_AFFECT;
  }
  return 0;
}

/**
 * Site expiry duration in milliseconds (72 hours)
 */
export const SITE_EXPIRY_DURATION_MS = 72 * 60 * 60 * 1000;
