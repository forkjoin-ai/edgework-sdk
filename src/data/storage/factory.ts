/**
 * Storage Factory
 *
 * Creates appropriate storage backend based on environment capabilities.
 */

import { OPFSStorage } from './opfs-storage';
import { IndexedDBStorage } from './indexeddb-storage';
import { MemoryStorage } from './memory-storage';
import { BaseStorage } from './base-storage';
import type { StorageBackend } from '../../types';

export interface StorageOptions {
  /** Preferred storage backend */
  backend?: StorageBackend;
  /** Force the specified backend even if not optimal */
  force?: boolean;
}

/**
 * Detect the best available storage backend
 */
export function detectBestBackend(): StorageBackend {
  // Check if we're in a browser
  if (typeof window === 'undefined') {
    return 'memory';
  }

  // Check for OPFS support (best for large binary data)
  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    return 'opfs';
  }

  // Check for IndexedDB support
  if ('indexedDB' in window) {
    return 'indexeddb';
  }

  // Fall back to memory
  return 'memory';
}

/**
 * Check if a storage backend is available
 */
export function isBackendAvailable(backend: StorageBackend): boolean {
  if (typeof window === 'undefined') {
    return backend === 'memory';
  }

  switch (backend) {
    case 'opfs':
      return 'storage' in navigator && 'getDirectory' in navigator.storage;
    case 'indexeddb':
      return 'indexedDB' in window;
    case 'memory':
      return true;
    default:
      return false;
  }
}

/**
 * Create a storage instance
 */
export async function createStorage(
  options: StorageOptions = {}
): Promise<BaseStorage> {
  const { backend, force = false } = options;

  // Determine which backend to use
  let selectedBackend: StorageBackend;
  if (backend && (force || isBackendAvailable(backend))) {
    selectedBackend = backend;
  } else {
    selectedBackend = detectBestBackend();
  }

  // Create and initialize the storage
  let storage: BaseStorage;
  switch (selectedBackend) {
    case 'opfs':
      storage = new OPFSStorage() as unknown as BaseStorage;
      break;
    case 'indexeddb':
      storage = new IndexedDBStorage();
      break;
    case 'memory':
    default:
      storage = new MemoryStorage();
      break;
  }

  await storage.initialize();
  return storage;
}

/**
 * Get storage capabilities info
 */
export function getStorageCapabilities(): {
  opfs: boolean;
  indexeddb: boolean;
  memory: boolean;
  recommended: StorageBackend;
} {
  return {
    opfs: isBackendAvailable('opfs'),
    indexeddb: isBackendAvailable('indexeddb'),
    memory: true,
    recommended: detectBestBackend(),
  };
}
