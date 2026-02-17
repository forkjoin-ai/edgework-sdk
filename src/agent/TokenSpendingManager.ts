/**
 * Token Spending Manager - Handles EDGEWORK token balance and spending for compute
 * Implements subscription-first fallback: if subscription has credits, use those first.
 * Only burns tokens if subscription unavailable or credits exhausted.
 */

import type {
  TokenBalance,
  TokenRateLimit,
  TokenSpendingTransaction,
  TokenLedger,
  TokenSpendingConfig,
  TokenSpendingEvent,
  TokenSpendingEventType,
  TokenSpendingEventListener,
} from './types';

interface TokenSpendingLogger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

interface TokenBurnTransaction {
  wait: () => Promise<{ hash?: string }>;
  hash?: string;
}

interface TokenContract {
  balanceOf: (owner: string) => Promise<{ toString: () => string }>;
  burn: (amount: bigint) => Promise<TokenBurnTransaction>;
}

interface EthersModule {
  JsonRpcProvider: new (rpcUrl: string) => unknown;
  Contract: new (
    address: string,
    abi: string[],
    provider: unknown
  ) => TokenContract;
}

/**
 * Manages token-based compute spending with subscription fallback
 *
 * @example
 * ```typescript
 * const manager = new TokenSpendingManager({
 *   walletAddress: '0x...',
 *   tokenAddress: '0x55ef8e6e56DEDc7f72658E53C7b2759c74210a5A',
 *   enableTokenSpending: true,
 *   rateLimit: {
 *     costPerMinute: 1000000000000000000n, // 1 token per minute
 *     costPerCall: 100000000000000000n,
 *     minimumBalance: 1000000000000000000n,
 *     dailyLimit: 1000000000000000000000n,
 *     subscriptionRequired: false,
 *   },
 *   balanceSyncInterval: 300000, // 5 minutes
 *   rpcUrl: 'https://sepolia.optimism.io',
 * });
 *
 * await manager.initialize();
 * const balance = await manager.getBalance();
 * const tx = await manager.requestTokenSpend('task-123', 60, false);
 * ```
 */
export class TokenSpendingManager {
  private walletAddress: string;
  private config: TokenSpendingConfig;
  private ledger: TokenLedger;
  private logger: TokenSpendingLogger;
  private web3Provider: unknown = null;
  private tokenContract: TokenContract | null = null;
  private balanceSyncInterval: NodeJS.Timeout | null = null;
  private listeners: Map<
    TokenSpendingEventType,
    Set<TokenSpendingEventListener<TokenSpendingEventType>>
  > = new Map();

  constructor(walletAddress: string, config: TokenSpendingConfig) {
    this.walletAddress = walletAddress;
    this.config = config;
    this.logger = this.createLogger();

    // Initialize ledger
    this.ledger = {
      address: walletAddress,
      balance: {
        total: 0n,
        available: 0n,
        locked: 0n,
        updatedAt: Date.now(),
      },
      spentToday: 0n,
      pendingTransactions: [],
      completedTransactions: [],
      lastSyncAt: 0,
    };
  }

  private createLogger() {
    return {
      debug: (msg: string, data?: unknown) =>
        console.debug(`[TokenSpendingManager] ${msg}`, data),
      info: (msg: string, data?: unknown) =>
        console.info(`[TokenSpendingManager] ${msg}`, data),
      warn: (msg: string, data?: unknown) =>
        console.warn(`[TokenSpendingManager] ${msg}`, data),
      error: (msg: string, data?: unknown) =>
        console.error(`[TokenSpendingManager] ${msg}`, data),
    };
  }

