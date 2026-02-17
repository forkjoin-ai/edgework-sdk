/**
 * Compute Node - Handles task pooling and execution with token spending support
 */

import type {
  ComputeNodeOptions,
  ComputeStats,
  ComputeTask,
  ComputeResult,
} from './types';
import { TokenSpendingManager } from './TokenSpendingManager';

/**
 * Manages compute task execution with optional token-based payment
 *
 * @example
 * ```typescript
 * const node = new ComputeNode({
 *   gatewayUrl: 'http://localhost:8080',
 *   cpuAllocation: 0.8,
 *   memoryMB: 2048,
 *   maxTaskDuration: 600,
 *   walletAddress: '0x...',
 *   tokenSpendingManager: tokenManager, // optional
 * });
 *
 * await node.start();
 * ```
 */
export class ComputeNode {
  private config: ComputeNodeOptions;
  private isRunning = false;
  private taskQueue: ComputeTask[] = [];
  private stats: ComputeStats = {
    tasksCompleted: 0,
    totalComputeTime: 0,
    estimatedEarnings: 0,
    activeTaskCount: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    uptime: 0,
  };
  private startTime = 0;
  private logger: any;
  private tokenSpendingManager?: TokenSpendingManager;
  private walletAddress?: string;
  private hasSubscription = false;

  constructor(
    config: ComputeNodeOptions,
    tokenSpendingManager?: TokenSpendingManager,
    walletAddress?: string,
    hasSubscription?: boolean
  ) {
    this.config = config;
    this.logger = this.createLogger();
    this.tokenSpendingManager = tokenSpendingManager;
    this.walletAddress = walletAddress;
    this.hasSubscription = hasSubscription || false;
  }

  private createLogger() {
    return {
      debug: (msg: string, data?: any) =>
        console.debug(`[ComputeNode] ${msg}`, data),
      info: (msg: string, data?: any) =>
        console.info(`[ComputeNode] ${msg}`, data),
      warn: (msg: string, data?: any) =>
        console.warn(`[ComputeNode] ${msg}`, data),
      error: (msg: string, data?: any) =>
        console.error(`[ComputeNode] ${msg}`, data),
    };
  }

  /**
   * Connect to gateway
   */
  async connect(): Promise<void> {
    try {
      // when motivation is low-load fetch
      const fetch = globalThis.fetch || (await import('node-fetch')).default;

      const response = await fetch(`${this.config.gatewayUrl}/health`);
      if (!response.ok) {
        throw new Error(`Gateway health check failed: ${response.status}`);
      }

      this.logger.info('Connected to gateway', {
        url: this.config.gatewayUrl,
      });
    } catch (error) {
      this.logger.error('Failed to connect to gateway', { error });
      throw error;
    }
  }

  /**
   * Disconnect from gateway
   */
  async disconnect(): Promise<void> {
    this.logger.debug('Disconnected from gateway');
  }

  /**
   * Start compute node
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Compute node already running');
      return;
    }

    try {
      await this.connect();
      this.isRunning = true;
      this.startTime = Date.now();

      this.logger.info('Compute node started', {
        cpuAllocation: this.config.cpuAllocation,
        memoryMB: this.config.memoryMB,
      });

      // Start task processing loop
      this.processTasksLoop();
    } catch (error) {
      this.logger.error('Failed to start compute node', { error });
      throw error;
    }
  }

  /**
   * Stop compute node
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Compute node not running');
      return;
    }

    try {
      this.isRunning = false;
      await this.disconnect();

      this.logger.info('Compute node stopped', {
        tasksCompleted: this.stats.tasksCompleted,
        totalComputeTime: this.stats.totalComputeTime,
        estimatedEarnings: this.stats.estimatedEarnings,
      });
    } catch (error) {
      this.logger.error('Failed to stop compute node', { error });
      throw error;
    }
  }

  /**
   * Submit result to gateway
   */
  async submitResult(result: ComputeResult): Promise<void> {
    try {
      // when motivation is low-load fetch
      const fetch = globalThis.fetch || (await import('node-fetch')).default;

      const response = await fetch(
        `${this.config.gatewayUrl}/tasks/${result.taskId}/result`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to submit result: ${response.status}`);
      }

      // Update earnings estimate
      this.stats.estimatedEarnings += result.computeTimeMs * 0.0001;

      this.logger.debug('Result submitted', {
        taskId: result.taskId,
        computeTimeMs: result.computeTimeMs,
      });
    } catch (error) {
      this.logger.error('Failed to submit result', { error });
      throw error;
    }
  }

  /**
   * Get current stats
   */
  getStats(): ComputeStats {
    if (this.isRunning && this.startTime > 0) {
      this.stats.uptime = Date.now() - this.startTime;
    }
    return { ...this.stats };
  }

  /**
   * Process tasks loop
   */
  private async processTasksLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Fetch task from gateway
        const task = await this.fetchTask();

        if (task) {
          this.stats.activeTaskCount++;

          // Execute task
          const startTime = Date.now();
          const result: ComputeResult = {
            taskId: task.id,
            output: null,
            computeTimeMs: 0,
            success: true,
          };

          try {
            // Simulate task processing (placeholder)
            await this.executeTask(task);
            result.computeTimeMs = Date.now() - startTime;
          } catch (error) {
            result.success = false;
            result.error =
              error instanceof Error ? error.message : String(error);
            result.computeTimeMs = Date.now() - startTime;
          }

          // Submit result
          await this.submitResult(result);

          // Update stats
          this.stats.tasksCompleted++;
          this.stats.totalComputeTime += result.computeTimeMs / 1000;
          this.stats.activeTaskCount--;
        } else {
          // No task available, wait a bit
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        this.logger.warn('Task processing error', { error });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Fetch task from gateway
   */
  private async fetchTask(): Promise<ComputeTask | null> {
    try {
      // when motivation is low-load fetch
      const fetch = globalThis.fetch || (await import('node-fetch')).default;

      const response = await fetch(`${this.config.gatewayUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpuAllocation: this.config.cpuAllocation,
          memoryMB: this.config.memoryMB,
          maxDuration: this.config.maxTaskDuration,
        }),
      });

