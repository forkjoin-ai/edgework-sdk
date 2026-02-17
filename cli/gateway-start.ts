#!/usr/bin/env bun
/**
 * Edgework Agent - Start Gateway
 */

import { GatewayConnector } from '../src/agent/GatewayConnector.js';
import { WalletManager } from '../src/agent/WalletManager.js';

const logger = {
  info: (msg: string, data?: any) => console.info(`ℹ️  ${msg}`, data),
  success: (msg: string, data?: any) => console.log(`✅ ${msg}`, data),
  error: (msg: string, data?: any) => console.error(`❌ ${msg}`, data),
};

async function main() {
  try {
    logger.info('Starting Edgework Gateway Connector...\n');

    // Load wallet
    const walletMgr = new WalletManager();
    const wallet = await walletMgr.loadWallet();

    if (!wallet) {
      logger.error(
        'Wallet not found. Run "bun run edgework-agent:setup" first.'
      );
      process.exit(1);
    }

    logger.success(`Using wallet: ${wallet.address}`);

    // Create connector
    const connector = new GatewayConnector({
      walletAddress: wallet.address,
    });

    // Connect and check status
    await connector.connect();
    logger.success('Connected to Optimism network');

    const status = await connector.getStatus();
    if (status) {
      logger.success('Gateway already registered', {
        address: status.gatewayAddress,
        isActive: status.isActive,
        computeUnits: status.totalComputeUnits,
      });
    } else {
      logger.info('Gateway not registered');
    }

    // Send heartbeat
    try {
      await connector.sendHeartbeat();
      logger.success('Heartbeat sent');
    } catch {
      logger.info(
        'Heartbeat failed (this is normal if gateway just registered)'
      );
    }

    // Keep running with periodic heartbeats
    logger.info('Gateway connector running. Press Ctrl+C to stop.\n');

    setInterval(async () => {
      try {
        await connector.sendHeartbeat();
        const status = await connector.getStatus();
        if (status) {
          console.log(
            `⏱️  Heartbeat sent | Rewards: ${status.pendingRewards} | Compute: ${status.totalComputeUnits}`
          );
        }
      } catch (error) {
        logger.error('Heartbeat error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60 * 60 * 1000); // Every hour

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\nShutting down...');
      await connector.disconnect();
      logger.success('Gateway connector stopped');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start gateway', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
