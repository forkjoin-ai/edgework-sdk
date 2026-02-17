/**
 * Performance optimization and caching system
 * Provides intelligent caching, memoization, and performance monitoring
 */

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: number;
  size: number; // Size in bytes
  metadata?: Record<string, any>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
  averageAccessTime: number;
}

export interface PerformanceMetrics {
  operationTimes: Map<string, number[]>;
  cacheStats: CacheStats;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
  activeConnections: number;
}

export interface CacheOptions {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  defaultTTL: number; // Default time to live in milliseconds
  evictionPolicy: 'lru' | 'lfu' | 'ttl' | 'size';
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    hitRate: 0,
    totalSize: 0,
    entryCount: 0,
    averageAccessTime: 0,
  };
  private options: CacheOptions;
  private accessTimes: number[] = [];
  private cleanupInterval: NodeJS.Timeout;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxEntries: 10000,
      defaultTTL: 3600000, // 1 hour
      evictionPolicy: 'lru',
      compressionEnabled: true,
      encryptionEnabled: false,
      ...options,
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateHitRate();
      return undefined;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    // Track access time
    const accessTime = Date.now();
    this.accessTimes.push(accessTime);
    if (this.accessTimes.length > 1000) {
      this.accessTimes.shift();
    }

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const size = this.calculateSize(value);
    const entryTTL = ttl || this.options.defaultTTL;

    // Check if we need to evict entries
    if (this.shouldEvict(size)) {
      this.evictEntries(size);
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: entryTTL,
      accessCount: 0,
      lastAccessed: Date.now(),
      size,
      metadata: {},
    };

    this.cache.set(key, entry);
    this.stats.sets++;
    this.updateCacheStats();
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      this.updateCacheStats();
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      totalSize: 0,
      entryCount: 0,
      averageAccessTime: 0,
    };
    this.accessTimes = [];
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateCacheStats();
    return { ...this.stats };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();

    return {
      operationTimes: new Map(), // Would be populated by actual operations
      cacheStats: this.getStats(),
      memoryUsage: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to percentage
      activeConnections: 0, // Would be tracked by actual connections
    };
  }

  /**
   * Memoize a function with caching
   */
  memoize<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
    keyGenerator?: (...args: TArgs) => string,
    ttl?: number
  ): (...args: TArgs) => TResult {
    return (...args: TArgs) => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

      // Check cache first
      const cached = this.get<TResult>(key);
      if (cached !== undefined) {
        return cached;
      }

      // Execute function and cache result
      const result = fn(...args);
      this.set(key, result, ttl);

      return result;
    };
  }

  /**
   * Batch get multiple keys
   */
  mget<T>(keys: string[]): Map<string, T | undefined> {
    const results = new Map<string, T | undefined>();

    for (const key of keys) {
      results.set(key, this.get<T>(key));
    }

    return results;
  }

  /**
   * Batch set multiple entries
   */
  mset<T>(entries: Map<string, T>, ttl?: number): void {
    for (const [key, value] of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Get entries by pattern
   */
  getByPattern(pattern: string | RegExp): Map<string, any> {
    const results = new Map<string, any>();
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const [key, entry] of this.cache) {
      if (regex.test(key)) {
        results.set(key, entry.value);
      }
    }

    return results;
  }

  /**
   * Delete entries by pattern
   */
  deleteByPattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let deleted = 0;

    for (const [key] of this.cache) {
      if (regex.test(key)) {
        this.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Warm up cache with predefined data
   */
  async warmUp<T>(
    entries: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<void> {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * Export cache data
   */
  export(): Array<{ key: string; value: any; ttl: number; metadata?: any }> {
    const entries = [];

    for (const [key, entry] of this.cache) {
      entries.push({
        key,
        value: entry.value,
        ttl: entry.ttl,
        metadata: entry.metadata,
      });
    }

    return entries;
  }

  /**
   * Import cache data
   */
  import(
    entries: Array<{ key: string; value: any; ttl?: number; metadata?: any }>
  ): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * Calculate size of value in bytes
   */
  private calculateSize(value: any): number {
    if (value === null || value === undefined) return 0;

    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      // Fallback for circular objects or non-serializable values
      return 100; // Estimate
    }
  }

  /**
   * Check if we should evict entries
   */
  private shouldEvict(newEntrySize: number): boolean {
    const currentSize = this.stats.totalSize;
    const currentEntries = this.stats.entryCount;

    return (
      currentSize + newEntrySize > this.options.maxSize ||
      currentEntries >= this.options.maxEntries
    );
  }

  /**
   * Evict entries based on policy
   */
  private evictEntries(requiredSize: number): void {
    const entries = Array.from(this.cache.entries());

    switch (this.options.evictionPolicy) {
      case 'lru':
        this.evictLRU(entries, requiredSize);
        break;
      case 'lfu':
        this.evictLFU(entries, requiredSize);
        break;
      case 'ttl':
        this.evictByTTL(entries, requiredSize);
        break;
      case 'size':
        this.evictBySize(entries, requiredSize);
        break;
    }
  }

  /**
   * Evict using Least Recently Used policy
   */
  private evictLRU(
    entries: [string, CacheEntry<any>][],
    requiredSize: number
  ): void {
    // Sort by last accessed time (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    let freedSize = 0;
    for (const [key, entry] of entries) {
      this.cache.delete(key);
      freedSize += entry.size;
      this.stats.evictions++;

      if (freedSize >= requiredSize) break;
    }

    this.updateCacheStats();
  }

  /**
   * Evict using Least Frequently Used policy
   */
  private evictLFU(
    entries: [string, CacheEntry<any>][],
    requiredSize: number
  ): void {
    // Sort by access count (least used first)
    entries.sort((a, b) => a[1].accessCount - b[1].accessCount);

    let freedSize = 0;
    for (const [key, entry] of entries) {
      this.cache.delete(key);
      freedSize += entry.size;
      this.stats.evictions++;

      if (freedSize >= requiredSize) break;
    }

    this.updateCacheStats();
  }

  /**
   * Evict expired entries
   */
  private evictByTTL(
    entries: [string, CacheEntry<any>][],
    requiredSize: number
  ): void {
    const now = Date.now();
    let freedSize = 0;

    for (const [key, entry] of entries) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        freedSize += entry.size;
        this.stats.evictions++;

        if (freedSize >= requiredSize) break;
      }
    }

    this.updateCacheStats();
  }

  /**
   * Evict largest entries first
   */
  private evictBySize(
    entries: [string, CacheEntry<any>][],
    requiredSize: number
  ): void {
    // Sort by size (largest first)
    entries.sort((a, b) => b[1].size - a[1].size);

    let freedSize = 0;
    for (const [key, entry] of entries) {
      this.cache.delete(key);
      freedSize += entry.size;
      this.stats.evictions++;

      if (freedSize >= requiredSize) break;
    }

    this.updateCacheStats();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      this.updateCacheStats();
    }
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(): void {
    let totalSize = 0;
    let entryCount = 0;

    for (const entry of this.cache.values()) {
      totalSize += entry.size;
      entryCount++;
    }

    this.stats.totalSize = totalSize;
    this.stats.entryCount = entryCount;

    // Calculate average access time
    if (this.accessTimes.length > 0) {
      const totalTime = this.accessTimes.reduce((sum, time) => sum + time, 0);
      this.stats.averageAccessTime = totalTime / this.accessTimes.length;
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Destroy cache manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

/**
 * Performance monitor for tracking operation performance
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private thresholds: Map<string, number> = new Map();

  /**
   * Record operation performance
   */
  record(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const times = this.metrics.get(operation)!;
    times.push(duration);

    // Keep only last 1000 measurements
    if (times.length > 1000) {
      times.shift();
    }
  }

  /**
   * Get performance statistics for operation
   */
  getStats(operation: string):
    | {
        count: number;
        average: number;
        min: number;
        max: number;
        median: number;
        p95: number;
        p99: number;
      }
    | undefined {
    const times = this.metrics.get(operation);
    if (!times || times.length === 0) return undefined;

    const sorted = [...times].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      average: sorted.reduce((sum, time) => sum + time, 0) / count,
      min: sorted[0],
      max: sorted[count - 1],
      median: sorted[Math.floor(count / 2)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Get all performance statistics
   */
  getAllStats(): Map<string, ReturnType<typeof this.getStats>> {
    const stats = new Map();

    for (const operation of this.metrics.keys()) {
      const opStats = this.getStats(operation);
      if (opStats) {
        stats.set(operation, opStats);
      }
    }

    return stats;
  }

  /**
   * Set performance threshold
   */
  setThreshold(operation: string, threshold: number): void {
    this.thresholds.set(operation, threshold);
  }

  /**
   * Check if operation exceeds threshold
   */
  exceedsThreshold(operation: string, duration: number): boolean {
    const threshold = this.thresholds.get(operation);
    return threshold !== undefined ? duration > threshold : false;
  }

  /**
   * Get slow operations (above 95th percentile)
   */
  getSlowOperations(): Array<{
    operation: string;
    threshold: number;
    p95: number;
    exceedanceRate: number;
  }> {
    const slowOps: Array<{
      operation: string;
      threshold: number;
      p95: number;
      exceedanceRate: number;
    }> = [];

    for (const [operation, threshold] of this.thresholds) {
      const stats = this.getStats(operation);
      if (stats && stats.p95 > threshold) {
        const times = this.metrics.get(operation) ?? [];
        const exceedanceRate =
          times.filter((time) => time > threshold).length / stats.count;
        slowOps.push({
          operation,
          threshold,
          p95: stats.p95,
          exceedanceRate,
        });
      }
    }

    return slowOps.sort((a, b) => b.exceedanceRate - a.exceedanceRate);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.thresholds.clear();
  }
}

/**
 * Performance decorator for memoizing functions
 */
export function performanceOptimized<T extends (...args: any[]) => any>(
  cacheManager: CacheManager,
  options: {
    ttl?: number;
    keyGenerator?: (...args: Parameters<T>) => string;
    trackPerformance?: boolean;
  } = {}
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const monitor = new PerformanceMonitor();

    descriptor.value = cacheManager.memoize(
      async (...args: Parameters<T>) => {
        const startTime = Date.now();

        const result = await originalMethod.apply(target, args);

        if (options.trackPerformance) {
          const duration = Date.now() - startTime;
          monitor.record(propertyKey, duration);
        }

        return result;
      },
      options.keyGenerator,
      options.ttl
    );

    return descriptor;
  };
}

/**
 * Global cache instance
 */
export const globalCache = new CacheManager({
  maxSize: 50 * 1024 * 1024, // 50MB
  maxEntries: 5000,
  defaultTTL: 1800000, // 30 minutes
  evictionPolicy: 'lru',
});

/**
 * Global performance monitor
 */
export const globalMonitor = new PerformanceMonitor();
