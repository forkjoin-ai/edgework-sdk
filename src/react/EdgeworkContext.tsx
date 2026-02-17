/**
 * EdgeworkContext - React context for Edgework SDK
 *
 * Provides SDK instance and state management for React applications.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { Edgework } from '../index';
import type { GenerateResult, ChatMessage, DownloadProgress } from '../types';

export interface EdgeworkContextValue {
  /** SDK instance (null until initialized) */
  sdk: Edgework | null;
  /** Whether the SDK is initialized */
  isInitialized: boolean;
  /** Whether the model is ready for inference */
  isReady: boolean;
  /** Whether currently generating */
  isGenerating: boolean;
  /** Download progress during model loading */
  downloadProgress: DownloadProgress | null;
  /** Current error if any */
  error: Error | null;
  /** Initialize the SDK */
  initialize: () => Promise<void>;
  /** Generate text */
  generate: (prompt: string) => Promise<GenerateResult | null>;
  /** Chat with messages */
  chat: (messages: ChatMessage[]) => Promise<GenerateResult | null>;
  /** Submit feedback for RLHF */
  submitFeedback: (
    messageHash: string,
    rating: 'positive' | 'negative'
  ) => Promise<void>;
}

const EdgeworkContext = createContext<EdgeworkContextValue | null>(null);

export interface EdgeworkProviderProps {
  /** Model to use */
  model: string;
  /** Children components */
  children: React.ReactNode;
  /** Auto-initialize on mount */
  autoInit?: boolean;
  /** Storage backend preference */
  storageBackend?: 'opfs' | 'indexeddb' | 'memory';
  /** Enable RLHF */
  enableRLHF?: boolean;
  /** User ID for personalization */
  userId?: string;
}

/**
 * Provider component for Edgework SDK
 */
export function EdgeworkProvider({
  model,
  children,
  autoInit = false,
  storageBackend = 'opfs',
  enableRLHF = true,
  userId,
}: EdgeworkProviderProps): React.ReactElement {
  const [sdk, setSdk] = useState<Edgework | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Initialize SDK
  const initialize = useCallback(async () => {
    if (isInitialized || sdk) return;

    try {
      setError(null);

      // Dynamic import to avoid SSR issues
      const { Edgework } = await import('../index');

      const instance = await Edgework.init({
        model,
        storageBackend,
        enableRLHF,
        userId,
        onProgress: (progress) => {
          setDownloadProgress(progress);
        },
      });

      setSdk(instance);
      setIsInitialized(true);
      setIsReady(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error('[EdgeworkContext] Initialization failed:', error);
    }
  }, [model, storageBackend, enableRLHF, userId, isInitialized, sdk]);

  // Auto-initialize
  useEffect(() => {
    if (autoInit && !isInitialized && !sdk) {
      initialize();
    }
  }, [autoInit, isInitialized, sdk, initialize]);

  // Generate text
  const generate = useCallback(
    async (prompt: string): Promise<GenerateResult | null> => {
      if (!sdk || !isReady) {
        console.warn('[EdgeworkContext] SDK not ready');
        return null;
      }

      try {
        setIsGenerating(true);
        setError(null);
        const result = await sdk.generate(prompt);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error('[EdgeworkContext] Generate failed:', error);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [sdk, isReady]
  );

  // Chat with messages
  const chat = useCallback(
    async (messages: ChatMessage[]): Promise<GenerateResult | null> => {
      if (!sdk || !isReady) {
        console.warn('[EdgeworkContext] SDK not ready');
        return null;
      }

      try {
        setIsGenerating(true);
        setError(null);
        const result = await sdk.chat(messages);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error('[EdgeworkContext] Chat failed:', error);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [sdk, isReady]
  );

  // Submit feedback
  const submitFeedback = useCallback(
    async (
      messageHash: string,
      rating: 'positive' | 'negative'
    ): Promise<void> => {
      if (!sdk) {
        console.warn('[EdgeworkContext] SDK not initialized');
        return;
      }

      try {
        await sdk.feedback(messageHash, rating);
      } catch (err) {
        console.error('[EdgeworkContext] Feedback failed:', err);
      }
    },
    [sdk]
  );

  // Memoized context value
  const value = useMemo<EdgeworkContextValue>(
    () => ({
      sdk,
      isInitialized,
      isReady,
      isGenerating,
      downloadProgress,
      error,
      initialize,
      generate,
      chat,
      submitFeedback,
    }),
    [
      sdk,
      isInitialized,
      isReady,
      isGenerating,
      downloadProgress,
      error,
      initialize,
      generate,
      chat,
      submitFeedback,
    ]
  );

  return (
    <EdgeworkContext.Provider value={value}>
      {children}
    </EdgeworkContext.Provider>
  );
}

/**
 * Hook to use Edgework SDK in components
 */
export function useEdgework(): EdgeworkContextValue {
  const context = useContext(EdgeworkContext);
  if (!context) {
    throw new Error('useEdgework must be used within an EdgeworkProvider');
  }
  return context;
}
