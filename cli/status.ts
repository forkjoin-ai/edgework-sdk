#!/usr/bin/env bun
/**
 * Edgework Agent - Status Command
 */

import { AgentManager } from '../src/agent/AgentManager.js';
import { WalletManager } from '../src/agent/WalletManager.js';
import path from 'path';

const logger = {
  info: (msg: string) => console.info(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
};

const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
const configPath = path.join(homeDir, '.edgework/agent-config.json');

async function main() {
  try {
    console.log('\n📊 Edgework Agent Status');
    console.log('========================\n');

    // Load manager
    const manager = new AgentManager({ configPath });
    await manager.initialize();
    const config = manager.getConfig();
    const stats = manager.getStats();

    // Load wallet
    const walletMgr = new WalletManager();
    const wallet = await walletMgr.loadWallet();

    // Configuration
    console.log('⚙️  Configuration:');
    logger.info(`Gateway Name: ${config.gateway.name}`);
    logger.info(`Region: ${config.gateway.region}`);
    logger.info(
      `CPU Allocation: ${(config.compute.cpuAllocation * 100).toFixed(0)}%`
    );
    logger.info(`Memory: ${config.compute.memoryMB}MB`);
    if (wallet) {
      logger.info(`Wallet: ${wallet.address}`);
    }

    console.log('\n📈 Performance:');
    logger.info(`Tasks Completed: ${stats.tasksCompleted}`);
    logger.info(
      `Total Compute Time: ${(stats.totalComputeTime / 60).toFixed(1)}m`
    );
    logger.info(`Estimated Earnings: $${stats.estimatedEarnings.toFixed(2)}`);
    logger.info(`Active Tasks: ${stats.activeTaskCount}`);

    console.log('\n🖥️  System:');
    logger.info(`Uptime: ${(stats.uptime / 60000).toFixed(1)}m`);
    logger.info(`CPU Usage: ${(stats.cpuUsage * 100).toFixed(1)}%`);
    logger.info(`Memory Usage: ${(stats.memoryUsage * 100).toFixed(1)}%`);

    console.log('\n🔧 System Integration:');
    logger.info(
      `System Tray: ${config.system.systemTray ? 'Enabled' : 'Disabled'}`
    );
    logger.info(
      `Boot Restart: ${config.system.runAtBoot ? 'Enabled' : 'Disabled'}`
    );

    console.log('\n💡 Quick Commands:');
    console.log('  bun run edgework-agent:start     - Start agent');
    console.log('  bun run edgework-gateway:start    - Start gateway');
    console.log('  bun run edgework-agent:stop       - Stop agent');
    console.log('  bun run edgework-agent:earnings   - View earnings');
    console.log('  bun run edgework-agent:setup      - Reconfigure\n');
  } catch (error) {
    console.error('❌ Failed to get status:', error);
    process.exit(1);
  }
}

main();
