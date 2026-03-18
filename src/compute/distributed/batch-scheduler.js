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
 * Default configuration
 */
const DEFAULT_CONFIG = {
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
export class BatchScheduler {
  constructor(config) {
    this.queue = [];
    this.flushTimer = null;
    this.processing = false;
    this.stats = {
      totalItems: 0,
      totalBatches: 0,
      avgBatchSize: 0,
      avgWaitTime: 0,
      queuedItems: 0,
      successRate: 1,
    };
    this.successCount = 0;
    this.failureCount = 0;
    this.totalWaitTime = 0;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Add item to batch queue
   */
  add(data, priority = 5, deadline) {
    return new Promise((resolve, reject) => {
      const item = {
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
  addMany(items, priority = 5) {
    return Promise.all(items.map((item) => this.add(item, priority)));
  }
  /**
   * Force flush the queue
   */
  async flush() {
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
  async processBatch() {
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
        item.reject(error);
        this.failureCount++;
      }
      this.config.onError?.(
        error,
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
  shouldFlushImmediately() {
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
  scheduleFlush() {
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.config.maxWaitTime);
  }
  /**
   * Generate unique ID
   */
  generateId() {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  /**
   * Get current statistics
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * Get queue length
   */
  getQueueLength() {
    return this.queue.length;
  }
  /**
   * Clear the queue
   */
  clear() {
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
  resetStats() {
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
export class DebouncedBatchScheduler extends BatchScheduler {
  constructor(config, debounceMs = 50) {
    super(config);
    this.debounceTimeout = null;
    this.debounceMs = debounceMs;
  }
  /**
   * Add with debouncing
   */
  add(data, priority = 5, deadline) {
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
export class ThrottledBatchScheduler extends BatchScheduler {
  constructor(config, throttleMs = 100) {
    super(config);
    this.lastProcessTime = 0;
    this.throttleTimer = null;
    this.throttleMs = throttleMs;
  }
  /**
   * Flush with throttling
   */
  async flush() {
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
export class InferenceBatchScheduler extends BatchScheduler {
  constructor(batchInference, config = {}) {
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
  infer(request) {
    return this.add(request, 5);
  }
  /**
   * Queue high-priority inference
   */
  inferUrgent(request) {
    return this.add(request, 1);
  }
  /**
   * Queue low-priority (background) inference
   */
  inferBackground(request) {
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
  },
  /** High throughput - larger batches, longer wait */
  highThroughput: {
    maxBatchSize: 64,
    maxWaitTime: 200,
    minBatchSize: 8,
    enablePriority: true,
    enableDeadlines: false,
  },
  /** Balanced */
  balanced: {
    maxBatchSize: 32,
    maxWaitTime: 100,
    minBatchSize: 1,
    enablePriority: true,
    enableDeadlines: true,
  },
  /** Realtime - immediate processing */
  realtime: {
    maxBatchSize: 1,
    maxWaitTime: 0,
    minBatchSize: 1,
    enablePriority: false,
    enableDeadlines: false,
  },
};
/**
 * Create a batch scheduler with preset
 */
export function createBatchScheduler(
  processBatch,
  preset = 'balanced',
  overrides = {}
) {
  return new BatchScheduler({
    ...BATCH_PRESETS[preset],
    ...overrides,
    processBatch,
  });
}
//# sourceMappingURL=batch-scheduler.js.map
