/**
 * Embedding Cache
 *
 * Manages caching of computed embeddings with optional persistence.
 * Supports LRU eviction and TTL-based expiration.
 */

import type { EmbeddingResult } from './embedding-model';

/**
 * Cache entry
 */
interface CacheEntry {
  vector: number[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Embedding cache configuration
 */
export interface EmbeddingCacheConfig {
  /** Maximum cache size in number of embeddings */
  maxSize?: number;

  /** TTL in milliseconds (0 = no expiration) */
  ttlMs?: number;

  /** Enable persistence to localStorage/indexedDB */
  enablePersistence?: boolean;

  /** Persistence key prefix */
  persistencePrefix?: string;
}

/**
 * Simple LRU cache for embeddings
 */
export class EmbeddingCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private enablePersistence: boolean;
  private persistencePrefix: string;

  constructor(config: EmbeddingCacheConfig = {}) {
    this.maxSize = config.maxSize ?? 1000;
    this.ttlMs = config.ttlMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
    this.enablePersistence = config.enablePersistence ?? false;
    this.persistencePrefix = config.persistencePrefix ?? 'embedding_cache_';
  }

  /**
   * Generate cache key from text
   */
  private key(text: string, model?: string): string {
    const modelPart = model ? `_${model}` : '';
    // Simple hash: use multiple character codes to reduce collisions
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 20); i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${this.persistencePrefix}${text.length}_${Math.abs(
      hash
    )}${modelPart}`;
  }

  /**
   * Get embedding from cache
   */
  get(text: string, model?: string): number[] | null {
    const k = this.key(text, model);
    const entry = this.cache.get(k);

    if (!entry) {
      // Try to load from persistence
      if (this.enablePersistence) {
        try {
          const stored = localStorage?.getItem(k);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.timestamp <= this.ttlMs) {
              this.cache.set(k, parsed);
              return parsed.vector;
            } else {
              localStorage?.removeItem(k);
            }
          }
        } catch {
          // Persistence load failed, continue
        }
      }
      return null;
    }

    // Check TTL
    if (this.ttlMs > 0 && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(k);
      if (this.enablePersistence) {
        localStorage?.removeItem(k);
      }
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(k);
    this.cache.set(k, entry);

    return entry.vector;
  }

  /**
   * Set embedding in cache
   */
  set(
    text: string,
    vector: number[],
    model?: string,
    metadata?: Record<string, unknown>
  ): void {
    const k = this.key(text, model);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest);
        if (this.enablePersistence) {
          localStorage?.removeItem(oldest);
        }
      }
    }

    const entry: CacheEntry = {
      vector,
      timestamp: Date.now(),
      metadata,
    };

    this.cache.set(k, entry);

    // Persist if enabled
    if (this.enablePersistence) {
      try {
        localStorage?.setItem(k, JSON.stringify(entry));
      } catch {
        // Persistence failed, continue with memory cache
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    utilizationPercent: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: (this.cache.size / this.maxSize) * 100,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    if (this.enablePersistence) {
      // Clear all persistence entries
      if (typeof localStorage !== 'undefined') {
        const keysToDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(this.persistencePrefix)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach((k) => localStorage.removeItem(k));
      }
    }
  }

  /**
   * Preload embeddings from results
   */
  preloadFromResults(results: EmbeddingResult[], model?: string): void {
    for (const result of results) {
      this.set(result.text, result.vector, model);
    }
  }

  /**
   * Batch get with fallback texts
   */
  batchGet(texts: string[], model?: string): Map<string, number[]> {
    const result = new Map<string, number[]>();
    for (const text of texts) {
      const vector = this.get(text, model);
      if (vector) {
        result.set(text, vector);
      }
    }
    return result;
  }
}
