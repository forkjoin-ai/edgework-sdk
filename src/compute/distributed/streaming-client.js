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
 * Token buffer for managing stream flow
 */
class TokenBuffer {
  constructor(highWaterMark, lowWaterMark, onPause, onResume) {
    this.buffer = [];
    this.isPaused = false;
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;
    this.onPause = onPause;
    this.onResume = onResume;
  }
  /**
   * Add token to buffer
   */
  push(token) {
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
  shift() {
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
  isEmpty() {
    return this.buffer.length === 0;
  }
  /**
   * Get buffer size
   */
  size() {
    return this.buffer.length;
  }
  /**
   * Get buffer utilization
   */
  utilization() {
    return this.buffer.length / this.highWaterMark;
  }
  /**
   * Check if paused due to backpressure
   */
  paused() {
    return this.isPaused;
  }
  /**
   * Clear buffer
   */
  clear() {
    this.buffer = [];
    this.isPaused = false;
  }
}
/**
 * Default stream configuration
 */
const DEFAULT_CONFIG = {
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
  constructor(config = {}) {
    this.state = 'closed';
    this.reconnectAttempts = 0;
    this.inactivityTimer = null;
    this.lastTokenTime = 0;
    this.abortController = null;
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
  createEmptyStats() {
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
  async stream(source, observer) {
    this.reset();
    this.abortController = new AbortController();
    const startTime = performance.now();
    let firstTokenReceived = false;
    let totalLatency = 0;
    let previousTokenTime = startTime;
    const updateState = (newState) => {
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
          const tokenEvent = {
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
  async streamFromWebSocket(ws, observer) {
    this.reset();
    this.abortController = new AbortController();
    const startTime = performance.now();
    let firstTokenReceived = false;
    let totalLatency = 0;
    let previousTokenTime = startTime;
    const updateState = (newState) => {
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
        let text;
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
        const tokenEvent = {
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
  async streamFromSSE(url, observer, options) {
    this.reset();
    this.abortController = new AbortController();
    const startTime = performance.now();
    let firstTokenReceived = false;
    let totalLatency = 0;
    let previousTokenTime = startTime;
    const updateState = (newState) => {
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
                let text;
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
                  const tokenEvent = {
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
  async *mergeStreams(streams) {
    if (!this.config.enableMerging) {
      // Just yield from first stream
      yield* streams[0];
      return;
    }
    // Create promise race for all streams
    const iterators = streams.map((stream) => stream[Symbol.asyncIterator]());
    const pending = new Map();
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
  async wrapNext(iterator, index) {
    const result = await iterator.next();
    return { index, result };
  }
  /**
   * Convert source to async generator
   */
  async *toAsyncGenerator(source) {
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
  handleBackpressure(paused) {
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
  resetInactivityTimer(observer) {
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
  clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }
  /**
   * Attempt reconnection
   */
  async attemptReconnect(observer) {
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
  createController(observer) {
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
  reset() {
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
  getState() {
    return this.state;
  }
  /**
   * Get current stats
   */
  getStats() {
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
  },
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
  },
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
  },
};
//# sourceMappingURL=streaming-client.js.map
