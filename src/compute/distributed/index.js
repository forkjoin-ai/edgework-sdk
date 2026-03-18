/**
 * Distributed Inference Client
 *
 * Client-side integration with Cloudflare Workers distributed inference.
 * Provides seamless fallback between local WASM/WebGPU and remote distributed inference.
 */
// Core distributed client
export { DistributedClient, DISTRIBUTED_PRESETS } from './distributed-client';
// Model routing
export { ModelRouter, ROUTING_STRATEGIES } from './model-router';
// Edge inference adapter
export {
  EdgeInferenceAdapter,
  createEdgeInferenceAdapter,
} from './edge-inference-adapter';
// Streaming client
export { StreamingClient, STREAMING_PRESETS } from './streaming-client';
// Connection management
export { ConnectionManager, CONNECTION_PRESETS } from './connection-manager';
// Offline support
export { OfflineSupport, OFFLINE_PRESETS } from './offline-support';
// Bandwidth optimization
export { BandwidthOptimizer, BANDWIDTH_PRESETS } from './bandwidth-optimizer';
// Model preloading
export { ModelPreloader, PRELOADER_PRESETS } from './model-preloader';
// Cache coordination
export { CacheCoordinator, CACHE_PRESETS } from './cache-coordinator';
// Metrics reporting
export { MetricsReporter, METRICS_PRESETS } from './metrics-reporter';
// Error development
export {
  ErrorRecovery,
  CircuitBreaker,
  RECOVERY_PRESETS,
  createErrorRecovery,
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
// Token budget management
export {
  TokenBudgetManager,
  BUDGET_PRESETS,
  createTokenBudgetManager,
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
//# sourceMappingURL=index.js.map
