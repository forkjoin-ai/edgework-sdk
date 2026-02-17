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
 * Offline state
 */
export type OfflineState = 'online' | 'offline' | 'syncing' | 'partial'; // Some services available

/**
 * Queue priority
 */
export type QueuePriority = 'high' | 'typical' | 'low' | 'background';

/**
 * Queued request
 */
export interface QueuedRequest {
  /** Request ID */
  id: string;

  /** Request type */
  type: 'inference' | 'sync' | 'feedback' | 'custom';

  /** Request payload */
  payload: unknown;

  /** Priority */
  priority: QueuePriority;

  /** Created timestamp */
  createdAt: number;

  /** Number of retry attempts */
  retryCount: number;

  /** Maximum retries */
  maxRetries: number;

  /** Expiry timestamp (0 = never) */
  expiresAt: number;

  /** Whether request requires network */
  requiresNetwork: boolean;

  /** Callback URL for background sync */
  callbackUrl?: string;

  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Sync conflict
 */
export interface SyncConflict {
  /** Request ID */
  requestId: string;

  /** Local data */
  local: unknown;

  /** Remote data */
  remote: unknown;

  /** Conflict type */
  type: 'version' | 'content' | 'deleted';

  /** Resolution strategy suggestion */
  suggestedResolution: 'local' | 'remote' | 'merge' | 'manual';
}

/**
 * Offline model info
 */
export interface OfflineModel {
  /** Model ID */
  id: string;

  /** Model name */
  name: string;

  /** Model size in bytes */
  sizeBytes: number;

  /** Whether model is cached */
  cached: boolean;

  /** Cache timestamp */
  cachedAt: number;

  /** Last used timestamp */
  lastUsedAt: number;

  /** Model version */
  version: string;

  /** Whether model supports offline */
  offlineCapable: boolean;

  /** Required features */
  requiredFeatures: ('webgpu' | 'wasm' | 'simd')[];
}

/**
 * Offline storage quota
 */
export interface StorageQuota {
  /** Total quota in bytes */
  total: number;

  /** Used storage in bytes */
  used: number;

  /** Available storage in bytes */
  available: number;

  /** Persistent storage granted */
  persistent: boolean;
}

/**
 * Offline config
 */
export interface OfflineSupportConfig {
  /** Enable offline mode */
  enabled: boolean;

  /** Queue storage key */
  queueStorageKey: string;

  /** Maximum queue size */
  maxQueueSize: number;

  /** Default request expiry (ms) */
  defaultExpiry: number;

  /** Sync interval (ms) */
  syncInterval: number;

  /** Enable background sync */
  enableBackgroundSync: boolean;

  /** Service worker path */
  serviceWorkerPath?: string;

  /** Model cache name */
  modelCacheName: string;

  /** Maximum cached models */
  maxCachedModels: number;

  /** Callback on state change */
  onStateChange?: (state: OfflineState) => void;

  /** Callback on queue change */
  onQueueChange?: (queue: QueuedRequest[]) => void;

  /** Callback on sync conflict */
  onConflict?: (
    conflict: SyncConflict
  ) => Promise<'local' | 'remote' | 'merge'>;

