/**
 * Edge Inference Adapter (Domain-Agnostic)
 *
 * Unified interface that bridges local inference engines (WebGPU, WASM)
 * with distributed edge workers. Provides seamless fallback and hybrid
 * execution patterns. Fully generic and extensible for any domain.
 *
 * Features:
 * - Domain-agnostic routing and inference
 * - Pluggable context adapters for domain customization
 * - Flexible quality scoring and routing customization
 * - Works with any model, domain, or application
 */

import type {
  ModelRouter,
  RouteDecision,
  InferenceSource,
} from './model-router';
import type {
  DistributedClient,
  DistributedResult,
  DistributedInferenceOptions,
} from './distributed-client';

/**
 * Custom context that can be provided for domain-specific behavior
 * This is completely optional and extensible
 */
export interface InferenceContext {
  /** Domain-specific context data */
  [key: string]: unknown;
}

/**
 * Inference request options
 */
export interface InferenceRequest {
  /** Input prompt */
  prompt: string;

  /** System prompt (optional) */
  systemPrompt?: string;

  /** Model ID to use */
  modelId?: string;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Temperature for sampling */
  temperature?: number;

  /** Top-p sampling */
  topP?: number;

  /** Top-k sampling */
  topK?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** Whether to stream the response */
  stream?: boolean;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Force specific inference source */
  forceSource?: InferenceSource;

  /** Priority (higher = more important) */
  priority?: number;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Inference result
 */
export interface InferenceResult {
  /** Generated text */
  text: string;

  /** Model used */
  model: string;

  /** Source used for inference */
  source: InferenceSource;

  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Timing information */
  timing: {
    /** Total time in ms */
    totalMs: number;
    /** Time to first token in ms */
    firstTokenMs: number;
    /** Tokens per second */
    tokensPerSecond: number;
  };

  /** Whether result came from cache */
  cached: boolean;

  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';

  /** Original route decision */
  routeDecision?: RouteDecision;
}

/**
 * Streaming chunk
 */
export interface StreamChunk {
  /** Token text */
  text: string;

  /** Token index */
  index: number;

  /** Source being used */
  source: InferenceSource;

  /** Whether this is the final chunk */
  done: boolean;

  /** Cumulative text so far */
  cumulative?: string;

  /** Finish reason (only on last chunk) */
  finishReason?: InferenceResult['finishReason'];
}

/**
 * Local inference engine interface
 */
export interface LocalInferenceEngine {
  /** Engine type */
  type: 'webgpu' | 'wasm';

  /** Whether engine is initialized */
  isInitialized(): boolean;

  /** Initialize the engine */
  initialize(): Promise<void>;

  /** Check if model is loaded */
  hasModel(modelId: string): boolean;

  /** Load a model */
  loadModel(modelId: string): Promise<void>;

  /** Unload a model */
  unloadModel(modelId: string): Promise<void>;

  /** Generate text */
  generate(request: InferenceRequest): Promise<InferenceResult>;

  /** Stream text generation */
  stream(
    request: InferenceRequest
  ): AsyncGenerator<StreamChunk, InferenceResult>;

  /** Get engine status */
  getStatus(): {
    initialized: boolean;
    loadedModels: string[];
    memoryUsage: number;
  };
}

/**
 * Adapter configuration
 */
export interface EdgeInferenceAdapterConfig {
  /** Model router instance */
  router: ModelRouter;

  /** Distributed client instance */
  distributedClient: DistributedClient;

  /** Local WebGPU engine (optional) */
  webgpuEngine?: LocalInferenceEngine;

  /** Local WASM engine (optional) */
  wasmEngine?: LocalInferenceEngine;

  /** Default model ID */
  defaultModel?: string;

  /** Enable caching */
  enableCache?: boolean;

  /** Cache TTL in ms */
  cacheTTL?: number;

  /** Maximum retry attempts */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelay?: number;

  /** Enable telemetry */
  enableTelemetry?: boolean;

  /** Callback on inference complete */
  onComplete?: (result: InferenceResult) => void;

  /** Callback on error */
  onError?: (error: Error, source: InferenceSource) => void;

  /** Callback on fallback */
  onFallback?: (
    from: InferenceSource,
    to: InferenceSource,
    reason: string
  ) => void;

