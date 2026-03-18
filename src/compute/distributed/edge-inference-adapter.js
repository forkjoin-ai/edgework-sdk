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
/**
 * Simple LRU cache for inference results
 */
class InferenceCache {
  constructor(maxSize = 100, ttl = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  /**
   * Generate cache key
   */
  key(request) {
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
  get(request) {
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
  set(request, result) {
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
  clear() {
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
  constructor(config) {
    this.initialized = false;
    this.activeRequests = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
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
  async initialize() {
    if (this.initialized) return;
    // Initialize local engines if available
    const initPromises = [];
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
  async generate(request) {
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
  async *stream(request) {
    await this.ensureInitialized();
    this.totalRequests++;
    this.activeRequests++;
    const startTime = performance.now();
    let firstTokenTime = null;
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
      const result = {
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
  async executeWithFallback(request, decision, startTime) {
    const sources = [decision.primary, ...decision.fallbacks];
    let lastError = null;
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
  async executeOnSource(source, request, decision, startTime) {
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
  async executeLocal(engine, request, decision, startTime) {
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
  async executeDistributed(request, decision, startTime) {
    const options = {
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
  async executeCloud(request, decision, startTime) {
    // For now, delegate to distributed client which can route to cloud
    return this.executeDistributed(request, decision, startTime);
  }
  /**
   * Convert distributed result to adapter result
   */
  convertDistributedResult(distResult, request, decision, totalMs) {
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
  async *createStreamGenerator(source, request, decision) {
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
        const options = {
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
  estimateTokens(text) {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }
  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Ensure adapter is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  /**
   * Get adapter statistics
   */
  getStats() {
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
  clearCache() {
    this.cache.clear();
  }
  /**
   * Get router
   */
  getRouter() {
    return this.config.router;
  }
  /**
   * Get distributed client
   */
  getDistributedClient() {
    return this.config.distributedClient;
  }
  /**
   * Get optimal route for a model based on current context
   * Uses custom routing hook if provided, otherwise default routing
   */
  getRoute(modelId) {
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
  getOptimalConfig(modelId, options) {
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
  getQualityScore(options) {
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
    const sourceQuality = {
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
  getHybridOptions(options) {
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
  setContext(context) {
    this.config.customContext = context;
  }
  /**
   * Get current context
   */
  getContext() {
    return this.config.customContext;
  }
  setEmotionContext(context) {
    this.setContext(context);
  }
}
/**
 * Create adapter with default configuration
 */
export function createEdgeInferenceAdapter(router, distributedClient, options) {
  return new EdgeInferenceAdapter({
    router,
    distributedClient,
    ...options,
  });
}
//# sourceMappingURL=edge-inference-adapter.js.map
