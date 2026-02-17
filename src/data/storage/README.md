# Edgework Storage

Storage abstractions for model weights and cache management.

## Purpose

Provides a unified storage interface over different browser/environment backends to efficiently store large model files (weights).

## Backends

- **OPFSStorage** (`opfs-storage.ts`): Uses Origin Private File System (highly recommended for performance).
- **IndexedDBStorage** (`indexeddb-storage.ts`): Fallback using IndexedDB.
- **MemoryStorage** (`memory-storage.ts`): Transient storage for testing or non-persistent sessions.

## Factory

`factory.ts` enables auto-detection of the best available storage backend (e.g. usage of OPFS if available).

Last Updated: 2026-01-31