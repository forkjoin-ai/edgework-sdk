/**
 * Connection Manager
 *
 * Manages WebSocket and HTTP connections to edge workers:
 * - Connection pooling
 * - Lifecycle management
 * - Health monitoring
 * - Graceful degradation
 * - Protocol negotiation
 */

/**
 * Connection type
 */
export type ConnectionType = 'websocket' | 'http' | 'webtransport';

/**
 * Connection state
 */
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'idle'
  | 'active'
  | 'draining'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

/**
 * Connection quality
 */
export interface ConnectionQuality {
  /** Round-trip time in ms */
  rttMs: number;

  /** Packet loss rate (0-1) */
  packetLoss: number;

  /** Jitter in ms */
  jitterMs: number;

  /** Quality score (0-100) */
  score: number;

  /** Last measurement timestamp */
  measuredAt: number;
}

/**
 * Connection info
 */
export interface ConnectionInfo {
  /** Connection ID */
  id: string;

  /** Worker endpoint URL */
  endpoint: string;

  /** Connection type */
  type: ConnectionType;

  /** Current state */
  state: ConnectionState;

  /** Connection quality */
  quality: ConnectionQuality;

  /** Creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Request count */
  requestCount: number;

  /** Error count */
  errorCount: number;

  /** Whether connection is authenticated */
  authenticated: boolean;

  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Pool configuration
 */
export interface PoolConfig {
  /** Minimum connections to maintain */
  minConnections: number;

  /** Maximum connections per endpoint */
  maxConnectionsPerEndpoint: number;

  /** Maximum total connections */
  maxTotalConnections: number;

  /** Idle timeout in ms */
  idleTimeout: number;

  /** Connection timeout in ms */
  connectionTimeout: number;

  /** Maximum request age in ms */
  maxRequestAge: number;

  /** Enable connection warming */
  enableWarming: boolean;

  /** Warming interval in ms */
  warmingInterval: number;

  /** Quality check interval in ms */
  qualityCheckInterval: number;

  /** Minimum quality score (0-100) */
  minQualityScore: number;
}

/**
 * Protocol capabilities
 */
export interface ProtocolCapabilities {
  /** Supported message types */
  messageTypes: string[];

  /** Supports streaming */
  streaming: boolean;

  /** Supports binary messages */
  binary: boolean;

  /** Maximum message size */
  maxMessageSize: number;

  /** Supports compression */
  compression: boolean;

  /** Supports multiplexing */
  multiplexing: boolean;

  /** Protocol version */
  version: string;
}

/**
 * Connection manager configuration
 */
export interface ConnectionManagerConfig {
  /** Pool configuration */
  pool: Partial<PoolConfig>;

  /** Preferred connection types in order */
  preferredTypes: ConnectionType[];

  /** Authentication token provider */
  authProvider?: () => Promise<string | null>;

  /** Enable automatic quality monitoring */
  enableQualityMonitoring: boolean;

  /** Callback on connection state change */
  onStateChange?: (
    id: string,
    state: ConnectionState,
    previousState: ConnectionState
  ) => void;

  /** Callback on connection quality change */
  onQualityChange?: (id: string, quality: ConnectionQuality) => void;