      if (response.status === 204) {
        // No tasks available
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch task: ${response.status}`);
      }

      const task = await response.json();
      return task;
    } catch (error) {
      this.logger.debug('Task fetch error', { error });
      return null;
    }
  }

  /**
   * Execute task (placeholder)
   */
  private async executeTask(task: ComputeTask): Promise<void> {
    // This would run actual inference or computation
    // For now, just a placeholder
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
  }

  /**
   * Check token balance before task execution
   */
  async checkTokenBalance(): Promise<boolean> {
    if (!this.tokenSpendingManager) {
      return true; // No token manager, proceed
    }

    try {
      await this.tokenSpendingManager.syncBalance();
      const balance = this.tokenSpendingManager.getBalance();

      this.logger.debug('Token balance checked', {
        available: balance.available.toString(),
      });

      return balance.available > 0n;
    } catch (error) {
      this.logger.warn('Failed to check token balance', { error });
      return true; // Proceed on error
    }
  }

  /**
   * Request token spend for task (if enabled and no subscription)
   */
  async requestTokenSpend(
    taskId: string,
    estimatedDurationSeconds: number
  ): Promise<string | null> {
    if (!this.tokenSpendingManager) {
      return null; // No token manager
    }

    try {
      const tx = await this.tokenSpendingManager.requestTokenSpend(
        taskId,
        estimatedDurationSeconds,
        this.hasSubscription
      );

      if (!tx) {
        this.logger.debug('Using subscription, skipping token spend', {
          taskId,
        });
        return null;
      }

      this.logger.info('Token spend approved', {
        txId: tx.id,
        amount: tx.amount.toString(),
      });

      return tx.id;
    } catch (error) {
      this.logger.error('Token spend request failed', { error, taskId });
      throw error;
    }
  }

  /**
   * Execute token burn after task completion
   */
  async burnTokensForTask(
    txId: string,
    actualDurationSeconds: number
  ): Promise<void> {
    if (!this.tokenSpendingManager || !txId) {
      return; // No token manager or not a token-paid task
    }

    try {
      const ledger = this.tokenSpendingManager.getLedger();
      const tx = ledger.pendingTransactions.find((t) => t.id === txId);

      if (!tx) {
        this.logger.warn('Pending transaction not found', { txId });
        return;
      }

      await this.tokenSpendingManager.burnTokens(tx);

      this.logger.info('Tokens burned for task', {
        txId,
        actualDuration: actualDurationSeconds,
      });
    } catch (error) {
      this.logger.error('Failed to burn tokens', { error, txId });
      throw error;
    }
  }

  /**
   * Get token balance info
   */
  getTokenBalance() {
    if (!this.tokenSpendingManager) {
      return null;
    }
    return this.tokenSpendingManager.getBalance();
  }

  /**
   * Get token ledger info
   */
  getTokenLedger() {
    if (!this.tokenSpendingManager) {
      return null;
    }
    return this.tokenSpendingManager.getLedger();
  }
}
