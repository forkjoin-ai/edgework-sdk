/**
 * useAgentStream Hook
 *
 * React hook for streaming agent events with real-time updates.
 */

import { useState, useCallback, useRef } from 'react';
import type { EADKAgent, RunConfig, RunEvent, RunResult } from '../core/types';

export interface UseAgentStreamOptions {
  /** Agent to use */
  agent: EADKAgent;
  /** Default run config */
  config?: RunConfig;
  /** Callback for each event */
  onEvent?: (event: RunEvent) => void;
  /** Callback when stream completes */
  onComplete?: (result: RunResult | null) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseAgentStreamReturn {
  /** Start streaming */
  stream: (input: string, config?: RunConfig) => Promise<void>;
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Accumulated text output */
  text: string;
  /** All events received */
  events: RunEvent[];
  /** Final result (when stream completes) */
  result: RunResult | null;
  /** Error if any */
  error: Error | null;
  /** Abort the stream */
  abort: () => void;
  /** Reset state */
  reset: () => void;
}

export function useAgentStream(
  options: UseAgentStreamOptions
): UseAgentStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [text, setText] = useState('');
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    async (input: string, config?: RunConfig): Promise<void> => {
      setIsStreaming(true);
      setError(null);
      setText('');
      setEvents([]);
      setResult(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const mergedConfig: RunConfig = {
          ...options.config,
          ...config,
          streaming: true,
          abortSignal: controller.signal,
        };

        let finalResult: RunResult | null = null;

        for await (const event of options.agent.stream(input, mergedConfig)) {
          if (controller.signal.aborted) break;

          setEvents((prev) => [...prev, event]);
          options.onEvent?.(event);

          // Accumulate text from LLM chunks
          if (event.data.type === 'llm_chunk') {
            const chunk = event.data as {
              type: 'llm_chunk';
              text: string;
              tokenIndex: number;
            };
            setText((prev) => prev + chunk.text);
          }

          // Capture final result
          if (event.data.type === 'agent_end') {
            const endData = event.data as {
              type: 'agent_end';
              result: RunResult;
            };
            finalResult = endData.result;
          }
        }

        setResult(finalResult);
        options.onComplete?.(finalResult);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const streamError =
            err instanceof Error ? err : new Error(String(err));
          setError(streamError);
          options.onError?.(streamError);
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [options]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setText('');
    setEvents([]);
    setResult(null);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { stream, isStreaming, text, events, result, error, abort, reset };
}
