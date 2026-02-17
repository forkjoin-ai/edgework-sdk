/**
 * Agent Development Kit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AgentManager } from '../AgentManager';
import { WalletManager } from '../WalletManager';
import { ComputeNode } from '../ComputeNode';

describe('WalletManager', () => {
  let walletMgr: WalletManager;

  beforeEach(() => {
    walletMgr = new WalletManager();
  });

  it('should generate a wallet', async () => {
    const wallet = await walletMgr.generateWallet();

    expect(wallet.address).toBeDefined();
    expect(wallet.address).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(wallet.privateKey).toBeDefined();
    expect(wallet.privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(wallet.isLocal).toBe(true);
  });

  it('should have encryptionKey', async () => {
    const wallet = await walletMgr.generateWallet();
    expect(wallet.encryptionKey).toBeDefined();
    expect(wallet.encryptionKey).toHaveLength(64); // SHA256 hex
  });

  it('should check if wallet exists', async () => {
    const exists = await walletMgr.walletExists();
    expect(typeof exists).toBe('boolean');
  });

  it('should get address', async () => {
    const wallet = await walletMgr.generateWallet();
    const address = walletMgr.getAddress();
    expect(address).toBe(wallet.address);
  });

  it('should check if wallet is loaded', async () => {
    const wallet = await walletMgr.generateWallet();
    expect(walletMgr.isLoaded()).toBe(true);
  });
});

describe('ComputeNode', () => {
  let node: ComputeNode;

  beforeEach(() => {
    node = new ComputeNode({
      gatewayUrl: 'http://localhost:8080',
      cpuAllocation: 0.5,
      memoryMB: 1024,
      maxTaskDuration: 300,
    });
  });

  it('should initialize with config', () => {
    const stats = node.getStats();

    expect(stats).toEqual({
      tasksCompleted: 0,
      totalComputeTime: 0,
      estimatedEarnings: 0,
      activeTaskCount: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      uptime: 0,
    });
  });

  it('should track stats', () => {
    const stats = node.getStats();
    expect(stats.tasksCompleted).toBe(0);

    // Stats would normally be updated by processing tasks
    // For testing, we just verify the structure
    expect(stats).toHaveProperty('tasksCompleted');
    expect(stats).toHaveProperty('totalComputeTime');
    expect(stats).toHaveProperty('estimatedEarnings');
  });
});

describe('AgentManager', () => {
  let manager: AgentManager;

  beforeEach(async () => {
    // Use a unique config path per test to avoid interference
    const testConfigPath = `/tmp/edgework-test-${Date.now()}.json`;
    manager = new AgentManager({
      configPath: testConfigPath,
      gatewayName: 'Test Agent',
      cpuAllocation: 0.5,
      enableTokenSpending: false,
    });
  });

  it('should initialize', async () => {
    await manager.initialize();
    const config = manager.getConfig();

    expect(config.gateway.name).toBe('Test Agent');
    expect(config.compute.cpuAllocation).toBe(0.5);
  });

  it('should have default config', () => {
    const config = manager.getConfig();

    expect(config.gateway).toBeDefined();
    expect(config.compute).toBeDefined();
    expect(config.system).toBeDefined();
  });

  it('should get empty stats when not running', () => {
    const stats = manager.getStats();

    expect(stats.tasksCompleted).toBe(0);
    expect(stats.totalComputeTime).toBe(0);
    expect(stats.estimatedEarnings).toBe(0);
  });

  it('should support event listeners', async () => {
    await manager.initialize();

    const events: any[] = [];

    manager.on('statsUpdated', (e: any) => {
      events.push(e);
    });

    // Would emit when running, but for testing we just verify listener registration works
    expect(events).toHaveLength(0);
  });

  it('should update config', async () => {
    await manager.initialize();

    await manager.updateConfig({
      compute: {
        cpuAllocation: 0.7,
        memoryMB: 2048,
        maxTaskDuration: 600,
        enableGPU: true,
      },
    });

    const config = manager.getConfig();
    expect(config.compute.cpuAllocation).toBe(0.7);
    expect(config.compute.memoryMB).toBe(2048);
  });
});
