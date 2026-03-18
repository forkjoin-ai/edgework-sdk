/**
 * Cache Coordinator
 *
 * Coordinates caching across multiple layers:
 * - Cross-tab KV cache sharing
 * - Cache invalidation
 * - Distributed cache synchronization
 * - Cache statistics and monitoring
 */
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  enableCrossTab: true,
  broadcastChannelName: 'edgework_cache_sync',
  maxMemoryCacheSize: 100 * 1024 * 1024, // 100MB
  maxMemoryEntries: 1000,
  defaultTTL: 300000, // 5 minutes
  enablePersistent: true,
  persistentCacheName: 'edgework_cache_v1',
  syncInterval: 5000,
};
/**
 * Generate cache key
 */
function generateKey(prefix, ...parts) {
  return `${prefix}:${parts.join(':')}`;
}
/**
 * Calculate approximate size of value
 */
function calculateSize(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 4;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return JSON.stringify(value).length * 2;
}
/**
 * Memory cache layer
 */
class MemoryCache {
  constructor(maxSize, maxEntries) {
    this.cache = new Map();
    this.currentSize = 0;
    this.maxSize = maxSize;
    this.maxEntries = maxEntries;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    // Check expiration
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.delete(key);
      return null;
    }
    entry.hitCount++;
    return entry;
  }
  set(key, value, options = {}) {
    // Remove existing
    if (this.cache.has(key)) {
      this.delete(key);
    }
    const sizeBytes = calculateSize(value);
    // Evict if necessary
    while (
      (this.currentSize + sizeBytes > this.maxSize ||
        this.cache.size >= this.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }
    const entry = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: options.ttl ? Date.now() + options.ttl : 0,
      sizeBytes,
      hitCount: 0,
      version: options.version || 1,
      tags: options.tags || [],
      layer: 'memory',
    };
    this.cache.set(key, entry);
    this.currentSize += sizeBytes;
    return entry;
  }
  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.sizeBytes;
      this.cache.delete(key);
      return true;
    }
    return false;
  }
  evictLRU() {
    // Find entry with lowest hit count
    let lruKey = null;
    let lruHits = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.hitCount < lruHits) {
        lruHits = entry.hitCount;
        lruKey = key;
      }
    }
    if (lruKey) {
      this.delete(lruKey);
    }
  }
  invalidateByTag(tag) {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }
  clear() {
    this.cache.clear();
    this.currentSize = 0;
  }
  getStats() {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSize,
    };
  }
  entries() {
    return this.cache.entries();
  }
}
/**
 * Cache Coordinator
 *
 * Coordinates caching across memory, persistent storage, and tabs.
 */
