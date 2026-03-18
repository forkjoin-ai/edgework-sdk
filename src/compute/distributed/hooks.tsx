/**
 * React Hooks for Distributed Inference
 *
 * Enhanced hooks for edge/distributed inference:
 * - useDistributedInference - Core distributed inference hook
 * - useModelRouter - Intelligent routing hook
 * - useStreamingInference - Real-time streaming hook
 * - useBudget - Token budget management hook
 * - useOfflineStatus - Offline status and sync hook
 * - useInferenceMetrics - Performance metrics hook
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Import types (actual implementations would come from the distributed modules)
import type { RouteDecision, RoutingStrategy } from './model-router';
import type { BudgetUsage, UsageRecord } from './token-budget-manager';
import type { PerformanceSummary, MetricValue } from './metrics-reporter';
import type { CircuitState, ClassifiedError } from './error-recovery';

/**
 * Distributed inference configuration
 */
export interface UseDistributedInferenceConfig {
  /** Model ID */
  model: string;

  /** Initial routing strategy */
  routingStrategy?: RoutingStrategy;

  /** Enable offline support */
  enableOffline?: boolean;

  /** Enable metrics collection */
  enableMetrics?: boolean;

  /** Maximum retries */
  maxRetries?: number;

  /** Timeout in ms */
  timeout?: number;
}

/**
 * Inference request
 */
export interface InferenceRequest {
  /** Input prompt */
  prompt: string;

  /** System prompt */
  systemPrompt?: string;

  /** Max tokens */
  maxTokens?: number;

  /** Temperature */
  temperature?: number;

  /** Top P */
  topP?: number;

  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Inference result
 */
export interface InferenceResult {
  /** Generated text */
  text: string;

  /** Tokens used */
  tokensUsed: number;

  /** Source (local/edge/cloud) */
  source: 'local' | 'edge' | 'cloud';

  /** Latency in ms */
  latencyMs: number;

  /** Model used */
  model: string;

  /** Finish reason */
  finishReason: 'stop' | 'length' | 'error';
}

/**
 * Inference state
 */
export interface InferenceState {
  /** Is loading/generating */
  isLoading: boolean;

  /** Current result */
  result: InferenceResult | null;

  /** Current error */
  error: Error | null;

  /** Is online */
  isOnline: boolean;

  /** Current routing decision */
  routingDecision: RouteDecision | null;

  /** Circuit breaker state */
  circuitState: CircuitState;
}

/**
 * useDistributedInference Hook
 *
 * Core hook for distributed inference with automatic routing.
 */
export function useDistributedInference(config: UseDistributedInferenceConfig) {
  const [state, setState] = useState<InferenceState>({
    isLoading: false,
    result: null,
    error: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    routingDecision: null,
    circuitState: 'closed',
  });

  // Track online status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setState((s) => ({ ...s, isOnline: true }));
    const handleOffline = () => setState((s) => ({ ...s, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Generate inference
   */
  const generate = useCallback(
    async (request: InferenceRequest): Promise<InferenceResult | null> => {
      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        // This would use the actual EdgeInferenceAdapter
        // For now, we'll mock the flow
        const startTime = performance.now();

        // Simulate routing decision
        const routingDecision: RouteDecision = {
          primary: state.isOnline ? 'edge' : 'local-wasm',
          fallbacks: state.isOnline
            ? ['local-wasm', 'local-webgpu']
            : ['local-wasm'],
          reason: state.isOnline
            ? 'Edge inference preferred'
            : 'Offline - using local',
          confidence: 0.9,
          estimatedLatencyMs: state.isOnline ? 200 : 100,
          estimatedTPS: 50,
          estimatedCost: state.isOnline ? 0.001 : 0,
        };

        setState((s) => ({ ...s, routingDecision }));

        // Simulate inference (in real implementation, this calls EdgeInferenceAdapter)
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result: InferenceResult = {
          text: `Generated response for: ${request.prompt.slice(0, 50)}...`,
          tokensUsed: Math.ceil(request.prompt.length / 4) + 50,
          source: (routingDecision.primary === 'edge' ? 'edge' : 'local') as
            | 'local'
            | 'edge'
            | 'cloud',
          latencyMs: performance.now() - startTime,
          model: config.model,
          finishReason: 'stop',
        };

        setState((s) => ({ ...s, isLoading: false, result }));
        return result;
      } catch (error) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: error as Error,
        }));
        return null;
      }
    },
    [config.model, state.isOnline]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      result: null,
      error: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      routingDecision: null,
      circuitState: 'closed',
    });
  }, []);

  return {
    ...state,
    generate,
    reset,
  };
}

