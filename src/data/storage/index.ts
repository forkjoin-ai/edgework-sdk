/**
 * Edgework Storage Layer
 *
 * Provides model weight storage using OPFS (Origin Private File System) or IndexedDB.
 * Designed for progressive model download and offline-first operation.
 */

export { OPFSStorage } from './opfs-storage';
export { IndexedDBStorage } from './indexeddb-storage';
export { MemoryStorage } from './memory-storage';
export { createStorage, detectBestBackend } from './factory';
export type { StorageOptions } from './factory';
