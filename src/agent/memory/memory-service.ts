/**
 * EADK Memory Service
 *
 * Pluggable memory system with scoped storage, semantic search, and entity tracking.
 * Combines Google ADK state scoping, CrewAI entity memory, and LangGraph checkpointing.
 */

import type {
  MemoryScope,
  MemoryEntry,
  MemorySearchResult,
  MemoryConfig,
  MemoryBackend,
} from '../core/types';

/**
 * Abstract memory backend interface.
 * Implementations handle actual storage (memory, OPFS, IndexedDB, etc.).
 */
export interface MemoryBackendInterface {
  save(entry: MemoryEntry): Promise<void>;
  get(key: string, scope: MemoryScope): Promise<MemoryEntry | null>;
  delete(key: string, scope: MemoryScope): Promise<void>;
  list(scope: MemoryScope): Promise<MemoryEntry[]>;
  search(
    query: string,
    scope: MemoryScope,
    limit?: number
  ): Promise<MemorySearchResult[]>;
  clear(scope?: MemoryScope): Promise<void>;
}

/**
 * MemoryService provides a unified API over pluggable backends.
 */
export class MemoryService {
  private backend: MemoryBackendInterface;
  private config: MemoryConfig;

  constructor(backend: MemoryBackendInterface, config: MemoryConfig) {
    this.backend = backend;
    this.config = config;
  }

  /**
   * Save a value to memory.
   */
  async save(
    key: string,
    value: unknown,
    scope: MemoryScope = 'session',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const entry: MemoryEntry = {
      key,
      value,
      scope,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.backend.save(entry);
  }

  /**
   * Get a value from memory.
   */
  async get(key: string, scope: MemoryScope = 'session'): Promise<unknown> {
    const entry = await this.backend.get(key, scope);
    if (!entry) return undefined;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await this.backend.delete(key, scope);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Semantic search over memory entries.
   */
  async search(
    query: string,
    scope: MemoryScope = 'session',
    limit = 10
  ): Promise<MemorySearchResult[]> {
    if (!this.config.longTerm && !this.config.shortTerm) {
      return [];
    }
    return this.backend.search(query, scope, limit);
  }

  /**
   * Delete a memory entry.
   */
  async delete(key: string, scope: MemoryScope = 'session'): Promise<void> {
    await this.backend.delete(key, scope);
  }

  /**
   * List all entries in a scope.
   */
  async list(scope: MemoryScope = 'session'): Promise<MemoryEntry[]> {
    return this.backend.list(scope);
  }

  /**
   * Clear memory.
   */
  async clear(scope?: MemoryScope): Promise<void> {
    await this.backend.clear(scope);
  }

  /**
   * Save an entity (CrewAI pattern).
   */
  async saveEntity(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.entity) return;
    await this.save(`entity:${entityType}:${entityId}`, data, 'app', {
      entityType,
      entityId,
    });
  }

  /**
   * Get an entity.
   */
  async getEntity(
    entityType: string,
    entityId: string
  ): Promise<Record<string, unknown> | undefined> {
    if (!this.config.entity) return undefined;
    const value = await this.get(`entity:${entityType}:${entityId}`, 'app');
    return value as Record<string, unknown> | undefined;
  }

  /**
   * Save a short-term working memory entry (auto-expires).
   */
  async saveWorkingMemory(
    key: string,
    value: unknown,
    ttlMs = 300_000
  ): Promise<void> {
    if (!this.config.shortTerm) return;
    const entry: MemoryEntry = {
      key,
      value,
      scope: 'temp',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    await this.backend.save(entry);
  }
}