  /**
   * Initialize and connect to token contract
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enableTokenSpending) {
        this.logger.info('Token spending disabled');
        return;
      }

      const resolvedEthers = await this.loadEthers();
      if (!resolvedEthers) {
        this.logger.warn(
          'Ethers module not available; token spending disabled'
        );
        this.config.enableTokenSpending = false;
        return;
      }

      const { JsonRpcProvider: DirectJsonRpcProvider, Contract } =
        resolvedEthers;
      const JsonRpcProvider =
        DirectJsonRpcProvider ??
        (
          resolvedEthers as unknown as {
            providers?: { JsonRpcProvider?: new (rpcUrl: string) => unknown };
          }
        ).providers?.JsonRpcProvider;

      if (!JsonRpcProvider || !Contract) {
        throw new Error('Ethers module missing JsonRpcProvider or Contract');
      }

      // Create provider
      const rpcUrl = this.config.rpcUrl || 'https://sepolia.optimism.io';
      this.web3Provider = new JsonRpcProvider(rpcUrl);

      // ERC20 ABI (minimal for our use case)
      const erc20Abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function burn(uint256 amount) external',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function decimals() view returns (uint8)',
      ];

      // Create contract instance
      this.tokenContract = new Contract(
        this.config.tokenAddress,
        erc20Abi,
        this.web3Provider
      );

      // Initial sync
      await this.syncBalance();

      // Start periodic sync (5 minutes default)
      this.startBalanceSyncLoop();

      this.logger.info('TokenSpendingManager initialized', {
        tokenAddress: this.config.tokenAddress,
        syncInterval: this.config.balanceSyncInterval,
      });
    } catch (error) {
      this.logger.error('Failed to initialize TokenSpendingManager', { error });
      throw error;
    }
  }

  private async loadEthers(): Promise<EthersModule | null> {
    try {
      const ethers = await import('ethers');
      return ethers as unknown as EthersModule;
    } catch (error) {
      this.logger.warn('Failed to load ethers module', { error });
      return null;
    }
  }

  /**
   * Sync balance from on-chain
   */
  async syncBalance(): Promise<void> {
    try {
      if (!this.tokenContract) {
        return;
      }

      const balance = await this.tokenContract.balanceOf(this.walletAddress);
      const now = Date.now();

      this.ledger.balance = {
        total: BigInt(balance.toString()),
        available: BigInt(balance.toString()) - this.ledger.balance.locked,
        locked: this.ledger.balance.locked,
        updatedAt: now,
      };

      this.ledger.lastSyncAt = now;

      this.emit('balanceUpdated', {
        balance: this.ledger.balance,
      });

      this.logger.debug('Balance synced', {
        total: this.ledger.balance.total.toString(),
        available: this.ledger.balance.available.toString(),
      });
    } catch (error) {
      this.logger.error('Failed to sync balance', { error });
    }
  }

  /**
   * Start periodic balance sync loop
   */
  private startBalanceSyncLoop(): void {
    if (this.balanceSyncInterval) {
      clearInterval(this.balanceSyncInterval);
    }

    this.balanceSyncInterval = setInterval(async () => {
      await this.syncBalance();
    }, this.config.balanceSyncInterval) as unknown as NodeJS.Timeout;
  }

