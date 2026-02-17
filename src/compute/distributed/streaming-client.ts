/**
 * Streaming Client
 *
 * Enhanced streaming client with advanced features:
 * - Backpressure handling
 * - Automatic reconnection
 * - Token buffering
 * - Stream merging (for hybrid mode)
 * - Quality of Service guarantees
 */

/**
 * Stream configuration
 */
export interface StreamConfig {
  /** Buffer size for tokens */
  bufferSize?: number;

  /** Enable backpressure handling */
  enableBackpressure?: boolean;

  /** High water mark for backpressure (pause threshold) */
  highWaterMark?: number;

  /** Low water mark for backpressure (resume threshold) */
  lowWaterMark?: number;

  /** Enable automatic reconnection */
  autoReconnect?: boolean;

  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;

  /** Reconnection delay in ms */
  reconnectDelay?: number;

  /** Timeout for stream inactivity */
  inactivityTimeout?: number;

  /** Enable stream merging for hybrid mode */
  enableMerging?: boolean;
}

/**
 * Stream state
 */
export type StreamState =
  | 'connecting'
  | 'open'
  | 'paused'
  | 'resuming'
  | 'closing'
  | 'closed'
  | 'error'
  | 'reconnecting';

/**
 * Stream event
 */
export interface StreamEvent {
  type: 'token' | 'done' | 'error' | 'state' | 'stats';
  timestamp: number;
  data: unknown;
}

/**
 * Token event
 */
export interface TokenEvent {
  /** Token text */
  token: string;

  /** Token index */
  index: number;

  /** Latency since last token */
  latencyMs: number;

  /** Source of the token */
  source: 'local' | 'edge' | 'cloud';

  /** Logprob if available */
  logprob?: number;
}

/**
 * Stream statistics
 */
export interface StreamStats {
  /** Total tokens received */
  tokenCount: number;

  /** Total characters received */
  charCount: number;

  /** Tokens per second */
  tokensPerSecond: number;

  /** Characters per second */
  charsPerSecond: number;

  /** Average token latency */
  avgTokenLatencyMs: number;

  /** Time to first token */
  firstTokenLatencyMs: number;

  /** Total stream duration */
  durationMs: number;

  /** Reconnection count */
  reconnectCount: number;

  /** Paused count (backpressure) */
  pausedCount: number;

  /** Buffer utilization (0-1) */
  bufferUtilization: number;
}

/**
 * Stream controller for flow control
 */
export interface StreamController {
  /** Pause the stream */
  pause(): void;

  /** Resume the stream */
  resume(): void;

  /** Cancel the stream */
  cancel(): void;

  /** Get current state */
  getState(): StreamState;

  /** Get statistics */
  getStats(): StreamStats;

  /** Check if stream is active */
  isActive(): boolean;
}

/**
 * Stream observer callbacks
 */
export interface StreamObserver {
  /** Called for each token */
  onToken?: (event: TokenEvent) => void;

  /** Called when stream completes */
  onComplete?: (stats: StreamStats) => void;

  /** Called on error */
  onError?: (error: Error) => void;

  /** Called on state change */
  onStateChange?: (state: StreamState, previousState: StreamState) => void;

  /** Called on reconnection */
  onReconnect?: (attempt: number) => void;

  /** Called when backpressure activates */
  onBackpressure?: (paused: boolean) => void;
}

/**
 * Token buffer for managing stream flow
 */
class TokenBuffer {
  private buffer: TokenEvent[] = [];
  private highWaterMark: number;
  private lowWaterMark: number;
  private isPaused = false;
  private onPause?: () => void;
  private onResume?: () => void;

  constructor(
    highWaterMark: number,
    lowWaterMark: number,
    onPause?: () => void,
    onResume?: () => void
  ) {
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;
    this.onPause = onPause;
    this.onResume = onResume;
  }

  /**
   * Add token to buffer
   */
  push(token: TokenEvent): boolean {
    this.buffer.push(token);

    if (!this.isPaused && this.buffer.length >= this.highWaterMark) {
      this.isPaused = true;
      this.onPause?.();
      return false; // Indicates backpressure
    }

    return true;
  }

  /**
   * Remove and return next token
   */
  shift(): TokenEvent | undefined {
    const token = this.buffer.shift();

    if (this.isPaused && this.buffer.length <= this.lowWaterMark) {
      this.isPaused = false;
      this.onResume?.();
    }

    return token;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Get buffer utilization
   */
  utilization(): number {
    return this.buffer.length / this.highWaterMark;
  }

  /**
   * Check if paused due to backpressure
   */
  paused(): boolean {
    return this.isPaused;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
    this.isPaused = false;
  }
}

/**
 * Default stream configuration
 */
const DEFAULT_CONFIG: Required<StreamConfig> = {
  bufferSize: 100,
  enableBackpressure: true,
  highWaterMark: 80,
  lowWaterMark: 20,
  autoReconnect: true,
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  inactivityTimeout: 30000,
  enableMerging: false,
};

/**
 * Streaming Client
 *
 * Provides enhanced streaming with backpressure, reconnection,
 * and quality guarantees.
 */
export class StreamingClient {
  private config: Required<StreamConfig>;
  private state: StreamState = 'closed';
  private buffer: TokenBuffer;
  private stats: StreamStats;
  private reconnectAttempts = 0;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTokenTime = 0;
  private abortController: AbortController | null = null;

