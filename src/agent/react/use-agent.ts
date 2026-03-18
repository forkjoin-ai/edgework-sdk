/**
 * useAgent Hook
 *
 * React hook for running agents with state management.
 */

import { useState, useCallback, useRef } from 'react';
import type { EADKAgent, RunConfig, RunResult, RunEvent } from '../core/types';

export interface UseAgentOptions {
  /** Agent to use */
  agent: EADKAgent;
  /** Default run config */
  config?: RunConfig;
  /** Callback when run completes */
  onComplete?: (result: RunResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseAgentReturn {
  /** Run the agent with input */
  run: (input: string, config?: RunConfig) => Promise<RunResult>;
  /** Whether the agent is currently running */
  isRunning: boolean;
  /** Last result */
  result: RunResult | null;
  /** Last error */
  error: Error | null;
  /** Abort the current run */
  abort: () => void;
  /** Reset state */
  reset: () => void;
}

export function useAgent(options: UseAgentOptions): UseAgentReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (input: string, config?: RunConfig): Promise<RunResult> => {
      setIsRunning(true);
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const mergedConfig: RunConfig = {
          ...options.config,
          ...config,
          abortSignal: controller.signal,
        };

        const runResult = await options.agent.run(input, mergedConfig);
        setResult(runResult);
        options.onComplete?.(runResult);
        return runResult;
      } catch (err) {
        const runError = err instanceof Error ? err : new Error(String(err));
        setError(runError);
        options.onError?.(runError);
        throw runError;
      } finally {
        setIsRunning(false);
        abortControllerRef.current = null;
      }
    },
    [options]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsRunning(false);
  }, []);

  return { run, isRunning, result, error, abort, reset };
}