  /** Callback on connection error */
  onError?: (id: string, error: Error) => void;
}

/**
 * Default pool configuration
 */
const DEFAULT_POOL_CONFIG: PoolConfig = {
  minConnections: 1,
  maxConnectionsPerEndpoint: 4,
  maxTotalConnections: 16,
  idleTimeout: 60000,
  connectionTimeout: 10000,
  maxRequestAge: 300000,
  enableWarming: true,
  warmingInterval: 30000,
  qualityCheckInterval: 15000,
  minQualityScore: 30,
};

/**
 * Generate unique connection ID
 */
function generateConnectionId(): string {
  return `conn_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Managed connection wrapper
 */
class ManagedConnection {
  public readonly info: ConnectionInfo;
  private socket: WebSocket | null = null;
  private pendingRequests: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();
  private messageQueue: Array<{
    data: unknown;
    resolve: () => void;
    reject: (e: Error) => void;
  }> = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private capabilities: ProtocolCapabilities | null = null;

  constructor(
    endpoint: string,
    type: ConnectionType,
    private config: ConnectionManagerConfig
  ) {
    this.info = {
      id: generateConnectionId(),
      endpoint,
      type,
      state: 'disconnected',
      quality: {
        rttMs: 0,
        packetLoss: 0,
        jitterMs: 0,
        score: 100,
        measuredAt: 0,
      },
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      requestCount: 0,
      errorCount: 0,
      authenticated: false,
      metadata: {},
    };
  }

  /**
   * Connect to endpoint
   */
  async connect(): Promise<void> {
    if (this.info.state !== 'disconnected') {
      return;
    }

    this.updateState('connecting');

    try {
      if (this.info.type === 'websocket') {
        await this.connectWebSocket();
      } else {
        // HTTP connections are stateless
        this.updateState('connected');
      }

      // Authenticate if provider available
      if (this.config.authProvider) {
        await this.authenticate();
      } else {
        this.info.authenticated = true;
        this.updateState('idle');
      }
    } catch (error) {
      this.updateState('error');
      throw error;
    }
  }

  /**
   * Connect via WebSocket
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.getPoolConfig().connectionTimeout);

      // Convert HTTP URL to WebSocket URL
      const wsUrl = this.info.endpoint
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:');

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        clearTimeout(timeout);
        this.updateState('connected');
        this.startHeartbeat();
        resolve();
      };

      this.socket.onerror = (event) => {
        clearTimeout(timeout);
        this.info.errorCount++;
        reject(new Error('WebSocket connection error'));
      };

      this.socket.onclose = () => {
        this.stopHeartbeat();
        this.updateState('disconnected');
        this.rejectPendingRequests(new Error('Connection closed'));
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Authenticate the connection
   */
  private async authenticate(): Promise<void> {
    if (!this.config.authProvider) {
      this.info.authenticated = true;
      return;
    }

    this.updateState('connected');
    const token = await this.config.authProvider();

    if (token) {
      if (this.socket) {
        await this.send({ type: 'auth', token });
      }
      this.info.authenticated = true;
    }

    this.updateState('idle');
  }

  /**
   * Send message and wait for response
   */
  async request<T>(data: unknown, timeout?: number): Promise<T> {
    if (this.info.state !== 'idle' && this.info.state !== 'active') {
      throw new Error(`Connection not ready: ${this.info.state}`);
    }

    this.updateState('active');
    this.info.requestCount++;
    this.info.lastActivityAt = Date.now();

    const requestId = `req_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    if (this.info.type === 'websocket' && this.socket) {
      return this.sendWebSocketRequest(requestId, data, timeout);
    } else {
      return this.sendHttpRequest(data, timeout);
    }
  }