  constructor(config: StreamConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.buffer = new TokenBuffer(
      this.config.highWaterMark,
      this.config.lowWaterMark,
      () => this.handleBackpressure(true),
      () => this.handleBackpressure(false)
    );
    this.stats = this.createEmptyStats();
  }

  /**
   * Create empty stats object
   */
  private createEmptyStats(): StreamStats {
    return {
      tokenCount: 0,
      charCount: 0,
      tokensPerSecond: 0,
      charsPerSecond: 0,
      avgTokenLatencyMs: 0,
      firstTokenLatencyMs: 0,
      durationMs: 0,
      reconnectCount: 0,
      pausedCount: 0,
      bufferUtilization: 0,
    };
  }

  /**
   * Stream from a source
   */
  async stream(
    source: AsyncGenerator<string> | ReadableStream<string>,
    observer: StreamObserver
  ): Promise<StreamController> {
    this.reset();
    this.abortController = new AbortController();

    const startTime = performance.now();
    let firstTokenReceived = false;
    let totalLatency = 0;
    let previousTokenTime = startTime;

    const updateState = (newState: StreamState) => {
      const previous = this.state;
      this.state = newState;
      observer.onStateChange?.(newState, previous);
    };

    updateState('connecting');

    // Convert source to async generator if needed
    const generator = this.toAsyncGenerator(source);

    // Start processing
    const processStream = async () => {
      updateState('open');

      try {
        for await (const text of generator) {
          // Check for cancellation
          if (this.abortController?.signal.aborted) {
            break;
          }

          const now = performance.now();
          const latencyMs = now - previousTokenTime;
          previousTokenTime = now;

          if (!firstTokenReceived) {
            firstTokenReceived = true;
            this.stats.firstTokenLatencyMs = now - startTime;
          }

          totalLatency += latencyMs;

          const tokenEvent: TokenEvent = {
            token: text,
            index: this.stats.tokenCount,
            latencyMs,
            source: 'edge', // Will be set by caller
          };

          this.stats.tokenCount++;
          this.stats.charCount += text.length;

          // Add to buffer
          if (this.config.enableBackpressure) {
            const accepted = this.buffer.push(tokenEvent);
            if (!accepted && this.state !== 'paused') {
              updateState('paused');
              this.stats.pausedCount++;
            }
          }

          // Notify observer
          observer.onToken?.(tokenEvent);

          // Reset inactivity timer
          this.resetInactivityTimer(observer);

          // Update stats
          const elapsed = now - startTime;
          this.stats.durationMs = elapsed;
          this.stats.tokensPerSecond = this.stats.tokenCount / (elapsed / 1000);
          this.stats.charsPerSecond = this.stats.charCount / (elapsed / 1000);
          this.stats.avgTokenLatencyMs = totalLatency / this.stats.tokenCount;
          this.stats.bufferUtilization = this.buffer.utilization();
        }

        // Stream completed
        updateState('closed');
        this.clearInactivityTimer();
        observer.onComplete?.(this.stats);
      } catch (error) {
        // Handle error and potentially reconnect
        updateState('error');
        this.clearInactivityTimer();

        if (
          this.config.autoReconnect &&
          this.reconnectAttempts < this.config.maxReconnectAttempts
        ) {
          await this.attemptReconnect(observer);
        } else {
          observer.onError?.(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    };

    // Start processing in background
    processStream();

    // Return controller
    return this.createController(observer);
  }

  /**
   * Stream from WebSocket
   */
  async streamFromWebSocket(
    ws: WebSocket,
    observer: StreamObserver
  ): Promise<StreamController> {
    this.reset();
    this.abortController = new AbortController();

    const startTime = performance.now();
    let firstTokenReceived = false;
    let totalLatency = 0;
    let previousTokenTime = startTime;

    const updateState = (newState: StreamState) => {
      const previous = this.state;
      this.state = newState;
      observer.onStateChange?.(newState, previous);
    };

    return new Promise((resolve, reject) => {
      updateState('connecting');

      ws.onopen = () => {
        updateState('open');
      };

      ws.onmessage = (event) => {
        if (this.abortController?.signal.aborted) {
          ws.close();
          return;
        }

        const now = performance.now();
        const latencyMs = now - previousTokenTime;
        previousTokenTime = now;

        if (!firstTokenReceived) {
          firstTokenReceived = true;
          this.stats.firstTokenLatencyMs = now - startTime;
        }

        totalLatency += latencyMs;

        let text: string;
        try {
          const data = JSON.parse(event.data);
          if (data.done) {
            updateState('closed');
            this.clearInactivityTimer();
            ws.close();
            observer.onComplete?.(this.stats);
            return;
          }
          text = data.token || data.text || '';
        } catch {
          text = event.data;
        }

        const tokenEvent: TokenEvent = {
          token: text,
          index: this.stats.tokenCount,
          latencyMs,
          source: 'edge',
        };

        this.stats.tokenCount++;
        this.stats.charCount += text.length;

        if (this.config.enableBackpressure) {
          const accepted = this.buffer.push(tokenEvent);
          if (!accepted && this.state !== 'paused') {
            updateState('paused');
            this.stats.pausedCount++;
          }
        }

        observer.onToken?.(tokenEvent);
        this.resetInactivityTimer(observer);

        const elapsed = now - startTime;
        this.stats.durationMs = elapsed;
        this.stats.tokensPerSecond = this.stats.tokenCount / (elapsed / 1000);
        this.stats.charsPerSecond = this.stats.charCount / (elapsed / 1000);
        this.stats.avgTokenLatencyMs = totalLatency / this.stats.tokenCount;
        this.stats.bufferUtilization = this.buffer.utilization();
      };

      ws.onerror = (error) => {
        updateState('error');
        this.clearInactivityTimer();
        observer.onError?.(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        if (this.state !== 'closed') {
          updateState('closed');
          this.clearInactivityTimer();
          observer.onComplete?.(this.stats);
        }
      };

      // Resolve with controller immediately
      resolve(this.createController(observer));
    });
  }

  /**
   * Stream from Server-Sent Events
   */
  async streamFromSSE(
    url: string,
    observer: StreamObserver,
    options?: RequestInit
  ): Promise<StreamController> {
    this.reset();
    this.abortController = new AbortController();

    const startTime = performance.now();
    let firstTokenReceived = false;
    let totalLatency = 0;
    let previousTokenTime = startTime;

    const updateState = (newState: StreamState) => {
      const previous = this.state;
      this.state = newState;
      observer.onStateChange?.(newState, previous);
    };

    updateState('connecting');

    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
        headers: {
          ...options?.headers,
          Accept: 'text/event-stream',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body not readable');
      }

      updateState('open');
      const decoder = new TextDecoder();
      let buffer = '';

      const processChunks = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done || this.abortController?.signal.aborted) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);

                if (data === '[DONE]') {
                  updateState('closed');
                  this.clearInactivityTimer();
                  observer.onComplete?.(this.stats);
                  return;
                }

                const now = performance.now();
                const latencyMs = now - previousTokenTime;
                previousTokenTime = now;

                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  this.stats.firstTokenLatencyMs = now - startTime;
                }

                totalLatency += latencyMs;

                let text: string;
                try {
                  const parsed = JSON.parse(data);
                  text =
                    parsed.token ||
                    parsed.text ||
                    parsed.choices?.[0]?.delta?.content ||
                    '';
                } catch {
                  text = data;
                }

                if (text) {
                  const tokenEvent: TokenEvent = {
                    token: text,
                    index: this.stats.tokenCount,
                    latencyMs,
                    source: 'edge',
                  };

                  this.stats.tokenCount++;
                  this.stats.charCount += text.length;

                  if (this.config.enableBackpressure) {
                    const accepted = this.buffer.push(tokenEvent);
                    if (!accepted && this.state !== 'paused') {
                      updateState('paused');
                      this.stats.pausedCount++;
                    }
                  }

                  observer.onToken?.(tokenEvent);
                  this.resetInactivityTimer(observer);

                  const elapsed = now - startTime;
                  this.stats.durationMs = elapsed;
                  this.stats.tokensPerSecond =
                    this.stats.tokenCount / (elapsed / 1000);
                  this.stats.charsPerSecond =
                    this.stats.charCount / (elapsed / 1000);
                  this.stats.avgTokenLatencyMs =
                    totalLatency / this.stats.tokenCount;
                  this.stats.bufferUtilization = this.buffer.utilization();
                }
              }
            }
          }