export class CacheCoordinator {
  constructor(config = {}) {
    this.broadcastChannel = null;
    this.syncInterval = null;
    this.kvCache = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryCache = new MemoryCache(
      this.config.maxMemoryCacheSize,
      this.config.maxMemoryEntries
    );
    this.stats = this.createEmptyStats();
  }
  /**
   * Create empty stats
   */
  createEmptyStats() {
    return {
      totalEntries: 0,
      totalSizeBytes: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      layerStats: {
        memory: { entries: 0, sizeBytes: 0 },
        indexeddb: { entries: 0, sizeBytes: 0 },
        opfs: { entries: 0, sizeBytes: 0 },
        broadcast: { entries: 0, sizeBytes: 0 },
        edge: { entries: 0, sizeBytes: 0 },
      },
      evictions: 0,
      avgAgeMs: 0,
    };
  }
  /**
   * Initialize the coordinator
   */
  async initialize() {
    // Set up broadcast channel for cross-tab communication
    if (this.config.enableCrossTab && 'BroadcastChannel' in globalThis) {
      this.broadcastChannel = new BroadcastChannel(
        this.config.broadcastChannelName
      );
      this.broadcastChannel.onmessage = (event) =>
        this.handleBroadcastMessage(event.data);
    }
    // Start sync interval
    if (this.config.syncInterval > 0) {
      this.syncInterval = setInterval(
        () => this.syncStats(),
        this.config.syncInterval
      );
    }
  }
  /**
   * Shutdown the coordinator
   */
  async shutdown() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }
  /**
   * Get a cached value
   */
  async get(key, options = {}) {
    const layers = options.layers || ['memory', 'indexeddb'];
    for (const layer of layers) {
      const entry = await this.getFromLayer(key, layer);
      if (entry) {
        this.stats.hits++;
        this.emitEvent({ type: 'hit', key, layer, timestamp: Date.now() });
        return entry.value;
      }
    }
    this.stats.misses++;
    this.emitEvent({
      type: 'miss',
      key,
      layer: 'memory',
      timestamp: Date.now(),
    });
    return null;
  }
  /**
   * Get from specific layer
   */
  async getFromLayer(key, layer) {
    switch (layer) {
      case 'memory':
        return this.memoryCache.get(key);
      case 'indexeddb':
        return this.getFromIndexedDB(key);
      case 'opfs':
        return this.getFromOPFS(key);
      default:
        return null;
    }
  }
  /**
   * Get from IndexedDB
   */
  async getFromIndexedDB(key) {
    if (!this.config.enablePersistent) return null;
    try {
      const db = await this.openDB();
      const tx = db.transaction('cache', 'readonly');
      const store = tx.objectStore('cache');
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const entry = request.result;
          if (
            entry &&
            (entry.expiresAt === 0 || entry.expiresAt > Date.now())
          ) {
            resolve(entry);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }
  /**
   * Get from OPFS
   */
  async getFromOPFS(key) {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
      return null;
    }
    try {
      const root = await navigator.storage.getDirectory();
      const cacheDir = await root.getDirectoryHandle('cache', { create: true });
      const fileHandle = await cacheDir.getFileHandle(`${key}.json`);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  /**
   * Set a cached value
   */
  async set(key, value, options = {}) {
    const layers = options.layers || ['memory'];
    const ttl = options.ttl || this.config.defaultTTL;
    for (const layer of layers) {
      await this.setInLayer(key, value, { ...options, ttl }, layer);
    }
    this.emitEvent({
      type: 'set',
      key,
      layer: layers[0],
      timestamp: Date.now(),
    });
    // Broadcast to other tabs
    if (options.broadcast !== false && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'cache_set',
        key,
        value,
        options: { ttl, tags: options.tags },
      });
    }
  }
  /**
   * Set in specific layer
   */
  async setInLayer(key, value, options, layer) {
    switch (layer) {
      case 'memory':
        this.memoryCache.set(key, value, options);
        break;
      case 'indexeddb':
        await this.setInIndexedDB(key, value, options);
        break;
      case 'opfs':
        await this.setInOPFS(key, value, options);
        break;
    }
  }
  /**
   * Set in IndexedDB
   */
  async setInIndexedDB(key, value, options) {
    if (!this.config.enablePersistent) return;
    const entry = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: options.ttl ? Date.now() + options.ttl : 0,
      sizeBytes: calculateSize(value),
      hitCount: 0,
      version: 1,
      tags: options.tags || [],
      layer: 'indexeddb',
    };
    const db = await this.openDB();
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Set in OPFS
   */
  async setInOPFS(key, value, options) {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
      return;
    }
    const entry = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: options.ttl ? Date.now() + options.ttl : 0,
      sizeBytes: calculateSize(value),
      hitCount: 0,
      version: 1,
      tags: options.tags || [],
      layer: 'opfs',
    };
    const root = await navigator.storage.getDirectory();
    const cacheDir = await root.getDirectoryHandle('cache', { create: true });
    const fileHandle = await cacheDir.getFileHandle(`${key}.json`, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(entry));
    await writable.close();
  }
  /**
   * Open IndexedDB
   */
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.persistentCacheName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('kv_cache')) {
          db.createObjectStore('kv_cache', { keyPath: 'promptHash' });
        }
      };
    });
  }
  /**
   * Invalidate a cached value
   */
  async invalidate(key, options = {}) {
    const layers = options.layers || ['memory', 'indexeddb', 'opfs'];
    for (const layer of layers) {
      await this.invalidateInLayer(key, layer);
    }
    this.emitEvent({
      type: 'invalidate',
      key,
      layer: layers[0],
      timestamp: Date.now(),
      reason: options.reason || 'manual',
    });
    // Broadcast to other tabs
    if (options.broadcast !== false && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'cache_invalidate',
        key,
        reason: options.reason || 'manual',
      });
    }
  }
  /**
   * Invalidate in specific layer
   */
  async invalidateInLayer(key, layer) {
    switch (layer) {
      case 'memory':
        this.memoryCache.delete(key);
        break;
      case 'indexeddb':
        await this.deleteFromIndexedDB(key);
        break;
      case 'opfs':
        await this.deleteFromOPFS(key);
        break;
    }
  }
  /**
   * Delete from IndexedDB
   */
  async deleteFromIndexedDB(key) {
    if (!this.config.enablePersistent) return;
    const db = await this.openDB();
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Delete from OPFS
   */
  async deleteFromOPFS(key) {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
      return;
    }
    try {
      const root = await navigator.storage.getDirectory();
      const cacheDir = await root.getDirectoryHandle('cache');
      await cacheDir.removeEntry(`${key}.json`);
    } catch {
      // File doesn't exist
    }
  }
  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag, options = {}) {
    let count = 0;
    // Memory cache
    count += this.memoryCache.invalidateByTag(tag);
    // Broadcast to other tabs
    if (options.broadcast !== false && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'cache_invalidate_tag',
        tag,
      });
    }
    return count;
  }
  /**
   * Store KV cache for LLM inference
   */
  async storeKVCache(entry) {
    const key = generateKey('kv', entry.modelId, entry.promptHash);
    this.kvCache.set(key, entry);
    // Also persist to IndexedDB
    if (this.config.enablePersistent) {
      try {
        const db = await this.openDB();
        const tx = db.transaction('kv_cache', 'readwrite');
        const store = tx.objectStore('kv_cache');
        await new Promise((resolve, reject) => {
          const request = store.put(entry);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch {
        // Silently fail for persistence
      }
    }
  }
  /**
   * Get KV cache for LLM inference
   */
  async getKVCache(modelId, promptHash) {
    const key = generateKey('kv', modelId, promptHash);
    // Check memory first
    const memEntry = this.kvCache.get(key);
    if (memEntry) {
      return memEntry;
    }
    // Check IndexedDB
    if (this.config.enablePersistent) {
      try {
        const db = await this.openDB();
        const tx = db.transaction('kv_cache', 'readonly');
        const store = tx.objectStore('kv_cache');
        return new Promise((resolve, reject) => {
          const request = store.get(promptHash);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      } catch {
        return null;
      }
    }
    return null;
  }
  /**
   * Handle broadcast message
   */
  handleBroadcastMessage(data) {
    switch (data.type) {
      case 'cache_set':
        if (data.key && data.value !== undefined) {
          this.memoryCache.set(data.key, data.value, data.options);
        }
        break;
      case 'cache_invalidate':
        if (data.key) {
          this.memoryCache.delete(data.key);
        }
        break;
      case 'cache_invalidate_tag':
        if (data.tag) {
          this.memoryCache.invalidateByTag(data.tag);
        }
        break;
    }
    this.emitEvent({
      type: 'sync',
      key: data.key || '',
      layer: 'broadcast',
      timestamp: Date.now(),
      reason: data.reason,
    });
  }
  /**
   * Emit cache event
   */
  emitEvent(event) {
    this.config.onCacheEvent?.(event);
  }
  /**
   * Sync stats
   */
  syncStats() {
    const memStats = this.memoryCache.getStats();
    this.stats.layerStats.memory = memStats;
    this.stats.totalEntries = memStats.entries;
    this.stats.totalSizeBytes = memStats.sizeBytes;
    this.stats.hitRate =
      this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0;
    this.config.onStatsUpdate?.(this.stats);
  }
  /**
   * Get cache statistics
   */
  getStats() {
    this.syncStats();
    return { ...this.stats };
  }
  /**
   * Clear all caches
   */
  async clear() {
    this.memoryCache.clear();
    this.kvCache.clear();
    if (this.config.enablePersistent) {
      try {
        const db = await this.openDB();
        const tx1 = db.transaction('cache', 'readwrite');
        tx1.objectStore('cache').clear();
        const tx2 = db.transaction('kv_cache', 'readwrite');
        tx2.objectStore('kv_cache').clear();
      } catch {
        // Silently fail
      }
    }
    // Broadcast clear
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'cache_clear' });
    }
  }
}
/**
 * Pre-configured coordinator presets
 */
export const CACHE_PRESETS = {
  /** High performance with large memory cache */
  performance: {
    maxMemoryCacheSize: 500 * 1024 * 1024, // 500MB
    maxMemoryEntries: 5000,
    defaultTTL: 600000, // 10 minutes
    enableCrossTab: true,
    syncInterval: 2000,
  },
  /** Memory efficient */
  lowMemory: {
    maxMemoryCacheSize: 50 * 1024 * 1024, // 50MB
    maxMemoryEntries: 500,
    defaultTTL: 60000, // 1 minute
    enableCrossTab: false,
    syncInterval: 10000,
  },
  /** Balanced */
  balanced: {
    maxMemoryCacheSize: 100 * 1024 * 1024, // 100MB
    maxMemoryEntries: 1000,
    defaultTTL: 300000, // 5 minutes
    enableCrossTab: true,
    syncInterval: 5000,
  },
};
//# sourceMappingURL=cache-coordinator.js.map