  /**
   * Send WebSocket request
   */
  private sendWebSocketRequest<T>(
    requestId: string,
    data: unknown,
    timeout?: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeout || this.getPoolConfig().maxRequestAge);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutId,
      });

      this.socket!.send(
        JSON.stringify({
          id: requestId,
          ...(data as object),
        })
      );
    });
  }

  /**
   * Send HTTP request
   */
  private async sendHttpRequest<T>(
    data: unknown,
    timeout?: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || this.getPoolConfig().maxRequestAge
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.authProvider) {
        const token = await this.config.authProvider();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const response = await fetch(this.info.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
      this.updateState('idle');
    }
  }

  /**
   * Send message (fire and forget)
   */
  async send(data: unknown): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
      this.info.lastActivityAt = Date.now();
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string | ArrayBuffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Check if this is a response to a pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message);
        }

        if (this.pendingRequests.size === 0) {
          this.updateState('idle');
        }
        return;
      }

      // Handle other message types (events, etc.)
      if (message.type === 'pong') {
        this.updateQuality(message.rtt || 0);
      } else if (message.type === 'capabilities') {
        this.capabilities = message.capabilities;
      }
    } catch (error) {
      this.info.errorCount++;
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    if (this.pingInterval) return;

    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const pingTime = Date.now();
        this.socket.send(
          JSON.stringify({
            type: 'ping',
            timestamp: pingTime,
          })
        );
      }
    }, this.getPoolConfig().qualityCheckInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Update connection quality
   */
  private updateQuality(rttMs: number): void {
    const previousRtt = this.info.quality.rttMs;
    const jitter = Math.abs(rttMs - previousRtt);

    this.info.quality = {
      rttMs,
      packetLoss: 0, // Would need to track lost pings
      jitterMs: this.info.quality.jitterMs * 0.9 + jitter * 0.1,
      score: this.calculateQualityScore(rttMs, jitter),
      measuredAt: Date.now(),
    };

    this.config.onQualityChange?.(this.info.id, this.info.quality);
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(rttMs: number, jitterMs: number): number {
    // Score based on RTT and jitter
    let score = 100;

    // Penalize high RTT
    if (rttMs > 50) score -= Math.min(30, (rttMs - 50) / 10);
    if (rttMs > 200) score -= Math.min(20, (rttMs - 200) / 20);

    // Penalize jitter
    if (jitterMs > 10) score -= Math.min(20, jitterMs - 10);

    // Penalize high error rate
    const errorRate =
      this.info.requestCount > 0
        ? this.info.errorCount / this.info.requestCount
        : 0;
    score -= errorRate * 30;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Reject all pending requests
   */
  private rejectPendingRequests(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Update connection state
   */
  private updateState(newState: ConnectionState): void {
    const previousState = this.info.state;
    this.info.state = newState;
    this.config.onStateChange?.(this.info.id, newState, previousState);
  }

  /**
   * Get pool config with defaults
   */
  private getPoolConfig(): PoolConfig {
    return { ...DEFAULT_POOL_CONFIG, ...this.config.pool };
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.info.state === 'disconnected') return;

    this.updateState('disconnecting');
    this.stopHeartbeat();
    this.rejectPendingRequests(new Error('Connection closing'));

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.updateState('disconnected');
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    const poolConfig = this.getPoolConfig();
    const isConnected =
      this.info.state === 'idle' || this.info.state === 'active';
    const hasGoodQuality =
      this.info.quality.score >= poolConfig.minQualityScore;
    const isRecent =
      Date.now() - this.info.lastActivityAt < poolConfig.idleTimeout;

    return isConnected && hasGoodQuality && isRecent;
  }

  /**
   * Get capabilities
   */
  getCapabilities(): ProtocolCapabilities | null {
    return this.capabilities;
  }
}

/**
 * Connection Manager
 *
 * Manages a pool of connections to edge workers.
 */
export class ConnectionManager {
  private config: ConnectionManagerConfig;
  private poolConfig: PoolConfig;
  private connections: Map<string, ManagedConnection> = new Map();
  private endpointConnections: Map<string, Set<string>> = new Map();
  private warmingInterval: ReturnType<typeof setInterval> | null = null;
  private qualityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ConnectionManagerConfig> = {}) {
    this.config = {
      pool: {},
      preferredTypes: ['websocket', 'http'],
      enableQualityMonitoring: true,
      ...config,
    };
    this.poolConfig = { ...DEFAULT_POOL_CONFIG, ...this.config.pool };
  }

  /**
   * Start the connection manager
   */
  start(): void {
    if (this.poolConfig.enableWarming) {
      this.warmingInterval = setInterval(
        () => this.warmConnections(),
        this.poolConfig.warmingInterval
      );
    }

    if (this.config.enableQualityMonitoring) {
      this.qualityCheckInterval = setInterval(
        () => this.checkConnectionQuality(),
        this.poolConfig.qualityCheckInterval
      );
    }
  }

  /**
   * Stop the connection manager
   */
  async stop(): Promise<void> {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
    }

    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }

    // Close all connections
    await Promise.all(
      Array.from(this.connections.values()).map((conn) => conn.disconnect())
    );

    this.connections.clear();
    this.endpointConnections.clear();
  }

  /**
   * Get or create connection to endpoint
   */
  async getConnection(
    endpoint: string,
    type?: ConnectionType
  ): Promise<ManagedConnection> {
    // Check for existing healthy connection
    const existingConnections = this.endpointConnections.get(endpoint);
    if (existingConnections) {
      for (const connId of existingConnections) {
        const conn = this.connections.get(connId);
        if (conn && conn.isHealthy()) {
          return conn;
        }
      }
    }

    // Check total connection limit
    if (this.connections.size >= this.poolConfig.maxTotalConnections) {
      // Try to reuse least recently used connection
      const lruConn = this.getLeastRecentlyUsedConnection();
      if (lruConn) {
        await lruConn.disconnect();
        this.removeConnection(lruConn.info.id);
      }
    }

    // Create new connection
    const connType = type || this.config.preferredTypes[0];
    const connection = new ManagedConnection(endpoint, connType, this.config);

    await connection.connect();

    this.connections.set(connection.info.id, connection);

    if (!this.endpointConnections.has(endpoint)) {
      this.endpointConnections.set(endpoint, new Set());
    }
    this.endpointConnections.get(endpoint)!.add(connection.info.id);

    return connection;
  }

  /**
   * Release connection back to pool
   */
  releaseConnection(connection: ManagedConnection): void {
    /* noop - connection stays in pool for reuse, cleaned up by idle timeout */
  }

  /**
   * Remove connection from pool
   */
  private removeConnection(connId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;

    this.connections.delete(connId);

    const endpointConns = this.endpointConnections.get(conn.info.endpoint);
    if (endpointConns) {
      endpointConns.delete(connId);
      if (endpointConns.size === 0) {
        this.endpointConnections.delete(conn.info.endpoint);
      }
    }
  }

  /**
   * Get least recently used connection
   */
  private getLeastRecentlyUsedConnection(): ManagedConnection | null {
    let lru: ManagedConnection | null = null;
    let lruTime = Infinity;

    for (const conn of this.connections.values()) {
      if (conn.info.lastActivityAt < lruTime) {
        lruTime = conn.info.lastActivityAt;
        lru = conn;
      }
    }

    return lru;
  }

  /**
   * Warm connections for known endpoints
   */
  private async warmConnections(): Promise<void> {
    for (const [endpoint, connIds] of this.endpointConnections) {
      const healthyCount = Array.from(connIds).filter((id) => {
        const conn = this.connections.get(id);
        return conn?.isHealthy();
      }).length;

      // Ensure minimum connections
      if (healthyCount < this.poolConfig.minConnections) {
        try {
          await this.getConnection(endpoint);
        } catch (error) {
          // Warming unmet expectations is not critical
          console.warn(`Failed to warm connection to ${endpoint}:`, error);
        }
      }
    }
  }

  /**
   * Check connection quality and cleanup
   */
  private async checkConnectionQuality(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, conn] of this.connections) {
      // Check for idle timeout
      if (now - conn.info.lastActivityAt > this.poolConfig.idleTimeout) {
        // Keep at least minConnections per endpoint
        const endpointConns = this.endpointConnections.get(conn.info.endpoint);
        if (
          endpointConns &&
          endpointConns.size > this.poolConfig.minConnections
        ) {
          toRemove.push(id);
        }
      }

      // Check for poor quality
      if (conn.info.quality.score < this.poolConfig.minQualityScore) {
        toRemove.push(id);
      }
    }

    // Remove stale connections
    for (const id of toRemove) {
      const conn = this.connections.get(id);
      if (conn) {
        await conn.disconnect();
        this.removeConnection(id);
      }
    }
  }

  /**
   * Get all connections info
   */
  getConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values()).map((c) => ({ ...c.info }));
  }

  /**
   * Get connections for endpoint
   */
  getEndpointConnections(endpoint: string): ConnectionInfo[] {
    const connIds = this.endpointConnections.get(endpoint);
    if (!connIds) return [];

    return Array.from(connIds)
      .map((id) => this.connections.get(id)?.info)
      .filter((info): info is ConnectionInfo => !!info);
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    healthyConnections: number;
    activeConnections: number;
    endpointCount: number;
    avgQualityScore: number;
    totalRequests: number;
    totalErrors: number;
  } {
    const connections = Array.from(this.connections.values());
    const healthyCount = connections.filter((c) => c.isHealthy()).length;
    const activeCount = connections.filter(
      (c) => c.info.state === 'active'
    ).length;
    const totalQuality = connections.reduce(
      (sum, c) => sum + c.info.quality.score,
      0
    );
    const totalRequests = connections.reduce(
      (sum, c) => sum + c.info.requestCount,
      0
    );
    const totalErrors = connections.reduce(
      (sum, c) => sum + c.info.errorCount,
      0
    );

    return {
      totalConnections: connections.length,
      healthyConnections: healthyCount,
      activeConnections: activeCount,
      endpointCount: this.endpointConnections.size,
      avgQualityScore:
        connections.length > 0 ? totalQuality / connections.length : 100,
      totalRequests,
      totalErrors,
    };
  }
}

