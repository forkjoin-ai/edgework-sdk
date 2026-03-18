/**
 * Gnosis Client Runtime
 *
 * Topology-first client execution helpers using Gnosis primitives:
 * PROCESS, FORK, RACE, FOLD, and VENT.
 */

export type GnosisPrimitive = 'PROCESS' | 'FORK' | 'RACE' | 'FOLD' | 'VENT';

export interface GnosisTraceEvent {
  primitive: GnosisPrimitive;
  node: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface GnosisRuntimeOptions {
  now?: () => number;
}

export interface GnosisRaceBranch<T> {
  id: string;
  run: (signal: AbortSignal) => Promise<T>;
}

export interface GnosisFoldBranch<T> {
  id: string;
  run: () => Promise<T>;
}

export interface GnosisFetchInput {
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class GnosisClientRuntime {
  private readonly trace: GnosisTraceEvent[] = [];
  private readonly now: () => number;
  private readonly topologyName: string;

  constructor(topologyName: string, options?: GnosisRuntimeOptions) {
    this.topologyName = topologyName;
    this.now = options?.now ?? (() => Date.now());
  }

  getTopologyName(): string {
    return this.topologyName;
  }

  getTrace(): readonly GnosisTraceEvent[] {
    return [...this.trace];
  }

  clearTrace(): void {
    this.trace.length = 0;
  }

  vent(node: string, metadata?: Record<string, unknown>): void {
    this.record('VENT', node, metadata);
  }

  async process<T>(node: string, run: () => Promise<T>): Promise<T> {
    this.record('PROCESS', node, { topology: this.topologyName });
    try {
      return await run();
    } catch (error) {
      this.record('VENT', `${node}:error`, {
        topology: this.topologyName,
        reason: toErrorMessage(error),
      });
      throw error;
    }
  }

  async race<T>(
    node: string,
    branches: readonly GnosisRaceBranch<T>[]
  ): Promise<{ winnerId: string; value: T }> {
    if (branches.length === 0) {
      throw new Error(
        `[${this.topologyName}] race(${node}) requires at least one branch`
      );
    }

    if (branches.length === 1) {
      const single = branches[0];
      const value = await this.process(`${node}:${single.id}`, () =>
        single.run(new AbortController().signal)
      );
      this.record('RACE', node, { winner: single.id, branchCount: 1 });
      return { winnerId: single.id, value };
    }

    this.record('FORK', node, {
      topology: this.topologyName,
      branches: branches.map((branch) => branch.id),
    });

    const controllers = branches.map(() => new AbortController());
    const failures: Array<{ id: string; error: string }> = [];

    const branchPromises = branches.map((branch, index) =>
      branch
        .run(controllers[index].signal)
        .then((value) => ({ index, value }))
        .catch((error: unknown) => {
          failures.push({ id: branch.id, error: toErrorMessage(error) });
          throw error;
        })
    );

    let winner: { index: number; value: T };
    try {
      winner = await Promise.any(branchPromises);
    } catch {
      for (const failed of failures) {
        this.record('VENT', `${node}:${failed.id}`, {
          topology: this.topologyName,
          reason: failed.error,
        });
      }
      throw new Error(
        `[${this.topologyName}] all race branches failed at ${node}`
      );
    }

    const winnerId = branches[winner.index].id;
    for (let index = 0; index < branches.length; index++) {
      if (index === winner.index) continue;
      controllers[index].abort();
      this.record('VENT', `${node}:${branches[index].id}`, {
        topology: this.topologyName,
        reason: 'lost-race',
      });
    }

    this.record('RACE', node, {
      topology: this.topologyName,
      winner: winnerId,
      branchCount: branches.length,
    });

    return { winnerId, value: winner.value };
  }

  async fold<T, TResult>(
    node: string,
    branches: readonly GnosisFoldBranch<T>[],
    reduce: (
      results: Array<{ id: string; value: T }>
    ) => Promise<TResult> | TResult
  ): Promise<TResult> {
    if (branches.length === 0) {
      throw new Error(
        `[${this.topologyName}] fold(${node}) requires at least one branch`
      );
    }

    this.record('FORK', node, {
      topology: this.topologyName,
      branches: branches.map((branch) => branch.id),
    });

    const settled = await Promise.allSettled(
      branches.map((branch) => branch.run())
    );

    const successful: Array<{ id: string; value: T }> = [];
    const failures: Array<{ id: string; reason: string }> = [];

    for (let index = 0; index < settled.length; index++) {
      const result = settled[index];
      const branchId = branches[index].id;
      if (result.status === 'fulfilled') {
        successful.push({ id: branchId, value: result.value });
      } else {
        failures.push({ id: branchId, reason: toErrorMessage(result.reason) });
      }
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        this.record('VENT', `${node}:${failure.id}`, {
          topology: this.topologyName,
          reason: failure.reason,
        });
      }
      throw new Error(
        `[${this.topologyName}] fold(${node}) failed with ${failures.length} vented branches`
      );
    }

    const reduced = await reduce(successful);
    this.record('FOLD', node, {
      topology: this.topologyName,
      branchCount: successful.length,
    });
    return reduced;
  }

  async fetchJson<T>(node: string, input: GnosisFetchInput): Promise<T> {
    return this.process(node, async () => {
      if (typeof fetch !== 'function') {
        throw new Error(
          `[${this.topologyName}] fetch is not available in this runtime`
        );
      }

      const controller = new AbortController();
      const timeoutMs = input.timeoutMs ?? 0;
      const timeout =
        timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        const mergedHeaders: Record<string, string> = {
          ...(input.headers ?? {}),
          ...((input.init?.headers as Record<string, string> | undefined) ??
            {}),
        };

        const response = await fetch(input.url, {
          ...input.init,
          headers: mergedHeaders,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `[${this.topologyName}] fetch ${response.status} ${response.statusText}: ${text}`
          );
        }

        return (await response.json()) as T;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    });
  }

  private record(
    primitive: GnosisPrimitive,
    node: string,
    metadata?: Record<string, unknown>
  ): void {
    this.trace.push({
      primitive,
      node,
      timestamp: this.now(),
      metadata,
    });
  }
}
