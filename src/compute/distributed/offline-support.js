/**
 * Offline Support Module
 *
 * Provides offline-first inference capabilities:
 * - Service Worker integration
 * - Request queuing
 * - Background sync
 * - Offline model management
 * - Conflict resolution
 */
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  enabled: true,
  queueStorageKey: 'edgework_offline_queue',
  maxQueueSize: 100,
  defaultExpiry: 24 * 60 * 60 * 1000, // 24 hours
  syncInterval: 30000, // 30 seconds
  enableBackgroundSync: true,
  modelCacheName: 'edgework_models_v1',
  maxCachedModels: 5,
};
/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
/**
 * Offline Support
 *
 * Provides offline-first capabilities for edge inference.
 */
export class OfflineSupport {
  constructor(config = {}) {
    this.state = 'online';
    this.queue = [];
    this.syncInterval = null;
    this.serviceWorkerRegistration = null;
    this.cachedModels = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Initialize offline support
   */
  async initialize() {
    if (!this.config.enabled) return;
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    // Set initial state
    this.state = navigator.onLine ? 'online' : 'offline';
    // Load queue from storage
    await this.loadQueue();
    // Register service worker
    if (this.config.serviceWorkerPath && 'serviceWorker' in navigator) {
      await this.registerServiceWorker();
    }
    // Start sync interval
    if (this.config.syncInterval > 0) {
      this.syncInterval = setInterval(
        () => this.syncQueue(),
        this.config.syncInterval
      );
    }
    // Initial sync if online
    if (this.state === 'online' && this.queue.length > 0) {
      await this.syncQueue();
    }
    // Load cached models info
    await this.loadCachedModels();
  }
  /**
   * Shutdown offline support
   */
  async shutdown() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    window.removeEventListener('online', () => this.handleOnline());
    window.removeEventListener('offline', () => this.handleOffline());
    await this.saveQueue();
  }
  /**
   * Register service worker
   */
  async registerServiceWorker() {
    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(
        this.config.serviceWorkerPath
      );
      // Set up message channel
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data);
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  }
  /**
   * Handle service worker message
   */
  handleServiceWorkerMessage(data) {
    if (typeof data !== 'object' || data === null) return;
    const message = data;
    switch (message.type) {
      case 'sync-complete':
        this.handleSyncComplete(message.payload);
        break;
      case 'request-result':
        this.handleRequestResult(message.payload);
        break;
    }
  }
  /**
   * Handle online event
   */
  async handleOnline() {
    const previousState = this.state;
    this.state = 'online';
    this.config.onStateChange?.(this.state);
    if (previousState === 'offline' && this.queue.length > 0) {
      await this.syncQueue();
    }
  }
  /**
   * Handle offline event
   */
  handleOffline() {
    this.state = 'offline';
    this.config.onStateChange?.(this.state);
  }
  /**
   * Queue a request for later processing
   */
  async queueRequest(type, payload, options = {}) {
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove oldest low-priority request
      const lowPriorityIndex = this.queue.findIndex(
        (r) => r.priority === 'low' || r.priority === 'background'
      );
      if (lowPriorityIndex >= 0) {
        this.queue.splice(lowPriorityIndex, 1);
      } else {
        throw new Error('Queue is full');
      }
    }
    const request = {
      id: generateRequestId(),
      type,
      payload,
      priority: options.priority || 'typical',
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      expiresAt: options.expiresAt ?? Date.now() + this.config.defaultExpiry,
      requiresNetwork: type !== 'inference',
      metadata: options.metadata || {},
    };
    this.queue.push(request);
    this.sortQueue();
    await this.saveQueue();
    this.config.onQueueChange?.(this.queue);
    // Try to sync immediately if online
    if (this.state === 'online' && request.priority === 'high') {
      await this.syncQueue();
    }
    return request.id;
  }
  /**
   * Sort queue by priority
   */
  sortQueue() {
    const priorityOrder = {
      high: 0,
      typical: 1,
      low: 2,
      background: 3,
    };
    this.queue.sort((a, b) => {
      const priorityDiff =
        priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt;
    });
  }
  /**
   * Sync queue with server
   */
  async syncQueue() {
    if (this.state === 'offline' || this.queue.length === 0) {
      return { synced: 0, failed: 0 };
    }
    this.state = 'syncing';
    this.config.onStateChange?.(this.state);
    let synced = 0;
    let failed = 0;
    const toRemove = [];
    const now = Date.now();
    for (const request of this.queue) {
      // Check expiry
      if (request.expiresAt > 0 && request.expiresAt < now) {
        toRemove.push(request.id);
        failed++;
        continue;
      }
      // Check retry limit
      if (request.retryCount >= request.maxRetries) {
        toRemove.push(request.id);
        failed++;
        continue;
      }
      try {
        await this.processQueuedRequest(request);
        toRemove.push(request.id);
        synced++;
      } catch (error) {
        request.retryCount++;
        failed++;
        // If we're offline, stop trying
        if (!navigator.onLine) {
          break;
        }
      }
    }
    // Remove processed requests
    this.queue = this.queue.filter((r) => !toRemove.includes(r.id));
    await this.saveQueue();
    this.state = navigator.onLine ? 'online' : 'offline';
    this.config.onStateChange?.(this.state);
    this.config.onQueueChange?.(this.queue);
    this.config.onSyncComplete?.(synced, failed);
    return { synced, failed };
  }
  /**
   * Process a queued request
   */
  async processQueuedRequest(request) {
    if (!request.callbackUrl) {
      // No callback URL, just discard
      return null;
    }
    const response = await fetch(request.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.payload),
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }
  /**
   * Handle sync complete from service worker
   */
  handleSyncComplete(payload) {
    this.config.onSyncComplete?.(payload.synced, payload.failed);
  }
  /**
   * Handle request result from service worker
   */
  handleRequestResult(_payload) {
    /* noop - handle results for specific requests */
  }
  /**
   * Save queue to storage
   */
  async saveQueue() {
    try {
      localStorage.setItem(
        this.config.queueStorageKey,
        JSON.stringify(this.queue)
      );
    } catch (error) {
      console.warn('Failed to save offline queue:', error);
    }
  }
  /**
   * Load queue from storage
   */
  async loadQueue() {
    try {
      const stored = localStorage.getItem(this.config.queueStorageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        this.sortQueue();
      }
    } catch (error) {
      console.warn('Failed to load offline queue:', error);
      this.queue = [];
    }
  }
  /**
   * Load cached models info
   */
  async loadCachedModels() {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(this.config.modelCacheName);
      const keys = await cache.keys();
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const modelId = this.extractModelId(request.url);
          const metadata = response.headers.get('X-Model-Metadata');
          this.cachedModels.set(modelId, {
            id: modelId,
            name: modelId,
            sizeBytes: parseInt(response.headers.get('Content-Length') || '0'),
            cached: true,
            cachedAt: new Date(response.headers.get('Date') || 0).getTime(),
            lastUsedAt: Date.now(),
            version: response.headers.get('X-Model-Version') || '1.0.0',
            offlineCapable: true,
            requiredFeatures: metadata
              ? JSON.parse(metadata).features
              : ['wasm'],
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load cached models:', error);
    }
  }
  /**
   * Extract model ID from URL
   */
  extractModelId(url) {
    const parts = url.split('/');
    return parts[parts.length - 1].replace(/\.[^/.]+$/, '');
  }
  /**
   * Cache a model for offline use
   */
  async cacheModel(modelId, modelUrl, metadata) {
    if (!('caches' in window)) {
      throw new Error('Cache API not available');
    }
    // Check quota
    const quota = await this.getStorageQuota();
    if (quota.available < (metadata?.sizeBytes || 0)) {
      // Try to free up space
      await this.evictOldModels(metadata?.sizeBytes || 0);
    }
    const cache = await caches.open(this.config.modelCacheName);
    // Fetch and cache the model
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.status}`);
    }
    // Add metadata headers
    const headers = new Headers(response.headers);
    headers.set('X-Model-Version', metadata?.version || '1.0.0');
    headers.set(
      'X-Model-Metadata',
      JSON.stringify({
        features: metadata?.requiredFeatures || ['wasm'],
      })
    );
    const modifiedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(modelUrl, modifiedResponse);
    // Update cached models map
    this.cachedModels.set(modelId, {
      id: modelId,
      name: metadata?.name || modelId,
      sizeBytes: parseInt(response.headers.get('Content-Length') || '0'),
      cached: true,
      cachedAt: Date.now(),
      lastUsedAt: Date.now(),
      version: metadata?.version || '1.0.0',
      offlineCapable: true,
      requiredFeatures: metadata?.requiredFeatures || ['wasm'],
    });
  }
  /**
   * Remove a cached model
   */
  async uncacheModel(modelId) {
    if (!('caches' in window)) return;
    const cache = await caches.open(this.config.modelCacheName);
    const keys = await cache.keys();
    for (const request of keys) {
      if (this.extractModelId(request.url) === modelId) {
        await cache.delete(request);
        break;
      }
    }
    this.cachedModels.delete(modelId);
  }
  /**
   * Evict old models to free up space
   */
  async evictOldModels(neededBytes) {
    const models = Array.from(this.cachedModels.values()).sort(
      (a, b) => a.lastUsedAt - b.lastUsedAt
    );
    let freedBytes = 0;
    const toEvict = [];
    for (const model of models) {
      if (freedBytes >= neededBytes) break;
      toEvict.push(model.id);
      freedBytes += model.sizeBytes;
    }
    for (const modelId of toEvict) {
      await this.uncacheModel(modelId);
    }
  }
  /**
   * Check if model is available offline
   */
  isModelAvailableOffline(modelId) {
    return this.cachedModels.has(modelId);
  }
  /**
   * Get cached model info
   */
  getCachedModel(modelId) {
    const model = this.cachedModels.get(modelId);
    if (model) {
      model.lastUsedAt = Date.now();
    }
    return model;
  }
  /**
   * Get all cached models
   */
  getCachedModels() {
    return Array.from(this.cachedModels.values());
  }
  /**
   * Get storage quota
   */
  async getStorageQuota() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const persistent = (await navigator.storage.persisted?.()) || false;
      return {
        total: estimate.quota || 0,
        used: estimate.usage || 0,
        available: (estimate.quota || 0) - (estimate.usage || 0),
        persistent,
      };
    }
    // Fallback estimate
    return {
      total: 50 * 1024 * 1024, // 50MB
      used: 0,
      available: 50 * 1024 * 1024,
      persistent: false,
    };
  }
  /**
   * Request persistent storage
   */
  async requestPersistentStorage() {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      return navigator.storage.persist();
    }
    return false;
  }
  /**
   * Get current offline state
   */
  getState() {
    return this.state;
  }
  /**
   * Get queued requests
   */
  getQueue() {
    return [...this.queue];
  }
  /**
   * Get queue size
   */
  getQueueSize() {
    return this.queue.length;
  }
  /**
   * Clear queue
   */
  async clearQueue() {
    this.queue = [];
    await this.saveQueue();
    this.config.onQueueChange?.(this.queue);
  }
  /**
   * Remove specific request from queue
   */
  async removeFromQueue(requestId) {
    const index = this.queue.findIndex((r) => r.id === requestId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      await this.saveQueue();
      this.config.onQueueChange?.(this.queue);
      return true;
    }
    return false;
  }
  /**
   * Trigger background sync
   */
  async triggerBackgroundSync() {
    if (!this.config.enableBackgroundSync || !this.serviceWorkerRegistration) {
      return;
    }
    try {
      const swReg = this.serviceWorkerRegistration;
      await swReg.sync?.register('edgework-sync');
    } catch (error) {
      console.warn('Background sync registration failed:', error);
      // Fall back to immediate sync
      await this.syncQueue();
    }
  }
}
/**
 * Pre-configured offline support presets
 */
export const OFFLINE_PRESETS = {
  /** Aggressive caching for fully offline apps */
  offlineFirst: {
    enabled: true,
    maxQueueSize: 500,
    defaultExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
    syncInterval: 60000,
    enableBackgroundSync: true,
    maxCachedModels: 10,
  },
  /** Light caching for mostly online apps */
  onlineFirst: {
    enabled: true,
    maxQueueSize: 50,
    defaultExpiry: 60 * 60 * 1000, // 1 hour
    syncInterval: 10000,
    enableBackgroundSync: false,
    maxCachedModels: 2,
  },
  /** No offline support */
  disabled: {
    enabled: false,
  },
};
//# sourceMappingURL=offline-support.js.map
