/**
 * P2P Transport
 *
 * Peer-to-peer messaging for distributed agent communication.
 * Builds on existing edgework gateway connector.
 */

export interface P2PMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'broadcast' | 'heartbeat';
  payload: unknown;
  timestamp: number;
  ttl?: number;
}

export interface P2PPeer {
  id: string;
  endpoint: string;
  lastSeen: number;
  capabilities: string[];
  latencyMs?: number;
}

export interface P2PConfig {
  /** This peer's ID */
  peerId?: string;
  /** Discovery method */
  discovery?: 'gateway' | 'mdns' | 'manual';
  /** Gateway URL for peer discovery */
  gatewayUrl?: string;
  /** Heartbeat interval in ms */
  heartbeatIntervalMs?: number;
  /** Peer timeout in ms */
  peerTimeoutMs?: number;
}

/**
 * P2P mesh network for agent communication.
 */
export class P2PMesh {
  private peerId: string;
  private peers: Map<string, P2PPeer> = new Map();
  private messageHandlers: Map<
    string,
    (message: P2PMessage) => void | Promise<void>
  > = new Map();
  private config: P2PConfig;

  constructor(config?: P2PConfig) {
    this.config = config ?? {};
    this.peerId = config?.peerId ?? crypto.randomUUID();
  }

  /**
   * Get this peer's ID.
   */
  getId(): string {
    return this.peerId;
  }

  /**
   * Add a known peer.
   */
  addPeer(peer: P2PPeer): void {
    this.peers.set(peer.id, peer);
  }

  /**
   * Remove a peer.
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  /**
   * Get all known peers.
   */
  getPeers(): P2PPeer[] {
    return [...this.peers.values()];
  }

  /**
   * Send a message to a specific peer.
   */
  async send(to: string, payload: unknown): Promise<P2PMessage> {
    const peer = this.peers.get(to);
    if (!peer) {
      throw new Error(`Unknown peer: ${to}`);
    }

    const message: P2PMessage = {
      id: crypto.randomUUID(),
      from: this.peerId,
      to,
      type: 'request',
      payload,
      timestamp: Date.now(),
    };

    const startTime = Date.now();

    const response = await fetch(`${peer.endpoint}/p2p/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    // Update latency
    peer.latencyMs = Date.now() - startTime;
    peer.lastSeen = Date.now();

    if (!response.ok) {
      throw new Error(`Failed to send message to ${to}: ${response.status}`);
    }

    return (await response.json()) as P2PMessage;
  }

  /**
   * Broadcast a message to all known peers.
   */
  async broadcast(payload: unknown): Promise<P2PMessage[]> {
    const results = await Promise.allSettled(
      [...this.peers.keys()].map((peerId) => this.send(peerId, payload))
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<P2PMessage> => r.status === 'fulfilled'
      )
      .map((r) => r.value);
  }

  /**
   * Register a message handler.
   */
  onMessage(
    type: string,
    handler: (message: P2PMessage) => void | Promise<void>
  ): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Handle an incoming message.
   */
  async handleMessage(message: P2PMessage): Promise<P2PMessage | null> {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      await handler(message);
    }

    // Auto-update peer info
    if (!this.peers.has(message.from)) {
      this.peers.set(message.from, {
        id: message.from,
        endpoint: '', // Would be resolved by discovery
        lastSeen: Date.now(),
        capabilities: [],
      });
    } else {
      const peer = this.peers.get(message.from)!;
      peer.lastSeen = Date.now();
    }

    return null;
  }

  /**
   * Discover peers via gateway.
   */
  async discover(): Promise<P2PPeer[]> {
    if (this.config.discovery !== 'gateway' || !this.config.gatewayUrl) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.config.gatewayUrl}/peers?exclude=${this.peerId}`
      );
      if (!response.ok) return [];
      const peers = (await response.json()) as P2PPeer[];
      for (const peer of peers) {
        this.addPeer(peer);
      }
      return peers;
    } catch {
      return [];
    }
  }
}
