/**
 * Agent Manager - Orchestrates gateway, compute node, and token spending
 */

import fs from 'fs/promises';
import path from 'path';
import type {
  AgentConfig,
  AgentEventListener,
  AgentEventType,
  AgentEvents,
  AgentManagerOptions,
  ComputeStats,
  TokenSpendingConfig,
} from './types';
import { GatewayConnector } from './GatewayConnector';
import { ComputeNode } from './ComputeNode';
import { WalletManager } from './WalletManager';
import { TokenSpendingManager } from './TokenSpendingManager';
import { resolveEdgeworkApiKey } from '../edgework-api-key';

/**
 * Main agent orchestrator with token-based compute spending support
 *
 * @example
 * ```typescript
 * const manager = new AgentManager({
 *   gatewayName: 'My Node',
 *   cpuAllocation: 0.8,
 *   enableSystemTray: true,
 *   runAtBoot: true,
 * });
 *
 * await manager.initialize();
 * await manager.start();
 *
 * manager.on('statsUpdated', ({ stats }) => {
 *   console.log('Earnings:', stats.estimatedEarnings);
 * });
 * ```
 */
export class AgentManager {
  private config: AgentConfig;
  private configPath: string;
  private apiKey: string | undefined;
  private gateway: GatewayConnector | null = null;
  private computeNode: ComputeNode | null = null;
  private walletManager: WalletManager;
  private tokenSpending: TokenSpendingManager | null = null;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private isRunning = false;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private logger: any;

  constructor(options: AgentManagerOptions = {}) {
    this.configPath =
      options.configPath || `${this.getConfigDir()}/agent-config.json`;
    this.apiKey = resolveEdgeworkApiKey(options.apiKey);
    this.walletManager = new WalletManager({
      configDir: path.dirname(this.configPath),
    });
    this.logger = this.createLogger();

    // Initialize config
    this.config = {
      gateway: {
        name: options.gatewayName || 'Edgework Agent',
        region: 'auto',
        walletAddress: options.walletAddress || '',
        metadata: {},
      },
      compute: {
        cpuAllocation: options.cpuAllocation || 0.8,
        memoryMB: options.memoryMB || 2048,
        maxTaskDuration: 600,
        enableGPU: true,
        enableWebNN: true,
        enableTokenSpending: options.enableTokenSpending,
      },
      system: {
        runAtBoot: options.runAtBoot || false,
        systemTray: options.enableSystemTray || false,
        logLevel: 'info',
      },
    };

    if (options.rpcUrl) {
      (this.config as any).rpcUrl = options.rpcUrl;
    }
    if (options.registryAddress) {
      (this.config as any).registryAddress = options.registryAddress;
    }
  }

  private createLogger() {
    return {
      debug: (msg: string, data?: any) =>
        console.debug(`[AgentManager] ${msg}`, data),
      info: (msg: string, data?: any) =>
        console.info(`[AgentManager] ${msg}`, data),
      warn: (msg: string, data?: any) =>
        console.warn(`[AgentManager] ${msg}`, data),
      error: (msg: string, data?: any) =>
        console.error(`[AgentManager] ${msg}`, data),
    };
  }

