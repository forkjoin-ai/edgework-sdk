#!/usr/bin/env bun
/**
 * Edgework Agent - Start Agent
 */

import { AgentManager } from '../src/agent/AgentManager.js';
import { createSystemTray } from '../src/agent/SystemTray.js';
import fs from 'fs/promises';
import path from 'path';

const logger = {
  info: (msg: string, data?: any) => console.info(`ℹ️  ${msg}`, data),
  success: (msg: string, data?: any) => console.log(`✅ ${msg}`, data),
  error: (msg: string, data?: any) => console.error(`❌ ${msg}`, data),
  debug: (msg: string, data?: any) =>
    process.env.DEBUG && console.debug(`🐛 ${msg}`, data),
};

const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
const configPath = path.join(homeDir, '.edgework/agent-config.json');

async function main() {
  try {
    logger.info('Starting Edgework Agent...\n');

    // Create agent manager
    const manager = new AgentManager({
      configPath,
    });

    // Initialize
    await manager.initialize();
    const config = manager.getConfig();

    logger.success('Agent initialized', {
      gateway: config.gateway.name,
      cpuAllocation: `${(config.compute.cpuAllocation * 100).toFixed(0)}%`,
    });

    // Setup system tray if enabled
    if (config.system.systemTray) {
      try {
        const tray = createSystemTray({ agentManager: manager });
        await tray.show();
        logger.success('System tray enabled');

        // Update stats every 10 seconds
        setInterval(() => tray.updateStats(), 10000);
      } catch (error) {
        logger.debug('System tray not available', { error });
      }
    }

    // Setup event listeners
    manager.on('started', () => {
      logger.success('Agent started');
    });

    manager.on('stopped', ({ reason }) => {
      logger.info(`Agent stopped: ${reason}`);
    });

    manager.on('statsUpdated', ({ stats }) => {
      logger.debug('Stats updated', {
        tasks: stats.tasksCompleted,
        earnings: `$${stats.estimatedEarnings.toFixed(2)}`,
        uptime: `${(stats.uptime / 60000).toFixed(1)}m`,
      });
    });

    manager.on('error', ({ error, context }) => {
      logger.error(`Error in ${context}`, { error: error.message });
    });

    // Start agent
    await manager.start();

    logger.info('Agent running. Press Ctrl+C to stop.\n');
    logger.info('Status updates:');

    // Print stats every minute
    setInterval(() => {
      const stats = manager.getStats();
      console.log(`\n⏱️  [${new Date().toLocaleTimeString()}]`);
      console.log(`   Tasks: ${stats.tasksCompleted}`);
      console.log(`   Time: ${(stats.totalComputeTime / 60).toFixed(1)}m`);
      console.log(`   Earnings: $${stats.estimatedEarnings.toFixed(2)}`);
      console.log(`   Active: ${stats.activeTaskCount}`);
      console.log(`   Uptime: ${(stats.uptime / 60000).toFixed(1)}m`);
    }, 60000);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\nShutting down gracefully...');
      await manager.stop('User requested');
      logger.success('Agent stopped');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received terminate signal');
      await manager.stop('System requested');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start agent', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
