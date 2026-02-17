/**
 * Distributed Inference Client
 *
 * Client-side integration with Cloudflare Workers distributed inference.
 * Provides seamless fallback between local WASM/WebGPU and remote distributed inference.
 */

// Core distributed client
export { DistributedClient, DISTRIBUTED_PRESETS } from './distributed-client';
export type {
  DistributedClientConfig,
  DistributedInferenceOptions,
  DistributedResult,
  WorkerStatus,
  ConnectionState,
} from './distributed-client';

// Model routing
export { ModelRouter, ROUTING_STRATEGIES } from './model-router';
export type {
  ModelRouterConfig,
  RoutingStrategy,
  RouteDecision,
  ModelCapabilities,
  LatencyStats,
} from './model-router';

// Edge inference adapter
export {
  EdgeInferenceAdapter,
  createEdgeInferenceAdapter,
} from './edge-inference-adapter';
export type {
  EdgeInferenceAdapterConfig,
  InferenceRequest,
  InferenceResult,
  InferenceContext,
} from './edge-inference-adapter';

// Streaming client
export { StreamingClient, STREAMING_PRESETS } from './streaming-client';
export type {
  StreamConfig,
  StreamState,
  StreamEvent,
  TokenEvent,
  StreamStats,
} from './streaming-client';

// Connection management
export { ConnectionManager, CONNECTION_PRESETS } from './connection-manager';
export type {
  ConnectionManagerConfig,
  ConnectionState as ConnectionManagerState,
  ConnectionQuality,
  ConnectionInfo,
} from './connection-manager';

// Offline support
export { OfflineSupport, OFFLINE_PRESETS } from './offline-support';
export type {
  OfflineSupportConfig,
  QueuedRequest,
  OfflineState,
  SyncConflict,
  OfflineModel,
} from './offline-support';

// Bandwidth optimization
export { BandwidthOptimizer, BANDWIDTH_PRESETS } from './bandwidth-optimizer';
export type {
  BandwidthOptimizerConfig,
  CompressionAlgorithm,
  TransferFormat,
  QualityLevel,
  NetworkProfile,
  OptimizationStrategy,
} from './bandwidth-optimizer';

// Model preloading
export { ModelPreloader, PRELOADER_PRESETS } from './model-preloader';
export type {
  ModelPreloaderConfig,
  PreloadPriority,
  ModelLoadState,
  ModelMetadata,
  ModelLoadProgress,
  PreloadRequest,
} from './model-preloader';

// Cache coordination
export { CacheCoordinator, CACHE_PRESETS } from './cache-coordinator';
export type {
  CacheCoordinatorConfig,
  CacheLayer,
  CacheEntry,
  InvalidationReason,
  CacheEvent,
  CacheStats,
  KVCacheEntry,
} from './cache-coordinator';

// Metrics reporting
export { MetricsReporter, METRICS_PRESETS } from './metrics-reporter';
export type {
  MetricsReporterConfig,
  MetricType,
  MetricValue,
  HistogramBucket,
  HistogramData,
  PerformanceSummary,
} from './metrics-reporter';

// Error development
export {
  ErrorRecovery,
  CircuitBreaker,
  RECOVERY_PRESETS,
  createErrorRecovery,
} from './error-recovery';
export type {
  ErrorRecoveryConfig,
  RetryConfig,
  RetryStrategy,
  CircuitBreakerConfig,
  CircuitState,
  ClassifiedError,
  ErrorCategory,
  ErrorSeverity,
  Fallback,
  ErrorPattern,
} from './error-recovery';

// Batch scheduling
export {
  BatchScheduler,
  DebouncedBatchScheduler,
  ThrottledBatchScheduler,
  InferenceBatchScheduler,
  BATCH_PRESETS,
  createBatchScheduler,
} from './batch-scheduler';
export type {
  BatchSchedulerConfig,
  BatchItem,
  BatchResult,
  BatchStats,
  InferenceRequest as BatchInferenceRequest,
  InferenceResponse,
} from './batch-scheduler';

// Token budget management
export {
  TokenBudgetManager,
  BUDGET_PRESETS,
  createTokenBudgetManager,
} from './token-budget-manager';
export type {
  TokenBudgetManagerConfig,
  BudgetConfig,
  BudgetPeriod,
  BudgetUsage,
  UsageRecord,
  TokenPricing,
  ModelPricing,
} from './token-budget-manager';

// React hooks
export {
  useDistributedInference,
  useStreamingInference,
  useBudget,
  useOfflineStatus,
  useInferenceMetrics,
  useModelStatus,
  useEdgeworkInference,
} from './hooks';
export type {
  UseDistributedInferenceConfig,
  InferenceRequest as HooksInferenceRequest,
  InferenceResult as HooksInferenceResult,
  InferenceState,
  StreamingState,
  BudgetState,
  OfflineState as HooksOfflineState,
  MetricsState,
  ModelStatusState,
} from './hooks';