/**
 * Streaming inference state
 */
export interface StreamingState {
  /** Is streaming */
  isStreaming: boolean;

  /** Tokens received so far */
  tokens: string[];

  /** Current text */
  text: string;

  /** Error if any */
  error: Error | null;

  /** Stream finished */
  isComplete: boolean;

  /** Tokens per second */
  tokensPerSecond: number;
}

/**
 * useStreamingInference Hook
 *
 * Real-time streaming inference with backpressure handling.
 */
export function useStreamingInference(config: UseDistributedInferenceConfig) {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    tokens: [],
    text: '',
    error: null,
    isComplete: false,
    tokensPerSecond: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const tokenTimestampsRef = useRef<number[]>([]);

  /**
   * Stream inference
   */
  const stream = useCallback(async function* (
    request: InferenceRequest
  ): AsyncGenerator<string> {
    setState((s) => ({
      ...s,
      isStreaming: true,
      tokens: [],
      text: '',
      error: null,
      isComplete: false,
    }));

    abortControllerRef.current = new AbortController();
    tokenTimestampsRef.current = [];

    try {
      // Simulate streaming (real implementation uses StreamingClient)
      const words = `Generated streaming response for: ${request.prompt}`.split(
        ' '
      );

      for (const word of words) {
        if (abortControllerRef.current?.signal.aborted) break;

        await new Promise((resolve) => setTimeout(resolve, 50));

        const token = word + ' ';
        tokenTimestampsRef.current.push(Date.now());

        // Calculate tokens per second
        const recentTokens = tokenTimestampsRef.current.filter(
          (t) => Date.now() - t < 1000
        );
        const tps = recentTokens.length;

        setState((s) => ({
          ...s,
          tokens: [...s.tokens, token],
          text: s.text + token,
          tokensPerSecond: tps,
        }));

        yield token;
      }

      setState((s) => ({ ...s, isStreaming: false, isComplete: true }));
    } catch (error) {
      setState((s) => ({
        ...s,
        isStreaming: false,
        error: error as Error,
      }));
      throw error;
    }
  },
  []);

  /**
   * Stop streaming
   */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    stop();
    setState({
      isStreaming: false,
      tokens: [],
      text: '',
      error: null,
      isComplete: false,
      tokensPerSecond: 0,
    });
  }, [stop]);

  return {
    ...state,
    stream,
    stop,
    reset,
  };
}

/**
 * Budget state
 */
export interface BudgetState {
  /** Current usage */
  usage: BudgetUsage | null;

  /** Recent usage records */
  recentRecords: UsageRecord[];

  /** Is over budget */
  isOverBudget: boolean;

  /** Alert triggered */
  alertTriggered: boolean;

  /** Remaining budget */
  remaining: {
    cost: number | null;
    tokens: number | null;
    requests: number | null;
  };
}

/**
 * useBudget Hook
 *
 * Token budget management and tracking.
 */
export function useBudget() {
  const [state, setState] = useState<BudgetState>({
    usage: null,
    recentRecords: [],
    isOverBudget: false,
    alertTriggered: false,
    remaining: {
      cost: null,
      tokens: null,
      requests: null,
    },
  });

  /**
   * Check if request is within budget
   */
  const checkBudget = useCallback(
    (
      modelId: string,
      prompt: string,
      maxOutputTokens?: number
    ): { allowed: boolean; reason?: string } => {
      // This would use actual TokenBudgetManager
      const estimatedTokens =
        Math.ceil(prompt.length / 4) + (maxOutputTokens || 1024);

      if (
        state.remaining.tokens !== null &&
        estimatedTokens > state.remaining.tokens
      ) {
        return {
          allowed: false,
          reason: `Estimated ${estimatedTokens} tokens exceeds remaining budget of ${state.remaining.tokens}`,
        };
      }

      return { allowed: true };
    },
    [state.remaining]
  );

  /**
   * Record usage
   */
  const recordUsage = useCallback(
    (modelId: string, inputTokens: number, outputTokens: number): void => {
      const record: UsageRecord = {
        timestamp: Date.now(),
        modelId,
        inputTokens,
        outputTokens,
        estimatedCost: 0, // Would calculate from pricing
      };

      setState((s) => ({
        ...s,
        recentRecords: [...s.recentRecords.slice(-99), record],
      }));
    },
    []
  );

  /**
   * Set budget limits
   */
  const setBudgetLimits = useCallback(
    (limits: {
      maxCost?: number;
      maxTokens?: number;
      maxRequests?: number;
    }): void => {
      setState((s) => ({
        ...s,
        remaining: {
          cost: limits.maxCost ?? s.remaining.cost,
          tokens: limits.maxTokens ?? s.remaining.tokens,
          requests: limits.maxRequests ?? s.remaining.requests,
        },
      }));
    },
    []
  );

  return {
    ...state,
    checkBudget,
    recordUsage,
    setBudgetLimits,
  };
}

