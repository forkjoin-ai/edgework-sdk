/**
 * Batch Scheduler
 *
 * Client-side request batching for efficiency:
 * - Automatic request grouping
 * - Priority-based scheduling
 * - Optimal batch sizing
 * - Debouncing and throttling
 */

/**
 * Batch item
 */
export interface BatchItem<T, R> {
  /** Unique request ID */
  id: string;

  /** Request data */
  data: T;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Resolve function */
  resolve: (result: R) => void;

  /** Reject function */
  reject: (error: Error) => void;

  /** Timestamp when added */
  addedAt: number;

  /** Request deadline (optional) */
  deadline?: number;
}

/**
 * Batch result
 */
export interface BatchResult<R> {
  /** Item ID */
  id: string;

  /** Success flag */
  success: boolean;

  /** Result if successful */
  result?: R;

  /** Error if failed */
  error?: Error;
}

/**
 * Batch statistics
 */
export interface BatchStats {
  /** Total items processed */
  totalItems: number;

  /** Total batches processed */
  totalBatches: number;

  /** Average batch size */
  avgBatchSize: number;

  /** Average wait time in ms */
  avgWaitTime: number;

  /** Items currently queued */
  queuedItems: number;

  /** Success rate */
  successRate: number;
}

/**
 * Batch scheduler configuration
 */
export interface BatchSchedulerConfig<T, R> {
  /** Maximum batch size */
  maxBatchSize: number;

  /** Maximum wait time before flushing (ms) */
  maxWaitTime: number;

  /** Minimum batch size before flushing */
  minBatchSize: number;

  /** Process batch function */
  processBatch: (items: T[]) => Promise<R[]>;

  /** Enable priority scheduling */
  enablePriority: boolean;

  /** Enable deadline-based scheduling */
  enableDeadlines: boolean;

  /** Callback when batch is processed */
  onBatchProcessed?: (batchSize: number, durationMs: number) => void;

  /** Callback on error */
  onError?: (error: Error, items: T[]) => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<BatchSchedulerConfig<any, any>> = {
  maxBatchSize: 32,
  maxWaitTime: 100,
  minBatchSize: 1,
  enablePriority: true,
  enableDeadlines: true,
};

/**
 * Batch Scheduler
 *
 * Groups requests into batches for efficient processing.
 */
export class BatchScheduler<T, R> {
  private config: BatchSchedulerConfig<T, R>;
  private queue: BatchItem<T, R>[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private stats: BatchStats = {
    totalItems: 0,
    totalBatches: 0,
    avgBatchSize: 0,
    avgWaitTime: 0,
    queuedItems: 0,
    successRate: 1,
  };
  private successCount = 0;
  private failureCount = 0;
  private totalWaitTime = 0;

  constructor(
    config: Partial<BatchSchedulerConfig<T, R>> &
      Pick<BatchSchedulerConfig<T, R>, 'processBatch'>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config } as BatchSchedulerConfig<
      T,
      R
    >;
  }

  /**
   * Add item to batch queue
   */
  add(data: T, priority = 5, deadline?: number): Promise<R> {
    return new Promise((resolve, reject) => {
      const item: BatchItem<T, R> = {
        id: this.generateId(),
        data,
        priority,
        resolve,
        reject,
        addedAt: Date.now(),
        deadline,
      };

      this.queue.push(item);
      this.stats.queuedItems = this.queue.length;

      // Sort by priority if enabled
      if (this.config.enablePriority) {
        this.queue.sort((a, b) => a.priority - b.priority);
      }

      // Check if we should flush immediately
      if (this.shouldFlushImmediately()) {
        this.flush();
      } else if (!this.flushTimer) {
        this.scheduleFlush();
      }

      // Check for deadline-triggered flush
      if (this.config.enableDeadlines && deadline) {
        const timeUntilDeadline = deadline - Date.now();
        if (timeUntilDeadline < this.config.maxWaitTime) {
          setTimeout(() => this.flush(), Math.max(0, timeUntilDeadline - 10));
        }
      }
    });
  }

