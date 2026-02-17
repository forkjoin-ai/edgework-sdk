/**
 * Model Preloader
 *
 * Predictive model loading and cache warming:
 * - Preload models before they're needed
 * - LRU-based model eviction
 * - Priority-based loading queue
 * - Background weight fetching
 * - Speculative prefetching
 */

/**
 * Preload priority
 */
export type PreloadPriority =
  | 'critical'
  | 'high'
  | 'typical'
  | 'low'
  | 'background';

/**
 * Model load state
 */
export type ModelLoadState =
  | 'unknown'
  | 'queued'
  | 'downloading'
  | 'parsing'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'evicted';

/**
 * Model metadata
 */
export interface ModelMetadata {
  /** Model ID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Model version */
  version: string;

  /** Size in bytes */
  sizeBytes: number;

  /** Required features */
  requiredFeatures: ('webgpu' | 'wasm' | 'simd')[];

  /** Model family (for similar model detection) */
  family?: string;

  /** Tags for matching */
  tags?: string[];

  /** Model URL */
  url?: string;

  /** CDN URL (for faster loading) */
  cdnUrl?: string;
}

/**
 * Model load progress
 */
export interface ModelLoadProgress {
  /** Model ID */
  modelId: string;

  /** Current state */
  state: ModelLoadState;

  /** Download progress (0-1) */
  downloadProgress: number;

  /** Bytes downloaded */
  bytesDownloaded: number;

  /** Total bytes */
  totalBytes: number;

  /** Download speed in bytes/s */
  speed: number;

  /** Estimated time remaining in ms */
  estimatedTimeMs: number;

  /** Error if any */
  error?: string;
}

/**
 * Preload request
 */
export interface PreloadRequest {
  /** Model ID */
  modelId: string;

  /** Priority */
  priority: PreloadPriority;

  /** Requested timestamp */
  requestedAt: number;

  /** Callback on ready */
  onReady?: () => void;

  /** Callback on progress */
  onProgress?: (progress: ModelLoadProgress) => void;

  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Cache entry
 */
interface CacheEntry {
  /** Model ID */
  modelId: string;

  /** Model metadata */
  metadata: ModelMetadata;

  /** Load state */
  state: ModelLoadState;

  /** Loaded timestamp */
  loadedAt: number;

  /** Last accessed timestamp */
  lastAccessedAt: number;

  /** Access count */
  accessCount: number;

  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Usage pattern
 */
interface UsagePattern {
  /** Model ID */
  modelId: string;

  /** Times used */
  useCount: number;

  /** Common context models (used together) */
  contextModels: Map<string, number>;

  /** Average session duration */
  avgSessionDuration: number;

  /** Last used timestamp */
  lastUsed: number;
}

/**
 * Preloader configuration
 */
export interface ModelPreloaderConfig {
  /** Maximum cache size in bytes */
  maxCacheSize: number;

  /** Maximum models to keep loaded */
  maxModels: number;

  /** Enable predictive prefetching */
  enablePredictive: boolean;

  /** Prediction confidence threshold (0-1) */
  predictionThreshold: number;

  /** Background fetch interval in ms */
  backgroundInterval: number;

  /** CDN base URL */
  cdnBaseUrl?: string;

  /** Callback on model ready */
  onModelReady?: (modelId: string) => void;

  /** Callback on model evicted */
  onModelEvicted?: (modelId: string) => void;

  /** Callback on cache full */
  onCacheFull?: () => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ModelPreloaderConfig = {
  maxCacheSize: 500 * 1024 * 1024, // 500MB
  maxModels: 5,
  enablePredictive: true,
  predictionThreshold: 0.5,
  backgroundInterval: 60000,
};

/**
 * Priority order for sorting
 */
const PRIORITY_ORDER: Record<PreloadPriority, number> = {
  critical: 0,
  high: 1,
  typical: 2,
  low: 3,
  background: 4,
};

/**
 * Model Preloader
 *
 * Manages model preloading with predictive prefetching.
 */
export class ModelPreloader {
  private config: ModelPreloaderConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private queue: PreloadRequest[] = [];
  private activeDownloads: Map<string, AbortController> = new Map();
  private usagePatterns: Map<string, UsagePattern> = new Map();
  private modelRegistry: Map<string, ModelMetadata> = new Map();
  private backgroundInterval: ReturnType<typeof setInterval> | null = null;
  private currentCacheSize = 0;