  /** Callback on sync complete */
  onSyncComplete?: (synced: number, failed: number) => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: OfflineSupportConfig = {
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
function generateRequestId(): string {
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
  private config: OfflineSupportConfig;
  private state: OfflineState = 'online';
  private queue: QueuedRequest[] = [];
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private cachedModels: Map<string, OfflineModel> = new Map();

  constructor(config: Partial<OfflineSupportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize offline support
   */
  async initialize(): Promise<void> {
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
  async shutdown(): Promise<void> {
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
  private async registerServiceWorker(): Promise<void> {
    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(
        this.config.serviceWorkerPath!
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
  private handleServiceWorkerMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;

    const message = data as { type: string; payload?: unknown };

    switch (message.type) {
      case 'sync-complete':
        this.handleSyncComplete(
          message.payload as { synced: number; failed: number }
        );
        break;
      case 'request-result':
        this.handleRequestResult(
          message.payload as { id: string; result: unknown }
        );
        break;
    }
  }

  /**
   * Handle online event
   */
  private async handleOnline(): Promise<void> {
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
  private handleOffline(): void {
    this.state = 'offline';
    this.config.onStateChange?.(this.state);
  }

  /**
   * Queue a request for later processing
   */
  async queueRequest(
    type: QueuedRequest['type'],
    payload: unknown,
    options: Partial<
      Pick<QueuedRequest, 'priority' | 'maxRetries' | 'expiresAt' | 'metadata'>
    > = {}
  ): Promise<string> {
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

    const request: QueuedRequest = {
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
  private sortQueue(): void {
    const priorityOrder: Record<QueuePriority, number> = {
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
  async syncQueue(): Promise<{ synced: number; failed: number }> {
    if (this.state === 'offline' || this.queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    this.state = 'syncing';
    this.config.onStateChange?.(this.state);

    let synced = 0;
    let failed = 0;
    const toRemove: string[] = [];
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
  private async processQueuedRequest(request: QueuedRequest): Promise<unknown> {
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
  private handleSyncComplete(payload: {
    synced: number;
    failed: number;
  }): void {
    this.config.onSyncComplete?.(payload.synced, payload.failed);
  }

  /**
   * Handle request result from service worker
   */
  private handleRequestResult(_payload: { id: string; result: unknown }): void {
    /* noop - handle results for specific requests */
  }

  /**
   * Save queue to storage
   */
  private async saveQueue(): Promise<void> {
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
  private async loadQueue(): Promise<void> {
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
  private async loadCachedModels(): Promise<void> {
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
  private extractModelId(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1].replace(/\.[^/.]+$/, '');
  }

  /**
   * Cache a model for offline use
   */
  async cacheModel(
    modelId: string,
    modelUrl: string,
    metadata?: Partial<OfflineModel>
  ): Promise<void> {
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
  async uncacheModel(modelId: string): Promise<void> {
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
  private async evictOldModels(neededBytes: number): Promise<void> {
    const models = Array.from(this.cachedModels.values()).sort(
      (a, b) => a.lastUsedAt - b.lastUsedAt
    );

    let freedBytes = 0;
    const toEvict: string[] = [];

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
  isModelAvailableOffline(modelId: string): boolean {
    return this.cachedModels.has(modelId);
  }

  /**
   * Get cached model info
   */
  getCachedModel(modelId: string): OfflineModel | undefined {
    const model = this.cachedModels.get(modelId);
    if (model) {
      model.lastUsedAt = Date.now();
    }
    return model;
  }

  /**
   * Get all cached models
   */
  getCachedModels(): OfflineModel[] {
    return Array.from(this.cachedModels.values());
  }

  /**
   * Get storage quota
   */
  async getStorageQuota(): Promise<StorageQuota> {
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
  async requestPersistentStorage(): Promise<boolean> {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      return navigator.storage.persist();
    }
    return false;
  }

  /**
   * Get current offline state
   */
  getState(): OfflineState {
    return this.state;
  }

  /**
   * Get queued requests
   */
  getQueue(): QueuedRequest[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.config.onQueueChange?.(this.queue);
  }

  /**
   * Remove specific request from queue
   */
  async removeFromQueue(requestId: string): Promise<boolean> {
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
  async triggerBackgroundSync(): Promise<void> {
    if (!this.config.enableBackgroundSync || !this.serviceWorkerRegistration) {
      return;
    }

    try {
      const swReg = this.serviceWorkerRegistration as any;
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
  } as Partial<OfflineSupportConfig>,

  /** Light caching for mostly online apps */
  onlineFirst: {
    enabled: true,
    maxQueueSize: 50,
    defaultExpiry: 60 * 60 * 1000, // 1 hour
    syncInterval: 10000,
    enableBackgroundSync: false,
    maxCachedModels: 2,
  } as Partial<OfflineSupportConfig>,

  /** No offline support */
  disabled: {
    enabled: false,
  } as Partial<OfflineSupportConfig>,
};