  /**
   * Request token spend for compute task
   * Returns spending transaction if approved, null if using subscription or insufficient tokens
   */
  async requestTokenSpend(
    taskId: string,
    durationSeconds: number,
    hasSubscription: boolean
  ): Promise<TokenSpendingTransaction | null> {
    try {
      // If user has active subscription, use it first (subscription-first priority)
      if (hasSubscription) {
        this.logger.debug('Using subscription credits instead of tokens', {
          taskId,
        });
        return null;
      }

      // Calculate cost
      const minutes = Math.ceil(durationSeconds / 60);
      const estimatedCost =
        this.config.rateLimit.costPerMinute * BigInt(minutes);

      // Check daily limit
      if (
        this.ledger.spentToday + estimatedCost >
        this.config.rateLimit.dailyLimit
      ) {
        this.emit('dailyLimitExceeded', {
          spent: this.ledger.spentToday,
          limit: this.config.rateLimit.dailyLimit,
        });

        throw new Error(
          `Daily token limit exceeded: ${this.ledger.spentToday.toString()} + ${estimatedCost.toString()} > ${this.config.rateLimit.dailyLimit.toString()}`
        );
      }

      // Check balance
      if (this.ledger.balance.available < estimatedCost) {
        this.emit('insufficientBalance', {
          required: estimatedCost,
          available: this.ledger.balance.available,
        });

        throw new Error(
          `Insufficient token balance: required ${estimatedCost.toString()}, available ${this.ledger.balance.available.toString()}`
        );
      }

      // Create pending transaction
      const tx: TokenSpendingTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        taskId,
        amount: estimatedCost,
        durationSeconds,
        status: 'pending',
        createdAt: Date.now(),
      };

      // Lock tokens
      this.ledger.balance.locked += estimatedCost;
      this.ledger.balance.available -= estimatedCost;
      this.ledger.pendingTransactions.push(tx);

      this.emit('transactionSubmitted', { tx });

      this.logger.info('Token spend approved', {
        taskId,
        amount: estimatedCost.toString(),
        duration: durationSeconds,
      });

      return tx;
    } catch (error) {
      this.logger.error('Failed to request token spend', { error, taskId });
      throw error;
    }
  }

  /**
   * Execute token burn on-chain after task completion
   */
  async burnTokens(tx: TokenSpendingTransaction): Promise<void> {
    try {
      if (!this.tokenContract || tx.status !== 'pending') {
        throw new Error(
          `Cannot burn tokens: contract=${!this.tokenContract}, status=${
            tx.status
          }`
        );
      }

      this.logger.info('Burning tokens', {
        txId: tx.id,
        amount: tx.amount.toString(),
      });

      // Call burn function on contract
      const burnTx = await this.tokenContract.burn(tx.amount);
      const receipt = await burnTx.wait();

      tx.status = 'confirmed';
      tx.txHash = receipt.hash || burnTx.hash;
      tx.confirmedAt = Date.now();

      // Update ledger
      this.ledger.balance.locked -= tx.amount;
      this.ledger.spentToday += tx.amount;

      // Move from pending to completed
      this.ledger.pendingTransactions = this.ledger.pendingTransactions.filter(
        (p) => p.id !== tx.id
      );
      this.ledger.completedTransactions.push(tx);

      this.emit('transactionConfirmed', {
        tx,
        txHash: tx.txHash || '',
      });

      this.logger.info('Tokens burned successfully', {
        txId: tx.id,
        txHash: tx.txHash,
      });
    } catch (error) {
      tx.status = 'failed';
      tx.error = error instanceof Error ? error.message : String(error);

      // Unlock tokens on unmet expectations
      this.ledger.balance.locked -= tx.amount;
      this.ledger.balance.available += tx.amount;

      // Move from pending to failed
      this.ledger.pendingTransactions = this.ledger.pendingTransactions.filter(
        (p) => p.id !== tx.id
      );
      this.ledger.completedTransactions.push(tx);

      this.emit('transactionFailed', {
        tx,
        error: tx.error,
      });

      this.logger.error('Failed to burn tokens', { error, txId: tx.id });
      throw error;
    }
  }

  /**
   * Get current balance
   */
  getBalance(): TokenBalance {
    return this.ledger.balance;
  }

  /**
   * Get full ledger
   */
  getLedger(): TokenLedger {
    return this.ledger;
  }

  /**
   * Check if user can afford compute
   */
  canAffordCompute(durationSeconds: number): boolean {
    const minutes = Math.ceil(durationSeconds / 60);
    const cost = this.config.rateLimit.costPerMinute * BigInt(minutes);
    return this.ledger.balance.available >= cost;
  }

  /**
   * Get estimated cost for compute duration
   */
  getEstimatedCost(durationSeconds: number): bigint {
    const minutes = Math.ceil(durationSeconds / 60);
    return this.config.rateLimit.costPerMinute * BigInt(minutes);
  }

  /**
   * Register event listener
   */
  on<K extends TokenSpendingEventType>(
    event: K,
    listener: TokenSpendingEventListener<K>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners
      .get(event)!
      .add(listener as TokenSpendingEventListener<TokenSpendingEventType>);
  }

  /**
   * Unregister event listener
   */
  off<K extends TokenSpendingEventType>(
    event: K,
    listener: TokenSpendingEventListener<K>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(
        listener as TokenSpendingEventListener<TokenSpendingEventType>
      );
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit<K extends TokenSpendingEventType>(
    event: K,
    data: TokenSpendingEvent[K]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => listener(data));
    }
  }

  /**
   * Cleanup and stop sync
   */
  async stop(): Promise<void> {
    if (this.balanceSyncInterval) {
      clearInterval(this.balanceSyncInterval);
      this.balanceSyncInterval = null;
    }
    this.listeners.clear();
    this.logger.info('TokenSpendingManager stopped');
  }
}
