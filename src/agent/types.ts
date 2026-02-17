/**
 * Edgework Agent Development Kit - Type Definitions
 */

export interface WalletConfig {
  /** Private key (hex string with 0x prefix) */
  privateKey: string;
  /** Public address */
  address: string;
  /** Encryption key for key storage */
  encryptionKey?: string;
  /** Whether keys are stored locally encrypted */
  isLocal?: boolean;
}

export interface GatewayConfig {
  /** Gateway name (e.g., "Office Worker") */
  name: string;
  /** Region (e.g., "us-west", "eu-central") */
  region: string;
  /** Wallet address for gateway owner */
  walletAddress: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** UCAN root for delegation (optional) */
  ucanRoot?: string;
}

export interface ComputeConfig {
  /** CPU allocation (0-1, default: 0.8) */
  cpuAllocation: number;
  /** Memory in MB (default: 2048) */
  memoryMB: number;
  /** Max task duration in seconds (default: 600) */
  maxTaskDuration: number;
  /** Enable WebGPU if available */
  enableGPU?: boolean;
  /** Enable WebNN if available */
  enableWebNN?: boolean;
  /** Enable token-based spending (default: true) */
  enableTokenSpending?: boolean;
  /** EDGEWORK token address on Optimism (default: 0x55ef8e6e56DEDc7f72658E53C7b2759c74210a5A) */
  tokenAddress?: string;
  /** Cost per compute minute in tokens (as bigint, e.g., 1000000000000000000n = 1 token) */
  tokenCostPerMinute?: bigint;
  /** Minimum token balance required before tasks can run */
  minTokenBalance?: bigint;
}

export interface SystemConfig {
  /** Run at system boot */
  runAtBoot: boolean;
  /** Show system tray icon */
  systemTray: boolean;
  /** Log level: 'debug' | 'info' | 'warn' | 'error' */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Daemonize process (headless) */
  daemonize?: boolean;
  /** Auto-restart on unmet expectations */
  autoRestart?: boolean;
}

export interface AgentConfig {
  gateway: GatewayConfig;
  compute: ComputeConfig;
  system: SystemConfig;
  wallet?: WalletConfig;
}

export interface ComputeStats {
  tasksCompleted: number;
  totalComputeTime: number;
  estimatedEarnings: number;
  activeTaskCount: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}

export interface GatewayRegistration {
  gatewayAddress: string;
  owner: string;
  ucanRoot: string;
  registeredAt: number;
  isActive: boolean;
  totalComputeUnits: number;
  pendingRewards: number;
}

export interface ComputeTask {
  id: string;
  type: 'inference' | 'embedding' | 'analysis';
  input: unknown;
  timeout: number;
  createdAt: number;
}

export interface ComputeResult {
  taskId: string;
  output: unknown;
  computeTimeMs: number;
  success: boolean;
  error?: string;
}

export interface AgentManagerOptions {
  configPath?: string;
  walletAddress?: string;
  gatewayName?: string;
  cpuAllocation?: number;
  memoryMB?: number;
  enableTokenSpending?: boolean;
  enableSystemTray?: boolean;
  runAtBoot?: boolean;
  rpcUrl?: string;
  registryAddress?: string;
}

export interface GatewayConnectorOptions {
  walletAddress: string;
  provider?: string;
  registryAddress?: string;
  chainId?: number;
  gasLimit?: number;
  gasPrice?: number;
}

export interface ComputeNodeOptions {
  gatewayUrl: string;
  cpuAllocation: number;
  memoryMB: number;
  maxTaskDuration: number;
  enableGPU?: boolean;
}

export interface SystemTrayOptions {
  agentManager: any; // AgentManager
  showOnStartup?: boolean;
  hideOnClose?: boolean;
  clickBehavior?: 'toggle' | 'show' | 'none';
}

export interface SetupPromptOptions {
  nonInteractive?: boolean;
  defaults?: Partial<AgentConfig>;
  skipWallet?: boolean;
  skipSystemTray?: boolean;
}

export interface AgentEvents {
  started: { timestamp: number };
  stopped: { reason: string; timestamp: number };
  taskReceived: { task: ComputeTask };
  taskCompleted: { result: ComputeResult };
  taskFailed: { taskId: string; error: string };
  statsUpdated: { stats: ComputeStats };
  walletRegistered: { address: string; txHash: string };
  error: { error: Error; context: string };
}

export type AgentEventType = keyof AgentEvents;
export type AgentEventListener<K extends AgentEventType> = (
  event: AgentEvents[K]
) => void;
/**
 * Token-based rate limiting and spending
 */
export interface TokenBalance {
  /** Total EDGEWORK tokens held */
  total: bigint;
  /** Available tokens (not locked in pending transactions) */
  available: bigint;
  /** Tokens locked in pending compute requests */
  locked: bigint;
  /** Last update timestamp */
  updatedAt: number;
}

export interface TokenRateLimit {
  /** Cost per compute minute in tokens (e.g., 1000000000000000000n = 1 token/min) */
  costPerMinute: bigint;
  /** Cost per API call in tokens */
  costPerCall: bigint;
  /** Minimum token balance to submit tasks (prevents spam) */
  minimumBalance: bigint;
  /** Maximum tokens that can be spent per day */
  dailyLimit: bigint;
  /** Whether subscription is required (false = pure token-based) */
  subscriptionRequired: boolean;
}

export interface TokenSpendingTransaction {
  /** Unique transaction ID */
  id: string;
  /** Task or request this spending is for */
  taskId: string;
  /** Amount of tokens to burn */
  amount: bigint;
  /** Compute duration in seconds */
  durationSeconds: number;
  /** Status: pending | confirmed | failed | refunded */
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  /** Timestamp created */
  createdAt: number;
  /** Timestamp confirmed on-chain */
  confirmedAt?: number;
  /** On-chain transaction hash */
  txHash?: string;
  /** Error message if failed */
  error?: string;
}

export interface TokenLedger {
  /** Wallet address */
  address: string;
  /** Current balance */
  balance: TokenBalance;
  /** Today's spending */
  spentToday: bigint;
  /** Pending transactions */
  pendingTransactions: TokenSpendingTransaction[];
  /** Completed transactions today */
  completedTransactions: TokenSpendingTransaction[];
  /** Last update from on-chain */
  lastSyncAt: number;
}

export interface TokenSpendingConfig {
  /** Token contract address on Optimism */
  tokenAddress: string;
  /** Rate limits configuration */
  rateLimit: TokenRateLimit;
  /** Check balance every N milliseconds (default: 5 min = 300000ms) */
  balanceSyncInterval: number;
  /** Fallback RPC URL if custom not provided */
  rpcUrl?: string;
  /** Enable token-based spending (vs subscription-only) */
  enableTokenSpending: boolean;
}

export interface TokenSpendingEvent {
  balanceUpdated: { balance: TokenBalance };
  transactionSubmitted: { tx: TokenSpendingTransaction };
  transactionConfirmed: { tx: TokenSpendingTransaction; txHash: string };
  transactionFailed: { tx: TokenSpendingTransaction; error: string };
  dailyLimitExceeded: { spent: bigint; limit: bigint };
  insufficientBalance: { required: bigint; available: bigint };
  computeApproved: { requestId: string; txId: string };
}

export type TokenSpendingEventType = keyof TokenSpendingEvent;
export type TokenSpendingEventListener<K extends TokenSpendingEventType> = (
  event: TokenSpendingEvent[K]
) => void;
