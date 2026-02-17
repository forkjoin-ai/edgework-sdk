#!/usr/bin/env bun
/**
 * Edgework Agent - Earnings Command
 */

import { AgentManager } from '../src/agent/AgentManager.js';
import { GatewayConnector } from '../src/agent/GatewayConnector.js';
import { WalletManager } from '../src/agent/WalletManager.js';
import path from 'path';

const logger = {
  info: (msg: string) => console.info(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  error: (msg: string) => console.error(`❌ ${msg}`),
};

const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
const configPath = path.join(homeDir, '.edgework/agent-config.json');

async function main() {
  try {
    console.log('\n💰 Edgework Agent Earnings');
    console.log('===========================\n');

    // Load manager for local stats
    const manager = new AgentManager({ configPath });
    await manager.initialize();
    const stats = manager.getStats();

    // Load wallet for on-chain lookup
    const walletMgr = new WalletManager();
    const wallet = await walletMgr.loadWallet();

    if (!wallet) {
      logger.error('Wallet not found');
      process.exit(1);
    }

    console.log('📊 Local Earnings:');
    logger.info(`Estimated (Local): $${stats.estimatedEarnings.toFixed(2)}`);
    logger.info(`Tasks Completed: ${stats.tasksCompleted}`);
    logger.info(`Compute Time: ${(stats.totalComputeTime / 60).toFixed(1)}m`);

    // Get on-chain rewards
    console.log('\n⛓️  On-Chain Rewards:');
    try {
      const connector = new GatewayConnector({ walletAddress: wallet.address });
      await connector.connect();
      const status = await connector.getStatus();

      if (status) {
        logger.info(`Pending Rewards: ${status.pendingRewards} EDGEWORK`);
        logger.info(`Claimed Rewards: ${status.claimedRewards} EDGEWORK`);
        logger.info(
          `Total: ${status.pendingRewards + status.claimedRewards} EDGEWORK`
        );
      } else {
        logger.info('Gateway not registered yet');
      }

      await connector.disconnect();
    } catch (error) {
      logger.error(`Failed to fetch on-chain rewards: ${error}`);
    }

    console.log('\n💡 Tips:');
    console.log('  • Rewards are updated by the oracle every hour');
    console.log('  • Local estimate is higher due to pending verification');
    console.log('  • Claim rewards through the Edgework dashboard\n');
  } catch (error) {
    logger.error(`Failed to get earnings: ${error}`);
    process.exit(1);
  }
}

main();