  /**
   * Add multiple items
   */
  addMany(items: T[], priority = 5): Promise<R[]> {
    return Promise.all(items.map((item) => this.add(item, priority)));
  }

  /**
   * Force flush the queue
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0 || this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        await this.processBatch();
      }
    } finally {
      this.processing = false;
      this.stats.queuedItems = this.queue.length;
    }
  }

  /**
   * Process a single batch
   */
  private async processBatch(): Promise<void> {
    // Get batch items
    const batchSize = Math.min(this.config.maxBatchSize, this.queue.length);
    const batch = this.queue.splice(0, batchSize);
    this.stats.queuedItems = this.queue.length;

    if (batch.length === 0) return;

    const startTime = Date.now();

    // Calculate wait times
    for (const item of batch) {
      this.totalWaitTime += startTime - item.addedAt;
    }

    try {
      // Process the batch
      const results = await this.config.processBatch(batch.map((b) => b.data));

      // Distribute results
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const result = results[i];

        if (result !== undefined) {
          item.resolve(result);
          this.successCount++;
        } else {
          item.reject(new Error('No result for item'));
          this.failureCount++;
        }
      }
    } catch (error) {
      // Reject all items in batch
      for (const item of batch) {
        item.reject(error as Error);
        this.failureCount++;
      }

      this.config.onError?.(
        error as Error,
        batch.map((b) => b.data)
      );
    }

    const duration = Date.now() - startTime;

    // Update stats
    this.stats.totalItems += batch.length;
    this.stats.totalBatches++;
    this.stats.avgBatchSize = this.stats.totalItems / this.stats.totalBatches;
    this.stats.avgWaitTime = this.totalWaitTime / this.stats.totalItems;
    this.stats.successRate =
      this.successCount / (this.successCount + this.failureCount);

    this.config.onBatchProcessed?.(batch.length, duration);
  }

  /**
   * Check if we should flush immediately
   */
  private shouldFlushImmediately(): boolean {
    // Flush if we've reached max batch size
    if (this.queue.length >= this.config.maxBatchSize) {
      return true;
    }

    // Check for imminent deadlines
    if (this.config.enableDeadlines) {
      const now = Date.now();
      const urgentItems = this.queue.filter(
        (item) => item.deadline && item.deadline - now < 10
      );
      if (urgentItems.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Schedule a flush
   */
  private scheduleFlush(): void {
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.config.maxWaitTime);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current statistics
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    // Reject all pending items
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    this.stats.queuedItems = 0;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalItems: 0,
      totalBatches: 0,
      avgBatchSize: 0,
      avgWaitTime: 0,
      queuedItems: this.queue.length,
      successRate: 1,
    };
    this.successCount = 0;
    this.failureCount = 0;
    this.totalWaitTime = 0;
  }
}

/**
 * Debounced batch scheduler
 *
 * Waits for a quiet period before processing.
 */
export class DebouncedBatchScheduler<T, R> extends BatchScheduler<T, R> {
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(
    config: Partial<BatchSchedulerConfig<T, R>> &
      Pick<BatchSchedulerConfig<T, R>, 'processBatch'>,
    debounceMs = 50
  ) {
    super(config);
    this.debounceMs = debounceMs;
  }

  /**
   * Add with debouncing
   */
  override add(data: T, priority = 5, deadline?: number): Promise<R> {
    // Clear existing debounce timer
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Set new debounce timer
    this.debounceTimeout = setTimeout(() => {
      this.debounceTimeout = null;
      this.flush();
    }, this.debounceMs);

    return super.add(data, priority, deadline);
  }
}

/**
 * Throttled batch scheduler
 *
 * Limits batch processing rate.
 */
export class ThrottledBatchScheduler<T, R> extends BatchScheduler<T, R> {
  private lastProcessTime = 0;
  private throttleMs: number;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: Partial<BatchSchedulerConfig<T, R>> &
      Pick<BatchSchedulerConfig<T, R>, 'processBatch'>,
    throttleMs = 100
  ) {
    super(config);
    this.throttleMs = throttleMs;
  }

