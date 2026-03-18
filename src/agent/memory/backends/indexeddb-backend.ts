/**
 * IndexedDB Memory Backend
 *
 * Persistent browser-based storage using IndexedDB.
 * Integrates with existing edgework-sdk storage patterns.
 */

import type {
  MemoryScope,
  MemoryEntry,
  MemorySearchResult,
} from '../../core/types';
import type { MemoryBackendInterface } from '../memory-service';

const DB_NAME = 'eadk-memory';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

export class IndexedDBBackend implements MemoryBackendInterface {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'compositeKey',
          });
          store.createIndex('scope', 'scope', { unique: false });
          store.createIndex('key', 'key', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  private compositeKey(key: string, scope: MemoryScope): string {
    return `${scope}:${key}`;
  }

  async save(entry: MemoryEntry): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        ...entry,
        compositeKey: this.compositeKey(entry.key, entry.scope),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(key: string, scope: MemoryScope): Promise<MemoryEntry | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(this.compositeKey(key, scope));
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        // Remove compositeKey from result
        const { compositeKey: _, ...entry } = result;
        resolve(entry as MemoryEntry);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string, scope: MemoryScope): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(this.compositeKey(key, scope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async list(scope: MemoryScope): Promise<MemoryEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('scope');
      const request = index.getAll(scope);
      request.onsuccess = () => {
        const results = (request.result ?? []).map(
          (raw: Record<string, unknown>) => {
            const { compositeKey: _, ...entry } = raw;
            return entry as unknown as MemoryEntry;
          }
        );
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async search(
    query: string,
    scope: MemoryScope,
    limit = 10
  ): Promise<MemorySearchResult[]> {
    // IndexedDB doesn't support full-text search natively
    // Fall back to listing and filtering
    const entries = await this.list(scope);
    const queryLower = query.toLowerCase();
    const results: MemorySearchResult[] = [];

    for (const entry of entries) {
      const valueStr = JSON.stringify(entry.value).toLowerCase();
      const keyStr = entry.key.toLowerCase();

      let score = 0;
      if (keyStr.includes(queryLower)) score += 0.8;
      if (valueStr.includes(queryLower)) score += 0.5;

      if (score > 0) {
        results.push({ entry, score: Math.min(score, 1) });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async clear(scope?: MemoryScope): Promise<void> {
    if (scope) {
      const entries = await this.list(scope);
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const entry of entries) {
          store.delete(this.compositeKey(entry.key, entry.scope));
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
