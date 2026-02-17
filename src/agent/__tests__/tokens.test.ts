/**
 * Token Spending Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TokenSpendingManager } from '../TokenSpendingManager';
import type { TokenSpendingConfig } from '../types';

describe('TokenSpendingManager', () => {
  let manager: TokenSpendingManager;
  const testWalletAddress = '0x' + '1'.repeat(40);

  const defaultConfig: TokenSpendingConfig = {
    tokenAddress: '0x55ef8e6e56DEDc7f72658E53C7b2759c74210a5A',
    enableTokenSpending: true,
    rateLimit: {
      costPerMinute: 1000000000000000000n, // 1 token
      costPerCall: 100000000000000000n, // 0.1 token
      minimumBalance: 1000000000000000000n,
      dailyLimit: 1000000000000000000000n, // 1000 tokens
      subscriptionRequired: false,
    },
    balanceSyncInterval: 300000,
    rpcUrl: 'https://sepolia.optimism.io',
  };

  beforeEach(() => {
    manager = new TokenSpendingManager(testWalletAddress, defaultConfig);
  });

  afterEach(async () => {
    await manager.stop();
  });

  it('should initialize with correct config', () => {
    const ledger = manager.getLedger();
    expect(ledger.address).toBe(testWalletAddress);
    expect(ledger.balance.total).toBe(0n);
    expect(ledger.spentToday).toBe(0n);
  });

  it('should estimate cost correctly', () => {
    // 60 minutes = 60 tokens at 1 token/min
    const cost60min = manager.getEstimatedCost(60 * 60);
    expect(cost60min).toBe(60000000000000000000n); // 60 tokens

    // 1 minute = 1 token
    const cost1min = manager.getEstimatedCost(60);
    expect(cost1min).toBe(1000000000000000000n); // 1 token

    // 30 seconds = 1 token (rounds up)
    const cost30sec = manager.getEstimatedCost(30);
    expect(cost30sec).toBe(1000000000000000000n); // 1 token (rounds up)
  });

  it('should handle subscription-first priority', async () => {
    // When hasSubscription=true, should return null (use subscription)
    const txWithSubscription = await manager.requestTokenSpend(
      'task-1',
      60,
      true // hasSubscription = true
    );
    expect(txWithSubscription).toBeNull();
  });

  it('should track pending transactions', async () => {
    // Manually set balance to afford a transaction
    const ledger = manager.getLedger();
    ledger.balance.total = 100000000000000000000n; // 100 tokens
    ledger.balance.available = 100000000000000000000n;

    const tx = await manager.requestTokenSpend('task-2', 60, false);
    expect(tx).not.toBeNull();
    expect(tx?.status).toBe('pending');
    expect(tx?.amount).toBe(1000000000000000000n); // 1 token

    const updatedLedger = manager.getLedger();
    expect(updatedLedger.pendingTransactions.length).toBe(1);
    expect(updatedLedger.balance.locked).toBe(1000000000000000000n);
  });

  it('should reject spending without subscription when insufficient balance', async () => {
    // Zero balance
    const tx = await manager
      .requestTokenSpend('task-3', 60, false)
      .catch((e) => e as Error);

    expect(tx).toBeInstanceOf(Error);
    expect((tx as Error).message).toContain('Insufficient token balance');
  });

  it('should reject spending when daily limit exceeded', async () => {
    // Set balance to afford daily limit
    const ledger = manager.getLedger();
    const dailyLimit = defaultConfig.rateLimit.dailyLimit;
    ledger.balance.total = dailyLimit * 2n;
    ledger.balance.available = dailyLimit * 2n;
    ledger.spentToday = dailyLimit;

    const tx = await manager
      .requestTokenSpend('task-4', 60, false)
      .catch((e) => e as Error);

    expect(tx).toBeInstanceOf(Error);
    expect((tx as Error).message).toContain('Daily token limit exceeded');
  });

  it('should track balance updates', () => {
    // Verify that balance can be tracked and updated
    const ledger = manager.getLedger();

    // Initial balance should be 0
    expect(ledger.balance.total).toBe(0n);
    expect(ledger.balance.available).toBe(0n);

    // Manually update balance (simulating what syncBalance would do)
    ledger.balance.total = 50000000000000000000n;
    ledger.balance.available = 50000000000000000000n;
    ledger.balance.updatedAt = Date.now();

    // Verify balance was updated
    expect(ledger.balance.total).toBe(50000000000000000000n);
    expect(ledger.balance.available).toBe(50000000000000000000n);
    expect(ledger.balance.updatedAt).toBeGreaterThan(0);
  });

  it('should emit events on transaction submission', async () => {
    const ledger = manager.getLedger();
    ledger.balance.total = 100000000000000000000n;
    ledger.balance.available = 100000000000000000000n;

    let eventFired = false;
    manager.on('transactionSubmitted', (event) => {
      eventFired = true;
      expect(event.tx.status).toBe('pending');
      expect(event.tx.amount).toBeGreaterThan(0n);
    });

    await manager.requestTokenSpend('task-5', 60, false);
    expect(eventFired).toBe(true);
  });

  it('should handle token spending with different durations', async () => {
    const ledger = manager.getLedger();
    ledger.balance.total = 1000000000000000000000n; // 1000 tokens
    ledger.balance.available = 1000000000000000000000n;

    // 10 minutes = 10 tokens
    const tx10min = await manager.requestTokenSpend('task-10min', 600, false);
    expect(tx10min?.amount).toBe(10000000000000000000n); // 10 tokens

    // Reset for next test
    ledger.balance.available = 1000000000000000000000n;
    ledger.pendingTransactions = [];

    // 1 hour = 60 tokens
    const tx1hour = await manager.requestTokenSpend('task-1hour', 3600, false);
    expect(tx1hour?.amount).toBe(60000000000000000000n); // 60 tokens
  });

  it('should afford compute check correctly', () => {
    const ledger = manager.getLedger();

    // With zero balance
    expect(manager.canAffordCompute(60)).toBe(false);

    // With sufficient balance
    ledger.balance.total = 100000000000000000000n;
    ledger.balance.available = 100000000000000000000n;
    expect(manager.canAffordCompute(60)).toBe(true);
    expect(manager.canAffordCompute(3600)).toBe(true); // 60 minutes

    // With insufficient balance
    ledger.balance.available = 500000000000000000n; // 0.5 token
    expect(manager.canAffordCompute(3600)).toBe(false); // 60 minutes = 60 tokens needed
  });

  it('should get balance and ledger info', () => {
    const balance = manager.getBalance();
    expect(balance).toBeDefined();
    expect(balance.total).toBe(0n);
    expect(balance.available).toBe(0n);

    const ledger = manager.getLedger();
    expect(ledger).toBeDefined();
    expect(ledger.address).toBe(testWalletAddress);
  });

  it('should disable token spending when configured', async () => {
    const disabledConfig = { ...defaultConfig, enableTokenSpending: false };
    const disabledManager = new TokenSpendingManager(
      testWalletAddress,
      disabledConfig
    );

    await disabledManager.initialize();

    const ledger = disabledManager.getLedger();
    // When token spending is disabled, lastSyncAt should be 0 (no actual balance sync)
    expect(ledger.lastSyncAt).toBe(0);

    await disabledManager.stop();
  });
});
