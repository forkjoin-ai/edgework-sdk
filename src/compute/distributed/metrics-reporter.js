/**
 * Metrics Reporter
 *
 * Client-side telemetry and performance monitoring:
 * - Inference latency tracking
 * - Token throughput monitoring
 * - Error rate tracking
 * - Resource usage monitoring
 * - Custom metric support
 */
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  enabled: true,
  collectionInterval: 1000,
  reportInterval: 60000,
  enableConsoleLogging: false,
  maxStoredMetrics: 10000,
  latencyBuckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
};
/**
 * Metrics Reporter
 *
 * Collects and reports performance metrics.
 */
export class MetricsReporter {
  constructor(config = {}) {
    this.storedMetrics = [];
    this.collectionInterval = null;
    this.reportInterval = null;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = this.createEmptyStore();
    this.sessionStartTime = Date.now();
    this.lastReportTime = Date.now();
  }
  /**
   * Create empty metric store
   */
  createEmptyStore() {
    return {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      timings: new Map(),
    };
  }
  /**
   * Start metrics collection
   */
  start() {
    if (!this.config.enabled) return;
    // Start collection interval
    this.collectionInterval = setInterval(
      () => this.collect(),
      this.config.collectionInterval
    );
    // Start report interval
    this.reportInterval = setInterval(
      () => this.generateReport(),
      this.config.reportInterval
    );
  }
  /**
   * Stop metrics collection
   */
  stop() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }
  /**
   * Increment a counter
   */
  increment(name, value = 1, labels = {}) {
    if (!this.config.enabled) return;
    const key = this.createKey(name, labels);
    const counter = this.store.counters.get(key) || { value: 0, labels };
    counter.value += value;
    this.store.counters.set(key, counter);
    this.emitMetric({
      name,
      type: 'counter',
      value: counter.value,
      labels,
      timestamp: Date.now(),
    });
  }
  /**
   * Set a gauge value
   */
  gauge(name, value, labels = {}) {
    if (!this.config.enabled) return;
    const key = this.createKey(name, labels);
    this.store.gauges.set(key, { value, labels });
    this.emitMetric({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: Date.now(),
    });
  }
  /**
   * Record a histogram observation
   */
  histogram(name, value, labels = {}) {
    if (!this.config.enabled) return;
    const key = this.createKey(name, labels);
    const hist = this.store.histograms.get(key) || { values: [], labels };
    hist.values.push(value);
    // Limit stored values
    if (hist.values.length > 1000) {
      hist.values = hist.values.slice(-1000);
    }
    this.store.histograms.set(key, hist);
    this.emitMetric({
      name,
      type: 'histogram',
      value,
      labels,
      timestamp: Date.now(),
    });
  }
  /**
   * Record a timing
   */
  timing(name, durationMs, labels = {}) {
    if (!this.config.enabled) return;
    const key = this.createKey(name, labels);
    const timing = this.store.timings.get(key) || { values: [], labels };
    timing.values.push(durationMs);
    // Limit stored values
    if (timing.values.length > 1000) {
      timing.values = timing.values.slice(-1000);
    }
    this.store.timings.set(key, timing);
    this.emitMetric({
      name,
      type: 'timing',
      value: durationMs,
      unit: 'ms',
      labels,
      timestamp: Date.now(),
    });
  }
  /**
   * Time a function execution
   */
  async time(name, fn, labels = {}) {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.timing(name, duration, labels);
    }
  }
  /**
   * Create a timer for manual timing
   */
  startTimer(name, labels = {}) {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.timing(name, duration, labels);
      return duration;
    };
  }
  /**
   * Record inference metrics
   */
  recordInference(metrics) {
    const labels = { model: metrics.model, source: metrics.source };
    // Count request
    this.increment('inference_requests_total', 1, labels);
    if (metrics.success) {
      this.increment('inference_success_total', 1, labels);
      this.timing('inference_latency_ms', metrics.latencyMs, labels);
      this.histogram('tokens_generated', metrics.tokensGenerated, labels);
      this.histogram('prompt_tokens', metrics.promptTokens, labels);
      // Calculate tokens per second
      const tps = metrics.tokensGenerated / (metrics.latencyMs / 1000);
      this.gauge('tokens_per_second', tps, labels);
    } else {
      this.increment('inference_errors_total', 1, {
        ...labels,
        error: metrics.error || 'unknown',
      });
    }
  }
  /**
   * Record cache metrics
   */
  recordCacheEvent(event, labels = {}) {
    this.increment(`cache_${event}_total`, 1, labels);
  }
  /**
   * Record network metrics
   */
  recordNetworkTransfer(type, bytes, labels = {}) {
    this.increment(`network_bytes_${type}_total`, bytes, labels);
  }
  /**
   * Record resource usage
   */
  recordResourceUsage() {
    // Memory usage (if available)
    const memory = performance.memory;
    if (memory) {
      this.gauge('memory_used_bytes', memory.usedJSHeapSize);
    }
    // Estimate CPU usage from long tasks
    if ('PerformanceObserver' in globalThis) {
      const entries = performance.getEntriesByType('longtask');
      if (entries.length > 0) {
        const recentTask = entries[entries.length - 1];
        this.gauge('cpu_long_task_duration_ms', recentTask.duration);
      }
    }
  }
  /**
   * Create key from name and labels
   */
  createKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
  /**
   * Emit a metric
   */
  emitMetric(metric) {
    // Store metric
    this.storedMetrics.push(metric);
    if (this.storedMetrics.length > this.config.maxStoredMetrics) {
      this.storedMetrics = this.storedMetrics.slice(
        -this.config.maxStoredMetrics
      );
    }
    // Callback
    this.config.onMetricCollected?.(metric);
    // Console logging
    if (this.config.enableConsoleLogging) {
      console.log(`[Metric] ${metric.name}: ${metric.value}`, metric.labels);
    }
  }
  /**
   * Collect periodic metrics
   */
  collect() {
    this.recordResourceUsage();
  }
  /**
   * Calculate histogram data
   */
  calculateHistogram(values, buckets) {
    if (values.length === 0) {
      return {
        buckets: buckets.map((le) => ({ le, count: 0 })),
        sum: 0,
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 },
      };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const bucketCounts = buckets.map((le) => ({
      le,
      count: values.filter((v) => v <= le).length,
    }));
    const percentile = (p) => {
      const idx = Math.ceil(p * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    };
    return {
      buckets: bucketCounts,
      sum,
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      percentiles: {
        p50: percentile(0.5),
        p90: percentile(0.9),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
    };
  }
  /**
   * Generate performance report
   */
  generateReport() {
    const now = Date.now();
    const periodMs = now - this.lastReportTime;
    this.lastReportTime = now;
    // Aggregate inference metrics
    const successCounter = this.store.counters.get('inference_success_total');
    const errorCounter = this.store.counters.get('inference_errors_total');
    const latencyTiming = Array.from(this.store.timings.values())
      .filter((_, key) => key.toString().includes('inference_latency'))
      .flatMap((t) => t.values);
    const latencyHist = this.calculateHistogram(
      latencyTiming,
      this.config.latencyBuckets
    );
    const tokensHistograms = Array.from(this.store.histograms.values()).filter(
      (_, key) => key.toString().includes('tokens_generated')
    );
    const totalTokens = tokensHistograms.reduce(
      (sum, h) => sum + h.values.reduce((a, b) => a + b, 0),
      0
    );
    // Resource metrics
    const memoryGauge = this.store.gauges.get('memory_used_bytes');
    const allMemoryValues = this.storedMetrics
      .filter((m) => m.name === 'memory_used_bytes')
      .map((m) => m.value);
    // Network metrics
    const bytesSent =
      this.store.counters.get('network_bytes_sent_total')?.value || 0;
    const bytesReceived =
      this.store.counters.get('network_bytes_received_total')?.value || 0;
    // Cache metrics
    const cacheHits = this.store.counters.get('cache_hit_total')?.value || 0;
    const cacheMisses = this.store.counters.get('cache_miss_total')?.value || 0;
    const cacheEvictions =
      this.store.counters.get('cache_eviction_total')?.value || 0;
    // Error aggregation
    const errorsByType = {};
    for (const [key, counter] of this.store.counters) {
      if (key.includes('inference_errors_total')) {
        const errorMatch = key.match(/error=([^,}]+)/);
        if (errorMatch) {
          errorsByType[errorMatch[1]] = counter.value;
        }
      }
    }
    const totalRequests =
      (successCounter?.value || 0) + (errorCounter?.value || 0);
    const summary = {
      periodMs,
      inference: {
        totalRequests,
        successfulRequests: successCounter?.value || 0,
        failedRequests: errorCounter?.value || 0,
        avgLatencyMs: latencyHist.avg,
        p95LatencyMs: latencyHist.percentiles.p95,
        tokensGenerated: totalTokens,
        avgTokensPerSecond: totalTokens / (periodMs / 1000),
      },
      resources: {
        avgMemoryUsage:
          allMemoryValues.length > 0
            ? allMemoryValues.reduce((a, b) => a + b, 0) /
              allMemoryValues.length
            : 0,
        peakMemoryUsage:
          allMemoryValues.length > 0 ? Math.max(...allMemoryValues) : 0,
        avgCpuUsage: 0, // Would need more sophisticated tracking
        networkBytesSent: bytesSent,
        networkBytesReceived: bytesReceived,
      },
      cache: {
        hitRate:
          cacheHits + cacheMisses > 0
            ? cacheHits / (cacheHits + cacheMisses)
            : 0,
        missRate:
          cacheHits + cacheMisses > 0
            ? cacheMisses / (cacheHits + cacheMisses)
            : 0,
        evictionCount: cacheEvictions,
        cacheSize: 0, // Would need cache coordinator integration
      },
      errors: {
        totalErrors: errorCounter?.value || 0,
        errorRate:
          totalRequests > 0 ? (errorCounter?.value || 0) / totalRequests : 0,
        errorsByType,
      },
    };
    // Callback
    this.config.onReportGenerated?.(summary);
    // Send to remote endpoint
    if (this.config.reportEndpoint) {
      this.sendReport(summary);
    }
    return summary;
  }
  /**
   * Send report to remote endpoint
   */
  async sendReport(summary) {
    if (!this.config.reportEndpoint) return;
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      await fetch(this.config.reportEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          timestamp: Date.now(),
          summary,
          metrics: this.storedMetrics.slice(-100), // Send last 100 metrics
        }),
      });
    } catch (error) {
      console.warn('Failed to send metrics report:', error);
    }
  }
  /**
   * Get all stored metrics
   */
  getStoredMetrics() {
    return [...this.storedMetrics];
  }
  /**
   * Get specific counter value
   */
  getCounter(name, labels = {}) {
    const key = this.createKey(name, labels);
    return this.store.counters.get(key)?.value || 0;
  }
  /**
   * Get specific gauge value
   */
  getGauge(name, labels = {}) {
    const key = this.createKey(name, labels);
    return this.store.gauges.get(key)?.value || 0;
  }
  /**
   * Get histogram data
   */
  getHistogramData(name, labels = {}) {
    const key = this.createKey(name, labels);
    const hist = this.store.histograms.get(key);
    if (!hist) return null;
    return this.calculateHistogram(hist.values, this.config.latencyBuckets);
  }
  /**
   * Reset all metrics
   */
  reset() {
    this.store = this.createEmptyStore();
    this.storedMetrics = [];
    this.lastReportTime = Date.now();
  }
}
/**
 * Pre-configured reporter presets
 */
export const METRICS_PRESETS = {
  /** Detailed metrics for development */
  development: {
    enabled: true,
    collectionInterval: 500,
    reportInterval: 10000,
    enableConsoleLogging: true,
    maxStoredMetrics: 50000,
  },
  /** Production metrics */
  production: {
    enabled: true,
    collectionInterval: 5000,
    reportInterval: 60000,
    enableConsoleLogging: false,
    maxStoredMetrics: 10000,
  },
  /** Minimal metrics */
  minimal: {
    enabled: true,
    collectionInterval: 30000,
    reportInterval: 300000,
    enableConsoleLogging: false,
    maxStoredMetrics: 1000,
  },
  /** Disabled */
  disabled: {
    enabled: false,
  },
};
//# sourceMappingURL=metrics-reporter.js.map
