/**
 * IndexedDB Storage Implementation
 *
 * Fallback storage for browsers without OPFS support.
 * Uses IndexedDB with structured stores for model data.
 */

import { BaseStorage } from './base-storage';
import type {
  ModelMeta,
  TensorChunk,
  TokenizerData,
  SyncProgress,
  UserAdapter,
  TrainingLogEntry,
  StorageBackend,
} from '../../types';

const DB_NAME = 'edgework-models';
const DB_VERSION = 1;

export class IndexedDBStorage extends BaseStorage {
  readonly backend: StorageBackend = 'indexeddb';
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB storage
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Models store
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'id' });
        }

        // Tensor chunks store
        if (!db.objectStoreNames.contains('tensorChunks')) {
          const store = db.createObjectStore('tensorChunks', { keyPath: 'id' });
          store.createIndex('modelId', 'modelId', { unique: false });
          store.createIndex('layerIndex', ['modelId', 'layerIndex'], {
            unique: false,
          });
          store.createIndex('tensorName', ['modelId', 'tensorName'], {
            unique: false,
          });
        }

        // Tokenizers store
        if (!db.objectStoreNames.contains('tokenizers')) {
          db.createObjectStore('tokenizers', { keyPath: 'modelId' });
        }

        // Sync progress store
        if (!db.objectStoreNames.contains('syncProgress')) {
          const store = db.createObjectStore('syncProgress', {
            keyPath: ['modelId', 'tensorName'],
          });
          store.createIndex('modelId', 'modelId', { unique: false });
        }

        // User adapters store
        if (!db.objectStoreNames.contains('userAdapters')) {
          const store = db.createObjectStore('userAdapters', { keyPath: 'id' });
          store.createIndex('modelUser', ['modelId', 'userId'], {
            unique: false,
          });
        }

        // Training log store
        if (!db.objectStoreNames.contains('trainingLog')) {
          const store = db.createObjectStore('trainingLog', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('adapterId', 'adapterId', { unique: false });
        }
      };
    });
  }

  private getStore(
    name: string,
    mode: IDBTransactionMode = 'readonly'
  ): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(name, mode).objectStore(name);
  }

  private promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Model metadata
  async getModelMeta(modelId: string): Promise<ModelMeta | null> {
    const store = this.getStore('models');
    return (await this.promisify(store.get(modelId))) || null;
  }

  async setModelMeta(meta: ModelMeta): Promise<void> {
    const store = this.getStore('models', 'readwrite');
    await this.promisify(store.put(meta));
  }

  async deleteModelMeta(modelId: string): Promise<void> {
    const store = this.getStore('models', 'readwrite');
    await this.promisify(store.delete(modelId));
  }

  async listModels(): Promise<ModelMeta[]> {
    const store = this.getStore('models');
    return this.promisify(store.getAll());
  }

  // Tensor chunks
  async getTensorChunks(
    modelId: string,
    layerIndex: number
  ): Promise<TensorChunk[]> {
    const store = this.getStore('tensorChunks');
    const index = store.index('layerIndex');
    return this.promisify(index.getAll([modelId, layerIndex]));
  }

  async getTensorChunk(
    modelId: string,
    tensorName: string,
    chunkIndex: number
  ): Promise<TensorChunk | null> {
    const id = `${modelId}:${tensorName}:${chunkIndex}`;
    const store = this.getStore('tensorChunks');
    return (await this.promisify(store.get(id))) || null;
  }

  async storeTensorChunk(chunk: TensorChunk): Promise<void> {
    const store = this.getStore('tensorChunks', 'readwrite');
    await this.promisify(store.put(chunk));
  }

  async deleteTensorChunks(modelId: string): Promise<void> {
    const store = this.getStore('tensorChunks', 'readwrite');
    const index = store.index('modelId');
    const keys = await this.promisify(index.getAllKeys(modelId));
    for (const key of keys) {
      await this.promisify(store.delete(key));
    }
  }

  // Tokenizer
  async getTokenizer(modelId: string): Promise<TokenizerData | null> {
    const store = this.getStore('tokenizers');
    return (await this.promisify(store.get(modelId))) || null;
  }

  async setTokenizer(data: TokenizerData): Promise<void> {
    const store = this.getStore('tokenizers', 'readwrite');
    await this.promisify(store.put(data));
  }

  // Sync progress
  async getSyncProgress(modelId: string): Promise<SyncProgress[]> {
    const store = this.getStore('syncProgress');
    const index = store.index('modelId');
    return this.promisify(index.getAll(modelId));
  }

  async updateSyncProgress(progress: SyncProgress): Promise<void> {
    const store = this.getStore('syncProgress', 'readwrite');
    await this.promisify(store.put(progress));
  }

  async clearSyncProgress(modelId: string): Promise<void> {
    const store = this.getStore('syncProgress', 'readwrite');
    const index = store.index('modelId');
    const keys = await this.promisify(index.getAllKeys(modelId));
    for (const key of keys) {
      await this.promisify(store.delete(key));
    }
  }

  // User adapters
  async getUserAdapter(
    modelId: string,
    userId: string,
    adapterId?: string
  ): Promise<UserAdapter | null> {
    const store = this.getStore('userAdapters');
    const index = store.index('modelUser');
    const results = await this.promisify(index.getAll([modelId, userId]));
    if (!adapterId) {
      return results[0] || null;
    }
    return (
      (results.find((result) => result.id === adapterId) as UserAdapter) || null
    );
  }

  async setUserAdapter(adapter: UserAdapter): Promise<void> {
    const store = this.getStore('userAdapters', 'readwrite');
    await this.promisify(store.put(adapter));
  }

  async deleteUserAdapter(adapterId: string): Promise<void> {
    const store = this.getStore('userAdapters', 'readwrite');
    await this.promisify(store.delete(adapterId));
  }

  // Training log
  async addTrainingLogEntry(
    entry: Omit<TrainingLogEntry, 'id'>
  ): Promise<number> {
    const store = this.getStore('trainingLog', 'readwrite');
    return this.promisify(store.add(entry)) as Promise<number>;
  }

  async getTrainingLog(
    adapterId: string,
    limit = 100
  ): Promise<TrainingLogEntry[]> {
    const store = this.getStore('trainingLog');
    const index = store.index('adapterId');
    const results = await this.promisify(index.getAll(adapterId));
    return results.slice(-limit);
  }

  // Utility
  async isModelComplete(modelId: string): Promise<boolean> {
    const progress = await this.getSyncProgress(modelId);
    if (progress.length === 0) return false;
    return progress.every((p) => p.chunksDownloaded >= p.totalChunks);
  }

  async getStorageUsed(): Promise<number> {
    if (!navigator.storage?.estimate) return 0;
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }

  async clear(): Promise<void> {
    const stores = [
      'models',
      'tensorChunks',
      'tokenizers',
      'syncProgress',
      'userAdapters',
      'trainingLog',
    ];
    for (const name of stores) {
      const store = this.getStore(name, 'readwrite');
      await this.promisify(store.clear());
    }
  }
}
