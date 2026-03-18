/**
 * EADK Memory — Public API
 */

import { MemoryService } from './memory-service';
import type { MemoryBackendInterface } from './memory-service';
import { InMemoryBackend } from './backends/memory-backend';
import { IndexedDBBackend } from './backends/indexeddb-backend';
import type { MemoryConfig } from '../core/types';

export { MemoryService } from './memory-service';
export type { MemoryBackendInterface } from './memory-service';

export { InMemoryBackend } from './backends/memory-backend';
export { IndexedDBBackend } from './backends/indexeddb-backend';

// Re-export memory types from core
export type {
  MemoryScope,
  MemoryBackend,
  MemoryConfig,
  MemoryEntry,
  MemorySearchResult,
} from '../core/types';

/**
 * Create a memory service with the appropriate backend.
 */
export function createMemoryService(config: MemoryConfig): MemoryService {
  let backend: MemoryBackendInterface;

  switch (config.backend) {
    case 'indexeddb':
      backend = new IndexedDBBackend();
      break;
    case 'opfs':
      // OPFS backend would leverage existing edgework OPFS storage
      // Falls back to in-memory for now
      backend = new InMemoryBackend();
      break;
    case 'memory':
    default:
      backend = new InMemoryBackend();
      break;
  }

  return new MemoryService(backend, config);
}