/**
 * Pre-configured connection manager presets
 */
export const CONNECTION_PRESETS = {
  /** High performance for real-time applications */
  realtime: {
    pool: {
      minConnections: 2,
      maxConnectionsPerEndpoint: 8,
      maxTotalConnections: 32,
      idleTimeout: 30000,
      connectionTimeout: 5000,
      qualityCheckInterval: 5000,
      minQualityScore: 50,
    },
    preferredTypes: ['websocket'] as ConnectionType[],
    enableQualityMonitoring: true,
  } as Partial<ConnectionManagerConfig>,

  /** Balanced for general use */
  balanced: {
    pool: {
      minConnections: 1,
      maxConnectionsPerEndpoint: 4,
      maxTotalConnections: 16,
      idleTimeout: 60000,
      connectionTimeout: 10000,
      qualityCheckInterval: 15000,
      minQualityScore: 30,
    },
    preferredTypes: ['websocket', 'http'] as ConnectionType[],
    enableQualityMonitoring: true,
  } as Partial<ConnectionManagerConfig>,

  /** Low resource for mobile/constrained devices */
  lowResource: {
    pool: {
      minConnections: 1,
      maxConnectionsPerEndpoint: 2,
      maxTotalConnections: 4,
      idleTimeout: 120000,
      connectionTimeout: 15000,
      qualityCheckInterval: 30000,
      minQualityScore: 20,
    },
    preferredTypes: ['http'] as ConnectionType[],
    enableQualityMonitoring: false,
  } as Partial<ConnectionManagerConfig>,
};