  constructor(config: Partial<ModelPreloaderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the preloader
   */
  start(): void {
    if (this.backgroundInterval) return;

    this.backgroundInterval = setInterval(
      () => this.processBackgroundTasks(),
      this.config.backgroundInterval
    );

    // Start processing queue
    this.processQueue();
  }

  /**
   * Stop the preloader
   */
  stop(): void {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    // Cancel active downloads
    for (const controller of this.activeDownloads.values()) {
      controller.abort();
    }
    this.activeDownloads.clear();
  }

  /**
   * Register a model
   */
  registerModel(metadata: ModelMetadata): void {
    this.modelRegistry.set(metadata.id, metadata);
  }

  /**
   * Preload a model
   */
  async preload(
    modelId: string,
    options: {
      priority?: PreloadPriority;
      onReady?: () => void;
      onProgress?: (progress: ModelLoadProgress) => void;
      onError?: (error: Error) => void;
    } = {}
  ): Promise<void> {
    // Check if already loaded
    const cached = this.cache.get(modelId);
    if (cached && cached.state === 'ready') {
      cached.lastAccessedAt = Date.now();
      cached.accessCount++;
      options.onReady?.();
      return;
    }

    // Check if already queued
    const existingIndex = this.queue.findIndex((r) => r.modelId === modelId);
    if (existingIndex >= 0) {
      // Update priority if higher
      const existing = this.queue[existingIndex];
      const newPriority = options.priority || 'typical';
      if (PRIORITY_ORDER[newPriority] < PRIORITY_ORDER[existing.priority]) {
        existing.priority = newPriority;
        this.sortQueue();
      }
      // Add callbacks
      if (options.onReady) {
        const oldOnReady = existing.onReady;
        existing.onReady = () => {
          oldOnReady?.();
          options.onReady?.();
        };
      }
      return;
    }

    // Add to queue
    const request: PreloadRequest = {
      modelId,
      priority: options.priority || 'typical',
      requestedAt: Date.now(),
      onReady: options.onReady,
      onProgress: options.onProgress,
      onError: options.onError,
    };

    this.queue.push(request);
    this.sortQueue();

    // Process queue
    this.processQueue();
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityDiff =
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.requestedAt - b.requestedAt;
    });
  }

  /**
   * Process the preload queue
   */
  private async processQueue(): Promise<void> {
    // Limit concurrent downloads
    const maxConcurrent = 2;
    while (this.activeDownloads.size < maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) break;

      this.downloadModel(request);
    }
  }