  private getConfigDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
    return `${homeDir}/.edgework`;
  }

  /**
   * Initialize agent
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing agent');

      // Load or create config
      await this.loadOrCreateConfig();

      // Initialize gateway connector
      this.gateway = new GatewayConnector({
        walletAddress: this.config.gateway.walletAddress,
        provider: (this.config as any).rpcUrl,
        registryAddress: (this.config as any).registryAddress,
        apiKey: this.apiKey,
      });

      // Initialize token spending manager if enabled
      if (this.config.compute.enableTokenSpending ?? true) {
        const tokenConfig: TokenSpendingConfig = {
          tokenAddress:
            this.config.compute.tokenAddress ||
            '0x55ef8e6e56DEDc7f72658E53C7b2759c74210a5A',
          enableTokenSpending: this.config.compute.enableTokenSpending ?? true,
          rateLimit: {
            costPerMinute:
              this.config.compute.tokenCostPerMinute || 1000000000000000000n,
            costPerCall: 100000000000000000n,
            minimumBalance:
              this.config.compute.minTokenBalance || 1000000000000000000n,
            dailyLimit: 1000000000000000000000n,
            subscriptionRequired: false,
          },
          balanceSyncInterval: 300000, // 5 minutes
          rpcUrl: (this.config as any).rpcUrl,
        };

        this.tokenSpending = new TokenSpendingManager(
          this.config.gateway.walletAddress,
          tokenConfig
        );

        await this.tokenSpending.initialize();

        // Listen for token events
        this.tokenSpending.on('balanceUpdated', ({ balance }) => {
          this.logger.debug('Token balance updated', {
            available: balance.available.toString(),
          });
        });

        this.tokenSpending.on('transactionFailed', ({ tx, error }) => {
          this.logger.warn('Token transaction failed', {
            txId: tx.id,
            error,
          });
        });
      }

      // Initialize compute node with token manager
      this.computeNode = new ComputeNode(
        {
          gatewayUrl: 'http://localhost:8080', // Will be updated
          apiKey: this.apiKey,
          cpuAllocation: this.config.compute.cpuAllocation,
          memoryMB: this.config.compute.memoryMB,
          maxTaskDuration: this.config.compute.maxTaskDuration,
          enableGPU: this.config.compute.enableGPU,
        },
        this.tokenSpending || undefined,
        this.config.gateway.walletAddress,
        false // hasSubscription - will be determined at runtime
      );

      this.logger.info('Agent initialized successfully');
    } catch (error) {
      this.logger.error('Initialization failed', { error });
      throw error;
    }
  }

  /**
   * Start agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Agent already running');
      return;
    }

    try {
      this.logger.info('Starting agent');

      // Connect gateway
      if (this.gateway) {
        await this.gateway.connect();
        const status = await this.gateway.getStatus();

        if (!status) {
          this.logger.info('Gateway not registered, registering now...');
          await this.gateway.register(this.config.gateway);
        }
      }

      // Start compute node
      if (this.computeNode) {
        await this.computeNode.start();
      }

      this.isRunning = true;

      // Start heartbeat interval (every 12 hours)
      this.heartbeatInterval = setInterval(
        () => this.sendHeartbeat(),
        12 * 60 * 60 * 1000
      );

      // Start stats reporting interval (every 5 minutes)
      this.statsInterval = setInterval(() => this.reportStats(), 5 * 60 * 1000);

      this.emit('started', { timestamp: Date.now() });
      this.logger.info('Agent started successfully');
    } catch (error) {
      this.logger.error('Start failed', { error });
      throw error;
    }
  }

  /**
   * Stop agent
   */
  async stop(reason = 'User requested'): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Agent not running');
      return;
    }

    try {
      this.logger.info('Stopping agent', { reason });

      // Clear intervals
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      // Stop token spending manager
      if (this.tokenSpending) {
        await this.tokenSpending.stop();
      }

      // Stop compute node
      if (this.computeNode) {
        await this.computeNode.stop();
      }

      // Disconnect gateway
      if (this.gateway) {
        await this.gateway.disconnect();
      }

      this.isRunning = false;
      this.emit('stopped', { reason, timestamp: Date.now() });

      this.logger.info('Agent stopped successfully');
    } catch (error) {
      this.logger.error('Stop failed', { error });
      throw error;
    }
  }

  /**
   * Get current stats
   */
  getStats(): ComputeStats {
    if (!this.computeNode) {
      return {
        tasksCompleted: 0,
        totalComputeTime: 0,
        estimatedEarnings: 0,
        activeTaskCount: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        uptime: 0,
      };
    }

    return this.computeNode.getStats();
  }

  /**
   * Send heartbeat to gateway
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      if (this.gateway && this.isRunning) {
        await this.gateway.sendHeartbeat();
        this.logger.debug('Heartbeat sent');
      }
    } catch (error) {
      this.logger.warn('Heartbeat failed', { error });
    }
  }

  /**
   * Report stats and emit event
   */
  private reportStats(): Promise<void> {
    const stats = this.getStats();
    this.emit('statsUpdated', { stats });
    return Promise.resolve();
  }

  /**
   * Load or create config
   */
  private async loadOrCreateConfig(): Promise<void> {
    try {
      // Try to load existing config
      const content = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(content);
      this.logger.info('Config loaded from', { path: this.configPath });
    } catch (error) {
      // Create default config
      await this.saveConfig();
      this.logger.info('Config created', { path: this.configPath });
    }
  }

  /**
   * Save config to file
   */
  private async saveConfig(): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Event listener registration
   */
  on<K extends AgentEventType>(
    event: K,
    listener: AgentEventListener<K>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  /**
   * Remove event listener
   */
  off<K extends AgentEventType>(
    event: K,
    listener: AgentEventListener<K>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener as (...args: unknown[]) => void);
    }
  }

  /**
   * Emit event
   */
  private emit<K extends AgentEventType>(event: K, data: AgentEvents[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as (data: AgentEvents[K]) => void)(data);
        } catch (error) {
          this.logger.error('Event listener error', { event, error });
        }
      });
    }
  }

  /**
   * Get config
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Get token spending manager (if enabled)
   */
  getTokenSpendingManager(): TokenSpendingManager | null {
    return this.tokenSpending;
  }

  /**
   * Get current token balance
   */
  getTokenBalance() {
    if (!this.tokenSpending) {
      return null;
    }
    return this.tokenSpending.getBalance();
  }

  /**
   * Update config
   */
  async updateConfig(partial: Partial<AgentConfig>): Promise<void> {
    this.config = { ...this.config, ...partial };
    await this.saveConfig();
  }
}
