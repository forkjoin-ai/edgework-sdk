/**
 * Distributed Inference Client
 *
 * Client-side integration with Cloudflare Workers distributed inference.
 * Provides seamless connection to edge workers for large model inference.
 *
 * Features:
 * - Automatic worker discovery and health monitoring
 * - Connection pooling with WebSocket/WebTransport
 * - Request multiplexing for efficient bandwidth usage
 * - Graceful degradation on network issues
 * - Real-time latency tracking and worker selection
 */
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  connectionTimeoutMs: 10000,
  requestTimeoutMs: 60000,
  healthCheckIntervalMs: 30000,
  maxConcurrentRequests: 10,
  enableWebSocket: true,
  enableWebTransport: false,
  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
};
/**
 * Distributed Inference Client
 *
 * Manages connections to multiple edge workers and routes requests
 * to the optimal worker based on health, latency, and load.
 */
export class DistributedClient {
  constructor(config) {
    this.connections = new Map();
    this.workerStatus = new Map();
    this.latencyTrackers = new Map();
    this.healthCheckInterval = null;
    this.requestCounter = 0;
    this.isShutdown = false;
    /**
     * Stream event handlers
     */
    this.streamHandlers = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Initialize connections for all endpoints
    for (const endpoint of config.endpoints) {
      this.initializeWorker(endpoint);
    }
    // Start health checks
    if (this.config.healthCheckIntervalMs > 0) {
      this.startHealthChecks();
    }
  }
  /**
   * Initialize a worker connection
   */
  initializeWorker(endpoint) {
    // Initialize latency tracker
    this.latencyTrackers.set(endpoint, {
      samples: [],
      maxSamples: 100,
      successCount: 0,
      failureCount: 0,
    });
    // Initialize worker status
    this.workerStatus.set(endpoint, {
      endpoint,
      state: 'disconnected',
      healthy: false,
      lastHealthCheck: 0,
      avgLatencyMs: 0,
      latencyP50: 0,
      latencyP95: 0,
      latencyP99: 0,
      successRate: 1,
      queueDepth: 0,
      capabilities: {
        maxBatchSize: 0,
        maxSeqLength: 0,
        supportsFP16: false,
        supportsKVCache: false,
        models: [],
      },
      region: 'unknown',
      workerId: 'unknown',
    });
    // Initialize connection
    this.connections.set(endpoint, {
      endpoint,
      socket: null,
      state: 'disconnected',
      reconnectAttempts: 0,
      lastActivity: Date.now(),
      pendingRequests: new Map(),
    });
  }
  /**
   * Connect to a worker via WebSocket
   */
  async connect(endpoint) {
    const connection = this.connections.get(endpoint);
    if (!connection) {
      throw new Error(`Unknown endpoint: ${endpoint}`);
    }
    if (connection.state === 'connected' || connection.state === 'connecting') {
      return;
    }
    this.updateConnectionState(endpoint, 'connecting');
    try {
      if (this.config.enableWebSocket) {
        await this.connectWebSocket(endpoint);
      } else {
        // Use HTTP polling fallback
        await this.checkHealth(endpoint);
      }
    } catch (error) {
      this.updateConnectionState(endpoint, 'error');
      this.config.onError?.(error, endpoint);
      throw error;
    }
  }
  /**
   * Connect via WebSocket
   */
  async connectWebSocket(endpoint) {
    const connection = this.connections.get(endpoint);
    const wsUrl = endpoint.replace(/^http/, 'ws') + '/ws';
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${endpoint}`));
      }, this.config.connectionTimeoutMs);
      try {
        const socket = new WebSocket(wsUrl);
        socket.onopen = () => {
          clearTimeout(timeout);
          connection.socket = socket;
          connection.reconnectAttempts = 0;
          this.updateConnectionState(endpoint, 'connected');
          // Send auth if available
          if (this.config.apiKey) {
            socket.send(
              JSON.stringify({
                type: 'auth',
                apiKey: this.config.apiKey,
              })
            );
          }
          resolve();
        };
        socket.onmessage = (event) => {
          this.handleMessage(endpoint, event.data);
        };
        socket.onclose = () => {
          connection.socket = null;
          this.updateConnectionState(endpoint, 'disconnected');
          this.scheduleReconnect(endpoint);
        };
        socket.onerror = (error) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${error}`));
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  /**
   * Handle incoming WebSocket message
   */
  handleMessage(endpoint, data) {
    const connection = this.connections.get(endpoint);
    if (!connection) return;
    connection.lastActivity = Date.now();
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case 'response': {
          const pending = connection.pendingRequests.get(message.requestId);
          if (pending) {
            const latency = Date.now() - pending.startTime;
            this.recordLatency(endpoint, latency, true);
            connection.pendingRequests.delete(message.requestId);
            pending.resolve(message.result);
          }
          break;
        }
        case 'error': {
          const pending = connection.pendingRequests.get(message.requestId);
          if (pending) {
            this.recordLatency(endpoint, Date.now() - pending.startTime, false);
            connection.pendingRequests.delete(message.requestId);
            pending.reject(new Error(message.error));
          }
          break;
        }
        case 'stream': {
          // Handle streaming tokens - dispatch to stream handler
          this.dispatchStreamEvent(message.requestId, message.token);
          break;
        }
        case 'health': {
          this.updateWorkerStatus(endpoint, message.status);
          break;
        }
        case 'pong': {
          // Health check response
          const status = this.workerStatus.get(endpoint);
          if (status) {
            status.lastHealthCheck = Date.now();
            status.healthy = true;
          }
          break;
        }
      }
    } catch (error) {
      console.error(
        `[DistributedClient] Failed to parse message from ${endpoint}:`,
        error
      );
    }
  }
  dispatchStreamEvent(requestId, token) {
    const handler = this.streamHandlers.get(requestId);
    if (handler) {
      handler(token);
    }
  }
  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect(endpoint) {
    if (this.isShutdown) return;
    const connection = this.connections.get(endpoint);
    if (!connection) return;
    const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } =
      this.config.retry;
    if (connection.reconnectAttempts >= maxRetries) {
      this.updateConnectionState(endpoint, 'error');
      return;
    }
    const delay = Math.min(
      baseDelayMs * Math.pow(backoffMultiplier, connection.reconnectAttempts),
      maxDelayMs
    );
    connection.reconnectAttempts++;
    this.updateConnectionState(endpoint, 'reconnecting');
    setTimeout(() => {
      if (!this.isShutdown) {
        this.connect(endpoint).catch(() => {
          /* noop - error handling is done in connect() */
        });
      }
    }, delay);
  }
  /**
   * Update connection state and notify
   */
  updateConnectionState(endpoint, state) {
    const connection = this.connections.get(endpoint);
    if (connection) {
      connection.state = state;
    }
    const status = this.workerStatus.get(endpoint);
    if (status) {
      status.state = state;
      status.healthy = state === 'connected';
    }
    this.config.onConnectionChange?.(endpoint, state);
  }
  /**
   * Update worker status
   */
  updateWorkerStatus(endpoint, update) {
    const status = this.workerStatus.get(endpoint);
    if (status) {
      Object.assign(status, update);
      this.config.onWorkerHealthChange?.(status);
    }
  }
  /**
   * Record latency sample
   */
  recordLatency(endpoint, latencyMs, success) {
    const tracker = this.latencyTrackers.get(endpoint);
    if (!tracker) return;
    tracker.samples.push(latencyMs);
    if (tracker.samples.length > tracker.maxSamples) {
      tracker.samples.shift();
    }
    if (success) {
      tracker.successCount++;
    } else {
      tracker.failureCount++;
    }
    // Update worker status
    const status = this.workerStatus.get(endpoint);
    if (status && tracker.samples.length > 0) {
      const sorted = [...tracker.samples].sort((a, b) => a - b);
      status.avgLatencyMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      status.latencyP50 = sorted[Math.floor(sorted.length * 0.5)];
      status.latencyP95 = sorted[Math.floor(sorted.length * 0.95)];
      status.latencyP99 = sorted[Math.floor(sorted.length * 0.99)];
      const total = tracker.successCount + tracker.failureCount;
      status.successRate = total > 0 ? tracker.successCount / total : 1;
    }
  }
  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(() => {
      for (const endpoint of this.config.endpoints) {
        this.checkHealth(endpoint).catch(() => {
          /* noop - error handling is done in checkHealth */
        });
      }
    }, this.config.healthCheckIntervalMs);
  }
  /**
   * Check health of a worker
   */
  async checkHealth(endpoint) {
    const status = this.workerStatus.get(endpoint);
    if (!status) {
      throw new Error(`Unknown endpoint: ${endpoint}`);
    }
    const connection = this.connections.get(endpoint);
    // If WebSocket is connected, use ping/pong
    if (connection?.socket?.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify({ type: 'ping' }));
      status.lastHealthCheck = Date.now();
      return status;
    }
    // Otherwise use HTTP health check
    try {
      const start = Date.now();
      const response = await fetch(`${endpoint}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      this.recordLatency(endpoint, latency, response.ok);
      if (response.ok) {
        const data = await response.json();
        this.updateWorkerStatus(endpoint, {
          healthy: true,
          lastHealthCheck: Date.now(),
          capabilities: data.capabilities,
          region: data.region,
          workerId: data.workerId,
          queueDepth: data.queueDepth || 0,
        });
      } else {
        this.updateWorkerStatus(endpoint, { healthy: false });
      }
    } catch (error) {
      this.recordLatency(endpoint, 5000, false);
      this.updateWorkerStatus(endpoint, { healthy: false });
    }
    return status;
  }
  /**
   * Select the best worker for a request
   */
  selectWorker(options = {}) {
    const healthyWorkers = [];
    for (const [endpoint, status] of this.workerStatus) {
      if (!status.healthy) continue;
      // Check if worker supports the requested model
      if (
        options.model &&
        !status.capabilities.models.includes(options.model)
      ) {
        continue;
      }
      // Check region preference
      let regionBonus = 0;
      if (
        options.preferredRegion &&
        status.region === options.preferredRegion
      ) {
        regionBonus = 100;
      }
      // Score based on latency, success rate, and queue depth
      const latencyScore = Math.max(0, 100 - status.avgLatencyMs / 10);
      const successScore = status.successRate * 50;
      const queueScore = Math.max(0, 50 - status.queueDepth * 5);
      const score = latencyScore + successScore + queueScore + regionBonus;
      healthyWorkers.push({ endpoint, score });
    }
    if (healthyWorkers.length === 0) {
      return null;
    }
    // Sort by score descending
    healthyWorkers.sort((a, b) => b.score - a.score);
    // Return best worker (with some randomization for load balancing)
    const topN = Math.min(3, healthyWorkers.length);
    const idx = Math.floor(Math.random() * topN);
    return healthyWorkers[idx].endpoint;
  }
  /**
   * Generate text using distributed inference
   */
  async generate(prompt, options = {}) {
    const endpoint = this.selectWorker(options);
    if (!endpoint) {
      throw new Error('No healthy workers available');
    }
    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    const connection = this.connections.get(endpoint);
    const startTime = Date.now();
    // Try WebSocket first
    if (connection.socket?.readyState === WebSocket.OPEN) {
      return this.generateViaWebSocket(
        endpoint,
        requestId,
        prompt,
        options,
        startTime
      );
    }
    // Fall back to HTTP
    return this.generateViaHTTP(
      endpoint,
      requestId,
      prompt,
      options,
      startTime
    );
  }
  /**
   * Generate via WebSocket connection
   */
  generateViaWebSocket(endpoint, requestId, prompt, options, startTime) {
    const connection = this.connections.get(endpoint);
    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      // Set up timeout
      const timeout = setTimeout(() => {
        connection.pendingRequests.delete(requestId);
        abortController.abort();
        reject(
          new Error(
            `Request timeout after ${
              options.timeoutMs || this.config.requestTimeoutMs
            }ms`
          )
        );
      }, options.timeoutMs || this.config.requestTimeoutMs);
      // Handle external abort
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timeout);
        connection.pendingRequests.delete(requestId);
        abortController.abort();
        reject(new Error('Request aborted'));
      });
      // Track pending request
      connection.pendingRequests.set(requestId, {
        id: requestId,
        endpoint,
        startTime,
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        abortController,
      });
      // Update queue depth
      const status = this.workerStatus.get(endpoint);
      if (status) {
        status.queueDepth = connection.pendingRequests.size;
      }
      // Send request
      connection.socket.send(
        JSON.stringify({
          type: 'generate',
          requestId,
          prompt,
          options: {
            model: options.model,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            topP: options.topP,
            topK: options.topK,
            stopSequences: options.stopSequences,
            stream: options.stream,
            useFP16: options.useFP16,
            speculative: options.speculative,
            priority: options.priority,
          },
        })
      );
    });
  }
  /**
   * Generate via HTTP fallback
   */
  async generateViaHTTP(endpoint, requestId, prompt, options, startTime) {
    const abortController = new AbortController();
    // Merge abort signals
    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort());
    }
    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, options.timeoutMs || this.config.requestTimeoutMs);
    try {
      const response = await fetch(`${endpoint}/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
          'X-Request-ID': requestId,
        },
        body: JSON.stringify({
          prompt,
          model: options.model,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          top_k: options.topK,
          stop: options.stopSequences,
          stream: options.stream,
          use_fp16: options.useFP16,
          speculative: options.speculative,
        }),
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      this.recordLatency(endpoint, latency, response.ok);
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      const status = this.workerStatus.get(endpoint);
      return {
        text: data.text || data.choices?.[0]?.text || '',
        tokens: data.tokens || [],
        stats: {
          totalTokens: data.usage?.total_tokens || 0,
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalLatencyMs: latency,
          firstTokenLatencyMs: data.first_token_latency_ms || latency,
          tokensPerSecond: data.tokens_per_second || 0,
        },
        worker: {
          endpoint,
          region: status.region,
          workerId: status.workerId,
        },
        speculative: data.speculative,
        cache: data.cache,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.recordLatency(endpoint, Date.now() - startTime, false);
      throw error;
    }
  }
  /**
   * Stream generation with token callback
   */
  async *stream(prompt, options = {}) {
    const endpoint = this.selectWorker(options);
    if (!endpoint) {
      throw new Error('No healthy workers available');
    }
    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    const startTime = Date.now();
    const tokens = [];
    let finalResult = null;
    const connection = this.connections.get(endpoint);
    // Use WebSocket streaming if available
    if (connection.socket?.readyState === WebSocket.OPEN) {
      // Set up stream handler
      const tokenQueue = [];
      let resolveNext = null;
      let streamComplete = false;
      this.streamHandlers.set(requestId, (token) => {
        if (token === '[DONE]') {
          streamComplete = true;
          if (resolveNext) {
            resolveNext({ done: true, value: finalResult });
          }
        } else {
          tokens.push(token);
          if (resolveNext) {
            resolveNext({ done: false, value: token });
            resolveNext = null;
          } else {
            tokenQueue.push(token);
          }
        }
      });
      // Send streaming request
      connection.socket.send(
        JSON.stringify({
          type: 'generate',
          requestId,
          prompt,
          options: {
            ...options,
            stream: true,
          },
        })
      );
      try {
        while (!streamComplete) {
          if (tokenQueue.length > 0) {
            yield tokenQueue.shift();
          } else {
            await new Promise((resolve) => {
              resolveNext = resolve;
            });
          }
        }
      } finally {
        this.streamHandlers.delete(requestId);
      }
    } else {
      // HTTP SSE fallback
      const response = await fetch(`${endpoint}/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
          'X-Request-ID': requestId,
        },
        body: JSON.stringify({
          prompt,
          ...options,
          stream: true,
        }),
        signal: options.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                tokens.push(parsed.token);
                yield parsed.token;
              }
              if (parsed.result) {
                finalResult = parsed.result;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }
    const status = this.workerStatus.get(endpoint);
    const latency = Date.now() - startTime;
    this.recordLatency(endpoint, latency, true);
    return (
      finalResult || {
        text: tokens.join(''),
        tokens: [],
        stats: {
          totalTokens: tokens.length,
          promptTokens: 0,
          completionTokens: tokens.length,
          totalLatencyMs: latency,
          firstTokenLatencyMs: 0,
          tokensPerSecond: tokens.length / (latency / 1000),
        },
        worker: {
          endpoint,
          region: status.region,
          workerId: status.workerId,
        },
      }
    );
  }
  /**
   * Get all worker statuses
   */
  getWorkerStatuses() {
    return Array.from(this.workerStatus.values());
  }
  /**
   * Get healthy worker count
   */
  getHealthyWorkerCount() {
    return Array.from(this.workerStatus.values()).filter((s) => s.healthy)
      .length;
  }
  /**
   * Disconnect from a specific worker
   */
  disconnect(endpoint) {
    const connection = this.connections.get(endpoint);
    if (connection?.socket) {
      connection.socket.close();
      connection.socket = null;
    }
    this.updateConnectionState(endpoint, 'disconnected');
  }
  /**
   * Disconnect from all workers
   */
  disconnectAll() {
    for (const endpoint of this.connections.keys()) {
      this.disconnect(endpoint);
    }
  }
  /**
   * Shutdown the client
   */
  shutdown() {
    this.isShutdown = true;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.disconnectAll();
    this.connections.clear();
    this.workerStatus.clear();
    this.latencyTrackers.clear();
    this.streamHandlers.clear();
  }
}
/**
 * Pre-configured client presets
 */
export const DISTRIBUTED_PRESETS = {
  /** Single region, low latency */
  singleRegion: {
    connectionTimeoutMs: 5000,
    requestTimeoutMs: 30000,
    healthCheckIntervalMs: 15000,
    maxConcurrentRequests: 20,
    enableWebSocket: true,
    retry: {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    },
  },
  /** Multi-region, high availability */
  multiRegion: {
    connectionTimeoutMs: 10000,
    requestTimeoutMs: 60000,
    healthCheckIntervalMs: 30000,
    maxConcurrentRequests: 10,
    enableWebSocket: true,
    retry: {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
  },
  /** Development/testing */
  development: {
    connectionTimeoutMs: 30000,
    requestTimeoutMs: 120000,
    healthCheckIntervalMs: 60000,
    maxConcurrentRequests: 5,
    enableWebSocket: false,
    retry: {
      maxRetries: 1,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1,
    },
  },
};
//# sourceMappingURL=distributed-client.js.map
