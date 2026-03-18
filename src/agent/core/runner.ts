/**
 * EADK Runner
 *
 * Static entry point for executing agents with run/stream/runLive methods.
 * Provides a clean API for starting agent execution.
 */

import type {
  EADKAgent,
  RunConfig,
  RunResult,
  RunEvent,
  LiveSession,
} from './types';
import { GnosisClientRuntime } from './gnosis-runtime';

/**
 * Runner provides static methods for executing agents.
 * This is the primary API for running agents.
 *
 * @example
 * ```ts
 * const result = await Runner.run(myAgent, "Hello, world!");
 * console.log(result.output);
 *
 * for await (const event of Runner.stream(myAgent, "Tell me a joke")) {
 *   console.log(event.type, event.data);
 * }
 * ```
 */
export class Runner {
  private static readonly runtime = new GnosisClientRuntime('eadk-runner');

  /**
   * Run an agent to completion and return the result.
   */
  static async run(
    agent: EADKAgent,
    input: string,
    config?: RunConfig
  ): Promise<RunResult> {
    return this.runtime.process('runner:run', () => agent.run(input, config));
  }

  /**
   * Stream events from an agent as they occur.
   */
  static async *stream(
    agent: EADKAgent,
    input: string,
    config?: RunConfig
  ): AsyncIterable<RunEvent> {
    yield* agent.stream(input, { ...config, streaming: true });
  }

  /**
   * Start a live bidirectional session with an agent.
   * Supports real-time message exchange and optional audio streaming.
   */
  static runLive(agent: EADKAgent, config?: RunConfig): LiveSession {
    const abortController = new AbortController();
    const messageQueue: string[] = [];
    const eventQueue: RunEvent[] = [];
    let resolveNext: ((value: IteratorResult<RunEvent>) => void) | null = null;
    let closed = false;

    // Process messages in the queue
    const processQueue = async () => {
      while (!closed) {
        if (messageQueue.length === 0) {
          // Wait for new messages
          await new Promise<void>((resolve) => {
            const check = () => {
              if (messageQueue.length > 0 || closed) {
                resolve();
              } else {
                setTimeout(check, 50);
              }
            };
            check();
          });
          continue;
        }

        const message = messageQueue.shift()!;
        await Runner.runtime.process('runner:live-message', async () => {
          for await (const event of agent.stream(message, {
            ...config,
            streaming: true,
            abortSignal: abortController.signal,
          })) {
            if (resolveNext) {
              resolveNext({ value: event, done: false });
              resolveNext = null;
            } else {
              eventQueue.push(event);
            }
          }
        });
      }
    };

    // Start processing
    processQueue().catch(() => {
      closed = true;
    });

    const events: AsyncIterable<RunEvent> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<RunEvent>> {
            if (closed && eventQueue.length === 0) {
              return { value: undefined as unknown as RunEvent, done: true };
            }

            if (eventQueue.length > 0) {
              return { value: eventQueue.shift()!, done: false };
            }

            return new Promise<IteratorResult<RunEvent>>((resolve) => {
              resolveNext = resolve;
            });
          },
        };
      },
    };

    return {
      send(message: string) {
        if (closed) throw new Error('Session is closed');
        messageQueue.push(message);
      },
      events,
      close() {
        closed = true;
        abortController.abort();
      },
      get isActive() {
        return !closed;
      },
    };
  }
}