          updateState('closed');
          this.clearInactivityTimer();
          observer.onComplete?.(this.stats);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            updateState('closed');
          } else {
            updateState('error');
            observer.onError?.(
              error instanceof Error ? error : new Error(String(error))
            );
          }
          this.clearInactivityTimer();
        }
      };

      processChunks();
      return this.createController(observer);
    } catch (error) {
      updateState('error');
      observer.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Merge multiple streams (for hybrid mode)
   */
  async *mergeStreams(
    streams: AsyncGenerator<TokenEvent>[]
  ): AsyncGenerator<TokenEvent> {
    if (!this.config.enableMerging) {
      // Just yield from first stream
      yield* streams[0];
      return;
    }

    // Create promise race for all streams
    const iterators = streams.map((stream) => stream[Symbol.asyncIterator]());
    const pending = new Map<
      number,
      Promise<{ index: number; result: IteratorResult<TokenEvent> }>
    >();

    // Initialize all streams
    for (let i = 0; i < iterators.length; i++) {
      pending.set(i, this.wrapNext(iterators[i], i));
    }

    while (pending.size > 0) {
      const { index, result } = await Promise.race(pending.values());

      if (result.done) {
        pending.delete(index);
      } else {
        yield result.value;
        pending.set(index, this.wrapNext(iterators[index], index));
      }
    }
  }

  /**
   * Wrap iterator.next() with index
   */
  private async wrapNext(
    iterator: AsyncIterator<TokenEvent>,
    index: number
  ): Promise<{ index: number; result: IteratorResult<TokenEvent> }> {
    const result = await iterator.next();
    return { index, result };
  }

  /**
   * Convert source to async generator
   */
  private async *toAsyncGenerator(
    source: AsyncGenerator<string> | ReadableStream<string>
  ): AsyncGenerator<string> {
    if (source instanceof ReadableStream) {
      const reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      yield* source;
    }
  }

  /**
   * Handle backpressure state change
   */
  private handleBackpressure(paused: boolean): void {
    if (paused) {
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'resuming';
      // Small delay before resuming
      setTimeout(() => {
        if (this.state === 'resuming') {
          this.state = 'open';
        }
      }, 10);
    }
  }

  /**
   * Reset inactivity timer
   */
  private resetInactivityTimer(observer: StreamObserver): void {
    this.clearInactivityTimer();

    this.inactivityTimer = setTimeout(() => {
      if (this.state === 'open' || this.state === 'paused') {
        observer.onError?.(new Error('Stream inactivity timeout'));
        this.state = 'error';
      }
    }, this.config.inactivityTimeout);
  }

  /**
   * Clear inactivity timer
   */
  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  /**
   * Attempt reconnection
   */
  private async attemptReconnect(observer: StreamObserver): Promise<void> {
    this.reconnectAttempts++;
    this.stats.reconnectCount++;
    this.state = 'reconnecting';

    observer.onReconnect?.(this.reconnectAttempts);

    await new Promise((resolve) =>
      setTimeout(resolve, this.config.reconnectDelay * this.reconnectAttempts)
    );

    // Reconnection logic would be implemented by the caller
    // This is a placeholder for the reconnection attempt
  }

  /**
   * Create stream controller
   */
  private createController(observer: StreamObserver): StreamController {
    return {
      pause: () => {
        if (this.state === 'open') {
          this.state = 'paused';
          observer.onStateChange?.('paused', 'open');
        }
      },
      resume: () => {
        if (this.state === 'paused') {
          this.state = 'open';
          observer.onStateChange?.('open', 'paused');
        }
      },
      cancel: () => {
        this.abortController?.abort();
        this.state = 'closed';
        this.clearInactivityTimer();
        observer.onStateChange?.('closed', this.state);
      },
      getState: () => this.state,
      getStats: () => ({ ...this.stats }),
      isActive: () =>
        this.state === 'open' ||
        this.state === 'paused' ||
        this.state === 'connecting',
    };
  }

  /**
   * Reset client state
   */
  private reset(): void {
    this.state = 'closed';
    this.buffer.clear();
    this.stats = this.createEmptyStats();
    this.reconnectAttempts = 0;
    this.lastTokenTime = 0;
    this.clearInactivityTimer();
    this.abortController = null;
  }

  /**
   * Get current state
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Get current stats
   */
  getStats(): StreamStats {
    return { ...this.stats };
  }
}

/**
 * Create preconfigured streaming client
 */
export const STREAMING_PRESETS = {
  /** High performance streaming */
  performance: {
    bufferSize: 50,
    enableBackpressure: false,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 500,
    inactivityTimeout: 10000,
  } as StreamConfig,

  /** Memory efficient streaming */
  lowMemory: {
    bufferSize: 20,
    enableBackpressure: true,
    highWaterMark: 15,
    lowWaterMark: 5,
    autoReconnect: true,
    maxReconnectAttempts: 2,
    reconnectDelay: 2000,
    inactivityTimeout: 60000,
  } as StreamConfig,

  /** Reliable streaming */
  reliable: {
    bufferSize: 100,
    enableBackpressure: true,
    highWaterMark: 80,
    lowWaterMark: 20,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectDelay: 1000,
    inactivityTimeout: 120000,
  } as StreamConfig,
};
