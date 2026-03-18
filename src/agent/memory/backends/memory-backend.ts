/**
 * In-Memory Backend
 *
 * Simple in-memory storage. Fast but non-persistent.
 * Suitable for testing and short-lived sessions.
 */

import type {
  MemoryScope,
  MemoryEntry,
  MemorySearchResult,
} from '../../core/types';
import type { MemoryBackendInterface } from '../memory-service';

export class InMemoryBackend implements MemoryBackendInterface {
  private store = new Map<string, MemoryEntry>();

  private key(entryKey: string, scope: MemoryScope): string {
    return `${scope}:${entryKey}`;
  }

  async save(entry: MemoryEntry): Promise<void> {
    const existing = this.store.get(this.key(entry.key, entry.scope));
    if (existing) {
      entry.createdAt = existing.createdAt;
    }
    this.store.set(this.key(entry.key, entry.scope), entry);
  }

  async get(key: string, scope: MemoryScope): Promise<MemoryEntry | null> {
    return this.store.get(this.key(key, scope)) ?? null;
  }

  async delete(key: string, scope: MemoryScope): Promise<void> {
    this.store.delete(this.key(key, scope));
  }

  async list(scope: MemoryScope): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const prefix = `${scope}:`;
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) {
        results.push(entry);
      }
    }
    return results;
  }

  async search(
    query: string,
    scope: MemoryScope,
    limit = 10
  ): Promise<MemorySearchResult[]> {
    // Simple substring matching for in-memory backend
    const queryLower = query.toLowerCase();
    const results: MemorySearchResult[] = [];
    const prefix = `${scope}:`;

    for (const [key, entry] of this.store) {
      if (!key.startsWith(prefix)) continue;

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
      const prefix = `${scope}:`;
      for (const key of [...this.store.keys()]) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.clear();
    }
  }
}
