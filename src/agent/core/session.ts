/**
 * EADK Session
 *
 * Session state management with scoped key-value storage.
 * Implements Google ADK's state scoping pattern (app/user/session/temp).
 */

import type { MemoryScope, SessionConfig, SessionState } from './types';

const SCOPE_PREFIX: Record<MemoryScope, string> = {
  temp: 'temp:',
  session: 'session:',
  user: 'user:',
  app: 'app:',
};

/**
 * In-memory session state with scope-based key namespacing.
 */
export class Session implements SessionState {
  readonly id: string;
  private state: Map<string, unknown>;
  private createdAt: number;
  private readonly timeoutMs?: number;

  constructor(config?: SessionConfig) {
    this.id = config?.id ?? crypto.randomUUID();
    this.state = new Map();
    this.createdAt = Date.now();
    this.timeoutMs = config?.timeoutMs;

    // Initialize with provided state
    if (config?.initialState) {
      for (const [key, value] of Object.entries(config.initialState)) {
        this.state.set(`${SCOPE_PREFIX.session}${key}`, value);
      }
    }
  }

  private scopedKey(key: string, scope: MemoryScope = 'session'): string {
    return `${SCOPE_PREFIX[scope]}${key}`;
  }

  get(key: string, scope: MemoryScope = 'session'): unknown {
    if (this.isExpired()) return undefined;
    return this.state.get(this.scopedKey(key, scope));
  }

  set(key: string, value: unknown, scope: MemoryScope = 'session'): void {
    this.state.set(this.scopedKey(key, scope), value);
  }

  delete(key: string, scope: MemoryScope = 'session'): void {
    this.state.delete(this.scopedKey(key, scope));
  }

  getAll(scope: MemoryScope = 'session'): Record<string, unknown> {
    const prefix = SCOPE_PREFIX[scope];
    const result: Record<string, unknown> = {};

    for (const [key, value] of this.state) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }

    return result;
  }

  clear(scope?: MemoryScope): void {
    if (scope) {
      const prefix = SCOPE_PREFIX[scope];
      for (const key of [...this.state.keys()]) {
        if (key.startsWith(prefix)) {
          this.state.delete(key);
        }
      }
    } else {
      this.state.clear();
    }
  }

  /**
   * Check if session has expired.
   */
  isExpired(): boolean {
    if (!this.timeoutMs) return false;
    return Date.now() - this.createdAt > this.timeoutMs;
  }

  /**
   * Create a snapshot of the current state for checkpointing.
   */
  snapshot(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of this.state) {
      data[key] = value;
    }
    return data;
  }

  /**
   * Restore state from a checkpoint snapshot.
   */
  restore(snapshot: Record<string, unknown>): void {
    this.state.clear();
    for (const [key, value] of Object.entries(snapshot)) {
      this.state.set(key, value);
    }
  }

  /**
   * Fork the session (creates a copy for exploring different paths).
   */
  fork(newId?: string): Session {
    const forked = new Session({
      id: newId ?? crypto.randomUUID(),
      timeoutMs: this.timeoutMs,
    });
    for (const [key, value] of this.state) {
      forked.state.set(key, value);
    }
    return forked;
  }
}