  /**
   * Download a model
   */
  private async downloadModel(request: PreloadRequest): Promise<void> {
    const { modelId } = request;

    // Get metadata
    const metadata = this.modelRegistry.get(modelId);
    if (!metadata) {
      request.onError?.(new Error(`Model not registered: ${modelId}`));
      return;
    }

    // Check if we need to make room
    const projectedSize = this.currentCacheSize + metadata.sizeBytes;
    if (
      projectedSize > this.config.maxCacheSize ||
      this.cache.size >= this.config.maxModels
    ) {
      await this.evictModels(metadata.sizeBytes);
    }

    // Create abort controller
    const controller = new AbortController();
    this.activeDownloads.set(modelId, controller);

    // Initialize cache entry
    const entry: CacheEntry = {
      modelId,
      metadata,
      state: 'downloading',
      loadedAt: 0,
      lastAccessedAt: Date.now(),
      accessCount: 0,
      sizeBytes: 0,
    };
    this.cache.set(modelId, entry);

    try {
      const url = metadata.cdnUrl || metadata.url;
      if (!url) {
        throw new Error(`No URL for model: ${modelId}`);
      }

      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch model: ${response.status}`);
      }

      const totalBytes =
        parseInt(response.headers.get('Content-Length') || '0') ||
        metadata.sizeBytes;
      let downloadedBytes = 0;
      const startTime = Date.now();

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body not readable');
      }

      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        downloadedBytes += value.length;

        // Report progress
        const elapsed = Date.now() - startTime;
        const speed = downloadedBytes / (elapsed / 1000);
        const remaining = totalBytes - downloadedBytes;
        const estimatedTime = (remaining / speed) * 1000;

        request.onProgress?.({
          modelId,
          state: 'downloading',
          downloadProgress: downloadedBytes / totalBytes,
          bytesDownloaded: downloadedBytes,
          totalBytes,
          speed,
          estimatedTimeMs: estimatedTime,
        });
      }

      // Combine chunks
      entry.state = 'parsing';
      request.onProgress?.({
        modelId,
        state: 'parsing',
        downloadProgress: 1,
        bytesDownloaded: downloadedBytes,
        totalBytes,
        speed: 0,
        estimatedTimeMs: 0,
      });

      // Store the model (in real implementation, this would parse and initialize)
      entry.state = 'initializing';

      // Simulate initialization
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Mark as ready
      entry.state = 'ready';
      entry.loadedAt = Date.now();
      entry.sizeBytes = downloadedBytes;
      this.currentCacheSize += downloadedBytes;

      this.config.onModelReady?.(modelId);
      request.onReady?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        entry.state = 'evicted';
      } else {
        entry.state = 'error';
        request.onError?.(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    } finally {
      this.activeDownloads.delete(modelId);
      this.processQueue();
    }
  }

  /**
   * Evict models to make room
   */
  private async evictModels(neededBytes: number): Promise<void> {
    // Get eviction candidates (LRU, not in active use)
    const candidates = Array.from(this.cache.values())
      .filter((e) => e.state === 'ready')
      .sort((a, b) => {
        // Prefer evicting less accessed models
        const accessScore = (b.accessCount - a.accessCount) * 1000;
        // Prefer evicting older models
        const ageScore = a.lastAccessedAt - b.lastAccessedAt;
        return accessScore + ageScore;
      });

    let freedBytes = 0;
    const toEvict: string[] = [];

    for (const candidate of candidates) {
      if (
        this.currentCacheSize - freedBytes + neededBytes <=
          this.config.maxCacheSize &&
        this.cache.size - toEvict.length < this.config.maxModels
      ) {
        break;
      }
      toEvict.push(candidate.modelId);
      freedBytes += candidate.sizeBytes;
    }

    // Perform eviction
    for (const modelId of toEvict) {
      await this.evictModel(modelId);
    }

    if (toEvict.length > 0) {
      this.config.onCacheFull?.();
    }
  }

  /**
   * Evict a specific model
   */
  private async evictModel(modelId: string): Promise<void> {
    const entry = this.cache.get(modelId);
    if (!entry) return;

    // Cancel if downloading
    const controller = this.activeDownloads.get(modelId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(modelId);
    }

    this.currentCacheSize -= entry.sizeBytes;
    entry.state = 'evicted';
    this.cache.delete(modelId);

    this.config.onModelEvicted?.(modelId);
  }

  /**
   * Record model usage
   */
  recordUsage(modelId: string, contextModelIds: string[] = []): void {
    // Update access
    const cached = this.cache.get(modelId);
    if (cached) {
      cached.lastAccessedAt = Date.now();
      cached.accessCount++;
    }

    // Update usage pattern
    let pattern = this.usagePatterns.get(modelId);
    if (!pattern) {
      pattern = {
        modelId,
        useCount: 0,
        contextModels: new Map(),
        avgSessionDuration: 0,
        lastUsed: 0,
      };
      this.usagePatterns.set(modelId, pattern);
    }

    pattern.useCount++;
    pattern.lastUsed = Date.now();

    // Track context models
    for (const contextId of contextModelIds) {
      const count = pattern.contextModels.get(contextId) || 0;
      pattern.contextModels.set(contextId, count + 1);
    }

    // Predictive prefetching
    if (this.config.enablePredictive) {
      this.triggerPredictivePrefetch(modelId);
    }
  }

  /**
   * Trigger predictive prefetching
   */
  private triggerPredictivePrefetch(currentModelId: string): void {
    const pattern = this.usagePatterns.get(currentModelId);
    if (!pattern) return;

    // Find models commonly used together
    const predictions: Array<{ modelId: string; confidence: number }> = [];

    for (const [contextId, count] of pattern.contextModels) {
      const confidence = count / pattern.useCount;
      if (confidence >= this.config.predictionThreshold) {
        predictions.push({ modelId: contextId, confidence });
      }
    }

    // Sort by confidence and prefetch
    predictions.sort((a, b) => b.confidence - a.confidence);

    for (const prediction of predictions.slice(0, 2)) {
      // Only prefetch if not already loaded
      const cached = this.cache.get(prediction.modelId);
      if (!cached || cached.state === 'evicted') {
        this.preload(prediction.modelId, { priority: 'background' });
      }
    }
  }

  /**
   * Process background tasks
   */
  private processBackgroundTasks(): void {
    // Clean up evicted entries
    for (const [modelId, entry] of this.cache) {
      if (entry.state === 'evicted') {
        this.cache.delete(modelId);
      }
    }

    // Predictive loading based on time patterns
    if (this.config.enablePredictive) {
      this.predictBasedOnTime();
    }
  }

  /**
   * Predict models needed based on time
   */
  private predictBasedOnTime(): void {
    // Find models used frequently at this time
    const now = new Date();
    const currentHour = now.getHours();

    // This would use historical data in a real implementation
    // For now, just ensure frequently used models are loaded
    const frequentModels = Array.from(this.usagePatterns.values())
      .filter((p) => p.useCount > 5)
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 3);

    for (const pattern of frequentModels) {
      const cached = this.cache.get(pattern.modelId);
      if (!cached || cached.state === 'evicted' || cached.state === 'error') {
        this.preload(pattern.modelId, { priority: 'background' });
      }
    }
  }

  /**
   * Check if model is ready
   */
  isReady(modelId: string): boolean {
    const cached = this.cache.get(modelId);
    return cached?.state === 'ready';
  }

  /**
   * Get model load state
   */
  getState(modelId: string): ModelLoadState {
    const cached = this.cache.get(modelId);
    return cached?.state || 'unknown';
  }

  /**
   * Get all cached models
   */
  getCachedModels(): Array<{
    modelId: string;
    state: ModelLoadState;
    sizeBytes: number;
    lastAccessed: number;
    accessCount: number;
  }> {
    return Array.from(this.cache.values()).map((e) => ({
      modelId: e.modelId,
      state: e.state,
      sizeBytes: e.sizeBytes,
      lastAccessed: e.lastAccessedAt,
      accessCount: e.accessCount,
    }));
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalModels: number;
    readyModels: number;
    cacheSize: number;
    maxCacheSize: number;
    queueSize: number;
    activeDownloads: number;
  } {
    const readyCount = Array.from(this.cache.values()).filter(
      (e) => e.state === 'ready'
    ).length;

    return {
      totalModels: this.cache.size,
      readyModels: readyCount,
      cacheSize: this.currentCacheSize,
      maxCacheSize: this.config.maxCacheSize,
      queueSize: this.queue.length,
      activeDownloads: this.activeDownloads.size,
    };
  }

  /**
   * Clear all cached models
   */
  async clearCache(): Promise<void> {
    // Cancel all downloads
    for (const controller of this.activeDownloads.values()) {
      controller.abort();
    }
    this.activeDownloads.clear();

    // Clear cache
    this.cache.clear();
    this.currentCacheSize = 0;

    // Clear queue
    this.queue = [];
  }

  /**
   * Warm cache with common models
   */
  async warmCache(modelIds: string[]): Promise<void> {
    for (const modelId of modelIds) {
      await this.preload(modelId, { priority: 'high' });
    }
  }
}

/**
 * Pre-configured preloader presets
 */
export const PRELOADER_PRESETS = {
  /** Aggressive preloading for fast devices */
  aggressive: {
    maxCacheSize: 1024 * 1024 * 1024, // 1GB
    maxModels: 10,
    enablePredictive: true,
    predictionThreshold: 0.3,
    backgroundInterval: 30000,
  } as Partial<ModelPreloaderConfig>,

  /** Conservative for limited devices */
  conservative: {
    maxCacheSize: 200 * 1024 * 1024, // 200MB
    maxModels: 3,
    enablePredictive: false,
    backgroundInterval: 120000,
  } as Partial<ModelPreloaderConfig>,

  /** Balanced for typical devices */
  balanced: {
    maxCacheSize: 500 * 1024 * 1024, // 500MB
    maxModels: 5,
    enablePredictive: true,
    predictionThreshold: 0.5,
    backgroundInterval: 60000,
  } as Partial<ModelPreloaderConfig>,
};