  /**
   * Optional custom context for domain-specific behavior
   * This enables extensibility without modifying the adapter
   */
  customContext?: InferenceContext;

  /**
   * Custom routing decision hook
   * Allows domains to customize routing based on their needs
   */
  customRouting?: (
    decision: RouteDecision,
    context?: InferenceContext
  ) => RouteDecision;

  /**
   * Custom quality scoring hook
   * Allows domains to compute quality scores based on their metrics
   */
  customQualityScore?: (options: {
    model: string;
    source: InferenceSource;
    context?: InferenceContext;
  }) => number;
}

/**
 * Simple LRU cache for inference results
 */
class InferenceCache {
  private cache: Map<string, { result: InferenceResult; timestamp: number }> =
    new Map();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttl = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Generate cache key
   */
  private key(request: InferenceRequest): string {
    return JSON.stringify({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      modelId: request.modelId,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
    });
  }

  /**
   * Get cached result
   */
  get(request: InferenceRequest): InferenceResult | null {
    const k = this.key(request);
    const entry = this.cache.get(k);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(k);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(k);
    this.cache.set(k, entry);

    return { ...entry.result, cached: true };
  }

  /**
   * Set cached result
   */
  set(request: InferenceRequest, result: InferenceResult): void {
    const k = this.key(request);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(k, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Edge Inference Adapter
 *
 * Provides a unified interface for inference that automatically
 * routes between local and distributed execution.
 */
export class EdgeInferenceAdapter {
  private config: EdgeInferenceAdapterConfig;
  private cache: InferenceCache;
  private initialized = false;
  private activeRequests = 0;
  private totalRequests = 0;
  private successfulRequests = 0;

  constructor(config: EdgeInferenceAdapterConfig) {
    this.config = {
      enableCache: true,
      cacheTTL: 300000,
      maxRetries: 3,
      retryDelay: 1000,
      enableTelemetry: true,
      ...config,
    };
    this.cache = new InferenceCache(100, this.config.cacheTTL);
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize local engines if available
    const initPromises: Promise<void>[] = [];

    if (this.config.webgpuEngine && !this.config.webgpuEngine.isInitialized()) {
      initPromises.push(
        this.config.webgpuEngine.initialize().catch((err) => {
          console.warn('WebGPU engine initialization failed:', err);
        })
      );
    }

    if (this.config.wasmEngine && !this.config.wasmEngine.isInitialized()) {
      initPromises.push(
        this.config.wasmEngine.initialize().catch((err) => {
          console.warn('WASM engine initialization failed:', err);
        })
      );
    }

    // Initialize router (detect device capabilities)
    initPromises.push(
      (async () => {
        try {
          await this.config.router.detectDeviceCapabilities();
        } catch (err) {
          console.warn('Device capability detection failed:', err);
        }
      })()
    );

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * Generate text completion
   */
  async generate(request: InferenceRequest): Promise<InferenceResult> {
    await this.ensureInitialized();

    this.totalRequests++;
    this.activeRequests++;

    const startTime = performance.now();

    try {
      // Check cache first
      if (this.config.enableCache && !request.stream) {
        const cached = this.cache.get(request);
        if (cached) {
          this.activeRequests--;
          this.successfulRequests++;
          return cached;
        }
      }

      // Get routing decision
      const routeDecision = await this.config.router.route(
        request.modelId || this.config.defaultModel || 'default',
        {
          strategy: request.forceSource ? undefined : undefined,
          maxTokens: request.maxTokens,
          streamingRequired: request.stream,
        }
      );

      if (!routeDecision) {
        throw new Error('Failed to determine inference route');
      }

      // Try inference with fallbacks
      const result = await this.executeWithFallback(
        request,
        routeDecision,
        startTime
      );

      // Cache successful results
      if (this.config.enableCache && !request.stream) {
        this.cache.set(request, result);
      }

      this.successfulRequests++;
      this.config.onComplete?.(result);

      return result;
    } catch (error) {
      this.config.onError?.(
        error instanceof Error ? error : new Error(String(error)),
        'edge'
      );
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Stream text generation
   */
  async *stream(
    request: InferenceRequest
  ): AsyncGenerator<StreamChunk, InferenceResult> {
    await this.ensureInitialized();

    this.totalRequests++;
    this.activeRequests++;

    const startTime = performance.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;
    let cumulativeText = '';

    try {
      // Get routing decision
      const routeDecision = await this.config.router.route(
        request.modelId || this.config.defaultModel || 'default',
        {
          maxTokens: request.maxTokens,
          streamingRequired: true,
        }
      );

      if (!routeDecision) {
        throw new Error('Failed to determine inference route');
      }

      const source = request.forceSource || routeDecision.primary;

      // Stream from appropriate source
      const streamGen = this.createStreamGenerator(
        source,
        request,
        routeDecision
      );

      for await (const chunk of streamGen) {
        if (firstTokenTime === null) {
          firstTokenTime = performance.now();
        }
        tokenCount++;
        cumulativeText += chunk.text;

        yield {
          ...chunk,
          index: tokenCount - 1,
          source,
          cumulative: cumulativeText,
        };

        if (chunk.done) {
          break;
        }
      }

      const endTime = performance.now();
      const totalMs = endTime - startTime;

      const result: InferenceResult = {
        text: cumulativeText,
        model: request.modelId || this.config.defaultModel || 'default',
        source,
        usage: {
          promptTokens: this.estimateTokens(request.prompt),
          completionTokens: tokenCount,
          totalTokens: this.estimateTokens(request.prompt) + tokenCount,
        },
        timing: {
          totalMs,
          firstTokenMs: firstTokenTime ? firstTokenTime - startTime : totalMs,
          tokensPerSecond: tokenCount / (totalMs / 1000),
        },
        cached: false,
        finishReason: 'stop',
        routeDecision: routeDecision || undefined,
      };

      // Record latency for router learning
      this.config.router.recordLatency(
        source,
        totalMs,
        true,
        result.timing.tokensPerSecond
      );

      this.successfulRequests++;
      this.config.onComplete?.(result);

      return result;
    } catch (error) {
      this.config.onError?.(
        error instanceof Error ? error : new Error(String(error)),
        'edge'
      );
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Execute inference with fallback chain
   */
  private async executeWithFallback(
    request: InferenceRequest,
    decision: RouteDecision,
    startTime: number
  ): Promise<InferenceResult> {
    const sources = [decision.primary, ...decision.fallbacks];
    let lastError: Error | null = null;

    for (const source of sources) {
      if (request.forceSource && source !== request.forceSource) {
        continue;
      }

      for (
        let attempt = 0;
        attempt < (this.config.maxRetries || 3);
        attempt++
      ) {
        try {
          const result = await this.executeOnSource(
            source,
            request,
            decision,
            startTime
          );

          // Record success
          this.config.router.recordLatency(
            source,
            result.timing.totalMs,
            true,
            result.timing.tokensPerSecond
          );

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Record unmet expectations
          this.config.router.recordLatency(
            source,
            performance.now() - startTime,
            false
          );

          // Wait before retry
          if (attempt < (this.config.maxRetries || 3) - 1) {
            await this.delay((this.config.retryDelay || 1000) * (attempt + 1));
          }
        }
      }

      // Notify fallback
      if (sources.indexOf(source) < sources.length - 1) {
        const nextSource = sources[sources.indexOf(source) + 1];
        this.config.onFallback?.(
          source,
          nextSource,
          lastError?.message || 'Unknown error'
        );
      }
    }

    throw lastError || new Error('All inference sources failed');
  }

  /**
   * Execute on specific source
   */
  private async executeOnSource(
    source: InferenceSource,
    request: InferenceRequest,
    decision: RouteDecision,
    startTime: number
  ): Promise<InferenceResult> {
    switch (source) {
      case 'local-webgpu':
        return this.executeLocal(
          this.config.webgpuEngine,
          request,
          decision,
          startTime
        );

      case 'local-wasm':
        return this.executeLocal(
          this.config.wasmEngine,
          request,
          decision,
          startTime
        );

      case 'edge':
        return this.executeDistributed(request, decision, startTime);

      case 'cloud':
        return this.executeCloud(request, decision, startTime);

      default:
        throw new Error(`Unknown inference source: ${source}`);
    }
  }

  /**
   * Execute on local engine
   */
  private async executeLocal(
    engine: LocalInferenceEngine | undefined,
    request: InferenceRequest,
    decision: RouteDecision,
    startTime: number
  ): Promise<InferenceResult> {
    if (!engine) {
      throw new Error('Local engine not available');
    }

    if (!engine.isInitialized()) {
      await engine.initialize();
    }

    const modelId = request.modelId || this.config.defaultModel || 'default';
    if (!engine.hasModel(modelId)) {
      await engine.loadModel(modelId);
    }

    const result = await engine.generate(request);
    result.routeDecision = decision;

    return result;
  }

  /**
   * Execute on distributed edge workers
   */
  private async executeDistributed(
    request: InferenceRequest,
    decision: RouteDecision,
    startTime: number
  ): Promise<InferenceResult> {
    const options: DistributedInferenceOptions = {
      maxTokens: request.maxTokens || 256,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      stopSequences: request.stopSequences,
      priority: request.priority,
    };

    const distResult = await this.config.distributedClient.generate(
      request.prompt,
      options
    );

    const endTime = performance.now();
    const totalMs = endTime - startTime;

    return this.convertDistributedResult(
      distResult,
      request,
      decision,
      totalMs
    );
  }

  /**
   * Execute on cloud (OpenAI-compatible endpoint)
   */
  private async executeCloud(
    request: InferenceRequest,
    decision: RouteDecision,
    startTime: number
  ): Promise<InferenceResult> {
    // For now, delegate to distributed client which can route to cloud
    return this.executeDistributed(request, decision, startTime);
  }

  /**
   * Convert distributed result to adapter result
   */
  private convertDistributedResult(
    distResult: DistributedResult,
    request: InferenceRequest,
    decision: RouteDecision,
    totalMs: number
  ): InferenceResult {
    return {
      text: distResult.text,
      model: request.modelId || this.config.defaultModel || 'default',
      source: 'edge',
      usage: {
        promptTokens: distResult.stats.promptTokens,
        completionTokens: distResult.stats.completionTokens,
        totalTokens: distResult.stats.totalTokens,
      },
      timing: {
        totalMs,
        firstTokenMs: distResult.stats.firstTokenLatencyMs,
        tokensPerSecond: distResult.stats.tokensPerSecond,
      },
      cached: distResult.cache?.kvCacheHit || false,
      finishReason: 'stop',
      routeDecision: decision,
    };
  }

  /**
   * Create stream generator for source
   */
  private async *createStreamGenerator(
    source: InferenceSource,
    request: InferenceRequest,
    decision: RouteDecision
  ): AsyncGenerator<StreamChunk> {
    switch (source) {
      case 'local-webgpu':
      case 'local-wasm': {
        const engine =
          source === 'local-webgpu'
            ? this.config.webgpuEngine
            : this.config.wasmEngine;

        if (!engine) {
          throw new Error(`${source} engine not available`);
        }

        const streamGen = engine.stream(request);
        for await (const chunk of streamGen) {
          yield chunk;
        }
        break;
      }

      case 'edge':
      case 'cloud': {
        const options: DistributedInferenceOptions = {
          maxTokens: request.maxTokens || 256,
          temperature: request.temperature,
          topP: request.topP,
          topK: request.topK,
          stopSequences: request.stopSequences,
          priority: request.priority,
        };

        const streamGen = this.config.distributedClient.stream(
          request.prompt,
          options
        );
        let index = 0;

        for await (const text of streamGen) {
          yield {
            text,
            index: index++,
            source,
            done: false,
          };
        }

        yield {
          text: '',
          index,
          source,
          done: true,
          finishReason: 'stop',
        };
        break;
      }
    }
  }

  /**
   * Estimate token count (simple approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ensure adapter is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get adapter statistics
   */
  getStats(): {
    initialized: boolean;
    activeRequests: number;
    totalRequests: number;
    successRate: number;
    localEngines: {
      webgpu: boolean;
      wasm: boolean;
    };
  } {
    return {
      initialized: this.initialized,
      activeRequests: this.activeRequests,
      totalRequests: this.totalRequests,
      successRate:
        this.totalRequests > 0
          ? this.successfulRequests / this.totalRequests
          : 1,
      localEngines: {
        webgpu: this.config.webgpuEngine?.isInitialized() || false,
        wasm: this.config.wasmEngine?.isInitialized() || false,
      },
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get router
   */
  getRouter(): ModelRouter {
    return this.config.router;
  }

  /**
   * Get distributed client
   */
  getDistributedClient(): DistributedClient {
    return this.config.distributedClient;
  }

  /**
   * Get optimal route for a model based on current context
   * Uses custom routing hook if provided, otherwise default routing
   */
  getRoute(modelId: string): RouteDecision {
    const route = this.config.router.route(modelId, {}) || {
      primary: 'edge',
      source: 'edge',
      fallbacks: ['local-wasm', 'cloud'],
      reason: 'Default fallback',
      confidence: 0.8,
      estimatedLatencyMs: 1000,
      estimatedTPS: 10,
      estimatedCost: 0.001,
    };

    // Apply custom routing if provided
    if (this.config.customRouting) {
      return this.config.customRouting(route, this.config.customContext);
    }

    return route;
  }

  /**
   * Get optimal configuration for a model
   */
  getOptimalConfig(
    modelId: string,
    options?: { quality?: 'low' | 'balanced' | 'high' }
  ): Record<string, unknown> {
    const quality = options?.quality || 'balanced';
    const quantizationMap = {
      low: 'int4',
      balanced: 'int8',
      high: 'fp16',
    };

    return {
      modelId,
      quantization: quantizationMap[quality],
      useSpeculativeDecoding: quality !== 'low',
      usePersistentCache: quality === 'high',
      useAdapterComposition: quality === 'high',
      quality,
    };
  }

  /**
   * Get quality score for a routing decision
   * Uses custom quality scoring if provided, otherwise generic scoring
   */
  getQualityScore(options: {
    model: string;
    source: InferenceSource;
    context?: InferenceContext;
  }): number {
    // Use custom quality scorer if provided
    if (this.config.customQualityScore) {
      return this.config.customQualityScore({
        model: options.model,
        source: options.source,
        context: options.context || this.config.customContext,
      });
    }

    // Generic quality scoring
    let score = 0.8;

    // Source quality
    const sourceQuality: Record<InferenceSource, number> = {
      'local-webgpu': 0.95,
      'local-wasm': 0.85,
      edge: 0.9,
      cloud: 1.0,
    };
    score *= sourceQuality[options.source] || 0.8;

    // Model quality (model-agnostic)
    const modelSize = options.model.toLowerCase();
    if (modelSize.includes('large') || modelSize.includes('4o')) score *= 1.0;
    if (modelSize.includes('medium') || modelSize.includes('flash'))
      score *= 0.95;
    if (modelSize.includes('small') || modelSize.includes('mini')) score *= 0.8;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get hybrid inference options
   */
  getHybridOptions(options: {
    model: string;
    quality?: 'low' | 'balanced' | 'high';
  }): Record<string, unknown> {
    const quality = options.quality || 'balanced';

    return {
      source: quality === 'high' ? 'edge' : 'local-wasm',
      useCache: true,
      useCompression: quality !== 'high',
      compressionFormat: 'brotli',
      enableTelemetry: true,
      retryOnFailure: true,
    };
  }

  /**
   * Set custom context for domain-specific behavior
   * For example: emotional context, user preferences, domain metrics
   */
  setContext(context: InferenceContext): void {
    this.config.customContext = context;
  }

  /**
   * Get current context
   */
  getContext(): InferenceContext | undefined {
    return this.config.customContext;
  }

  /**
   * Update context (backwards compatible alias)
   * @deprecated Use setContext() instead
   */
  setEmotionContext(_context: unknown): void;
  setEmotionContext(_emotion: { category: string; intensity: number }): void;
  setEmotionContext(context: unknown): void {
    this.setContext(context as InferenceContext);
  }
}

/**
 * Create adapter with default configuration
 */
export function createEdgeInferenceAdapter(
  router: ModelRouter,
  distributedClient: DistributedClient,
  options?: Partial<EdgeInferenceAdapterConfig>
): EdgeInferenceAdapter {
  return new EdgeInferenceAdapter({
    router,
    distributedClient,
    ...options,
  });
}