  /**
   * Flush with throttling
   */
  override async flush(): Promise<void> {
    const now = Date.now();
    const timeSinceLastProcess = now - this.lastProcessTime;

    if (timeSinceLastProcess < this.throttleMs) {
      // Schedule delayed flush
      if (!this.throttleTimer) {
        this.throttleTimer = setTimeout(() => {
          this.throttleTimer = null;
          this.lastProcessTime = Date.now();
          super.flush();
        }, this.throttleMs - timeSinceLastProcess);
      }
      return;
    }

    this.lastProcessTime = now;
    return super.flush();
  }
}

/**
 * Inference batch scheduler
 *
 * Specialized for inference requests.
 */
export interface InferenceRequest {
  /** Model ID */
  model: string;

  /** Input prompt */
  prompt: string;

  /** Max tokens */
  maxTokens?: number;

  /** Temperature */
  temperature?: number;
}

export interface InferenceResponse {
  /** Generated text */
  text: string;

  /** Tokens used */
  tokensUsed: number;

  /** Latency in ms */
  latencyMs: number;
}

export class InferenceBatchScheduler extends BatchScheduler<
  InferenceRequest,
  InferenceResponse
> {
  constructor(
    batchInference: (
      requests: InferenceRequest[]
    ) => Promise<InferenceResponse[]>,
    config: Partial<
      Omit<
        BatchSchedulerConfig<InferenceRequest, InferenceResponse>,
        'processBatch'
      >
    > = {}
  ) {
    super({
      ...config,
      processBatch: batchInference,
      maxBatchSize: config.maxBatchSize ?? 8, // Smaller batches for inference
      maxWaitTime: config.maxWaitTime ?? 50, // Lower latency
    });
  }

  /**
   * Queue an inference request
   */
  infer(request: InferenceRequest): Promise<InferenceResponse> {
    return this.add(request, 5);
  }

  /**
   * Queue high-priority inference
   */
  inferUrgent(request: InferenceRequest): Promise<InferenceResponse> {
    return this.add(request, 1);
  }

  /**
   * Queue low-priority (background) inference
   */
  inferBackground(request: InferenceRequest): Promise<InferenceResponse> {
    return this.add(request, 10);
  }
}

/**
 * Pre-configured batch presets
 */
export const BATCH_PRESETS = {
  /** Low latency - small batches, fast flush */
  lowLatency: {
    maxBatchSize: 4,
    maxWaitTime: 25,
    minBatchSize: 1,
    enablePriority: true,
    enableDeadlines: true,
  } as Partial<BatchSchedulerConfig<unknown, unknown>>,

  /** High throughput - larger batches, longer wait */
  highThroughput: {
    maxBatchSize: 64,
    maxWaitTime: 200,
    minBatchSize: 8,
    enablePriority: true,
    enableDeadlines: false,
  } as Partial<BatchSchedulerConfig<unknown, unknown>>,

  /** Balanced */
  balanced: {
    maxBatchSize: 32,
    maxWaitTime: 100,
    minBatchSize: 1,
    enablePriority: true,
    enableDeadlines: true,
  } as Partial<BatchSchedulerConfig<unknown, unknown>>,

  /** Realtime - immediate processing */
  realtime: {
    maxBatchSize: 1,
    maxWaitTime: 0,
    minBatchSize: 1,
    enablePriority: false,
    enableDeadlines: false,
  } as Partial<BatchSchedulerConfig<unknown, unknown>>,
};

/**
 * Create a batch scheduler with preset
 */
export function createBatchScheduler<T, R>(
  processBatch: (items: T[]) => Promise<R[]>,
  preset: keyof typeof BATCH_PRESETS = 'balanced',
  overrides: Partial<BatchSchedulerConfig<T, R>> = {}
): BatchScheduler<T, R> {
  return new BatchScheduler({
    ...BATCH_PRESETS[preset],
    ...overrides,
    processBatch,
  });
}
