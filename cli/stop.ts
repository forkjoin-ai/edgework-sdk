#!/usr/bin/env bun
/**
 * Edgework Agent - Stop Command
 */

import fs from 'fs/promises';
import path from 'path';

const logger = {
  info: (msg: string) => console.info(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  error: (msg: string) => console.error(`❌ ${msg}`),
};

async function main() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
    const pidFile = path.join(homeDir, '.edgework/agent.pid');

    // Try to read PID file
    try {
      const pid = await fs.readFile(pidFile, 'utf-8');
      const processId = parseInt(pid.trim());

      if (Number.isNaN(processId)) {
        logger.error('Invalid PID in file');
        process.exit(1);
      }

      // Kill the process
      process.kill(processId, 'SIGTERM');
      logger.success(`Agent stopped (PID ${processId})`);

      // Clean up PID file
      try {
        await fs.unlink(pidFile);
      } catch {
        // Ignore if file can't be deleted
      }
    } catch {
      logger.error('Agent is not running');
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Failed to stop agent: ${error}`);
    process.exit(1);
  }
}

main();