/**
 * Offline state
 */
export interface OfflineState {
  /** Is online */
  isOnline: boolean;

  /** Is syncing */
  isSyncing: boolean;

  /** Pending requests count */
  pendingRequests: number;

  /** Last sync time */
  lastSyncTime: number | null;

  /** Sync error */
  syncError: Error | null;

  /** Cached models */
  cachedModels: string[];
}

/**
 * useOfflineStatus Hook
 *
 * Offline status and sync management.
 */
export function useOfflineStatus() {
  const [state, setState] = useState<OfflineState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingRequests: 0,
    lastSyncTime: null,
    syncError: null,
    cachedModels: [],
  });

  // Track online status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setState((s) => ({ ...s, isOnline: true }));
      // Trigger sync when coming online
      triggerSync();
    };

    const handleOffline = () => {
      setState((s) => ({ ...s, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Trigger sync
   */
  const triggerSync = useCallback(async (): Promise<void> => {
    if (!state.isOnline) return;

    setState((s) => ({ ...s, isSyncing: true, syncError: null }));

    try {
      // This would use actual OfflineSupport
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setState((s) => ({
        ...s,
        isSyncing: false,
        pendingRequests: 0,
        lastSyncTime: Date.now(),
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        isSyncing: false,
        syncError: error as Error,
      }));
    }
  }, [state.isOnline]);

  /**
   * Queue offline request
   */
  const queueRequest = useCallback((): void => {
    setState((s) => ({
      ...s,
      pendingRequests: s.pendingRequests + 1,
    }));
  }, []);

  /**
   * Cache model for offline use
   */
  const cacheModel = useCallback(async (modelId: string): Promise<void> => {
    // This would use actual ModelPreloader/OfflineSupport
    await new Promise((resolve) => setTimeout(resolve, 500));

    setState((s) => ({
      ...s,
      cachedModels: [...new Set([...s.cachedModels, modelId])],
    }));
  }, []);

  /**
   * Check if model is cached
   */
  const isModelCached = useCallback(
    (modelId: string): boolean => {
      return state.cachedModels.includes(modelId);
    },
    [state.cachedModels]
  );

  return {
    ...state,
    triggerSync,
    queueRequest,
    cacheModel,
    isModelCached,
  };
}

/**
 * Metrics state
 */
export interface MetricsState {
  /** Performance summary */
  summary: PerformanceSummary | null;

  /** Recent metrics */
  recentMetrics: MetricValue[];

  /** Is collecting */
  isCollecting: boolean;
}

/**
 * useInferenceMetrics Hook
 *
 * Performance metrics and monitoring.
 */
export function useInferenceMetrics(
  options: {
    collectionInterval?: number;
    autoStart?: boolean;
  } = {}
) {
  const { collectionInterval = 5000, autoStart = true } = options;

  const [state, setState] = useState<MetricsState>({
    summary: null,
    recentMetrics: [],
    isCollecting: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Start collecting
   */
  const start = useCallback(() => {
    if (intervalRef.current) return;

    setState((s) => ({ ...s, isCollecting: true }));

    intervalRef.current = setInterval(() => {
      // This would use actual MetricsReporter
      // For now, generate mock summary
      const summary: PerformanceSummary = {
        periodMs: collectionInterval,
        inference: {
          totalRequests: Math.floor(Math.random() * 100),
          successfulRequests: Math.floor(Math.random() * 95),
          failedRequests: Math.floor(Math.random() * 5),
          avgLatencyMs: 50 + Math.random() * 100,
          p95LatencyMs: 100 + Math.random() * 200,
          tokensGenerated: Math.floor(Math.random() * 10000),
          avgTokensPerSecond: 20 + Math.random() * 30,
        },
        resources: {
          avgMemoryUsage: 50 + Math.random() * 50,
          peakMemoryUsage: 70 + Math.random() * 30,
          avgCpuUsage: 10 + Math.random() * 40,
          networkBytesSent: Math.floor(Math.random() * 100000),
          networkBytesReceived: Math.floor(Math.random() * 500000),
        },
        cache: {
          hitRate: 0.6 + Math.random() * 0.3,
          missRate: 0.1 + Math.random() * 0.2,
          evictionCount: Math.floor(Math.random() * 10),
          cacheSize: Math.floor(Math.random() * 1000000),
        },
        errors: {
          totalErrors: Math.floor(Math.random() * 5),
          errorRate: Math.random() * 0.05,
          errorsByType: {},
        },
      };

      setState((s) => ({
        ...s,
        summary,
      }));
    }, collectionInterval);
  }, [collectionInterval]);

  /**
   * Stop collecting
   */
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((s) => ({ ...s, isCollecting: false }));
  }, []);

  /**
   * Record a metric
   */
  const recordMetric = useCallback(
    (
      name: string,
      value: number,
      labels: Record<string, string> = {}
    ): void => {
      const metric: MetricValue = {
        name,
        type: 'gauge',
        value,
        labels,
        timestamp: Date.now(),
      };

      setState((s) => ({
        ...s,
        recentMetrics: [...s.recentMetrics.slice(-99), metric],
      }));
    },
    []
  );

  // Auto-start if configured
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoStart, start]);

  return {
    ...state,
    start,
    stop,
    recordMetric,
  };
}

/**
 * Model status state
 */
export interface ModelStatusState {
  /** Model ID */
  modelId: string | null;

  /** Is loaded */
  isLoaded: boolean;

  /** Is loading */
  isLoading: boolean;

  /** Download progress (0-100) */
  downloadProgress: number;

  /** Load error */
  error: Error | null;

  /** Backend type */
  backend: 'webgpu' | 'wasm' | 'remote' | null;

  /** Model size in bytes */
  sizeBytes: number | null;
}

/**
 * useModelStatus Hook
 *
 * Track model loading and status.
 */
export function useModelStatus() {
  const [state, setState] = useState<ModelStatusState>({
    modelId: null,
    isLoaded: false,
    isLoading: false,
    downloadProgress: 0,
    error: null,
    backend: null,
    sizeBytes: null,
  });

  /**
   * Load model
   */
  const loadModel = useCallback(async (modelId: string): Promise<void> => {
    setState((s) => ({
      ...s,
      modelId,
      isLoading: true,
      downloadProgress: 0,
      error: null,
    }));

    try {
      // Simulate loading with progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        setState((s) => ({ ...s, downloadProgress: i }));
      }

      // Detect backend
      const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

      setState((s) => ({
        ...s,
        isLoaded: true,
        isLoading: false,
        backend: hasWebGPU ? 'webgpu' : 'wasm',
        sizeBytes: 100 * 1024 * 1024, // Mock 100MB
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: error as Error,
      }));
    }
  }, []);

  /**
   * Unload model
   */
  const unloadModel = useCallback((): void => {
    setState({
      modelId: null,
      isLoaded: false,
      isLoading: false,
      downloadProgress: 0,
      error: null,
      backend: null,
      sizeBytes: null,
    });
  }, []);

  return {
    ...state,
    loadModel,
    unloadModel,
  };
}

/**
 * Combined edgework hook for convenience
 */
export function useEdgeworkInference(config: UseDistributedInferenceConfig) {
  const inference = useDistributedInference(config);
  const streaming = useStreamingInference(config);
  const budget = useBudget();
  const offline = useOfflineStatus();
  const metrics = useInferenceMetrics({ autoStart: config.enableMetrics });
  const model = useModelStatus();

  return useMemo(
    () => ({
      // Inference state
      isLoading: inference.isLoading,
      result: inference.result,
      error: inference.error,
      generate: inference.generate,

      // Streaming
      isStreaming: streaming.isStreaming,
      streamText: streaming.text,
      stream: streaming.stream,
      stopStream: streaming.stop,

      // Budget
      usage: budget.usage,
      checkBudget: budget.checkBudget,
      recordUsage: budget.recordUsage,

      // Offline
      isOnline: offline.isOnline,
      isSyncing: offline.isSyncing,
      pendingRequests: offline.pendingRequests,
      cacheModel: offline.cacheModel,

      // Metrics
      metrics: metrics.summary,

      // Model
      isModelLoaded: model.isLoaded,
      loadModel: model.loadModel,
      modelBackend: model.backend,
    }),
    [inference, streaming, budget, offline, metrics.summary, model]
  );
}
