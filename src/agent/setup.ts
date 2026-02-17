/**
 * Interactive Setup Command
 * eslint-disable luxury-ui/no-emojis
 */

import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import type { AgentConfig } from './types';
import { AgentManager } from './AgentManager';
import { WalletManager } from './WalletManager';
import { GatewayConnector } from './GatewayConnector';

interface SetupAnswers {
  createWallet: boolean;
  gatewayName: string;
  region: string;
  cpuAllocation: number;
  enableSystemTray: boolean;
  runAtBoot: boolean;
}

/**
 * Interactive setup wizard
 */
export async function runSetupWizard(
  nonInteractive = false
): Promise<SetupAnswers> {
  const logger = {
    log: (msg: string) => console.log(msg),
    info: (msg: string) => console.info(`INFO: ${msg}`),
    warn: (msg: string) => console.warn(`WARN: ${msg}`),
    success: (msg: string) => console.log(`SUCCESS: ${msg}`),
    error: (msg: string) => console.error(`ERROR: ${msg}`),
  };

  logger.log('\nEdgework Agent Setup Wizard');
  logger.log('================================\n');

  if (nonInteractive) {
    logger.log('Running in non-interactive mode with defaults...\n');

    // Ensure wallet exists in non-interactive mode
    const walletMgr = new WalletManager();
    if (!(await walletMgr.walletExists())) {
      logger.info('Generating new wallet (non-interactive)...');
      await walletMgr.generateWallet();
      await walletMgr.saveWallet();
      logger.success('Wallet created.');
    } else {
      logger.info('Using existing wallet.');
    }

    return {
      createWallet: true,
      gatewayName: 'Edgework Agent',
      region: 'auto',
      cpuAllocation: 0.8,
      enableSystemTray: false,
      runAtBoot: false,
    };
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  try {
    // Wallet creation
    logger.log('Wallet Setup');
    logger.log('---------------');
    logger.log(
      'The agent needs a wallet to register with the gateway on Optimism.'
    );
    logger.log(
      'Keys are stored locally (encrypted with device-specific encryption).\n'
    );

    const walletMgr = new WalletManager();
    const walletExists = await walletMgr.walletExists();

    let createWallet = true;
    if (walletExists) {
      const reuse = await question('✓ Wallet already exists. Use it? (y/n): ');
      createWallet = reuse.toLowerCase() !== 'n';
    } else {
      const create = await question('✓ Create new wallet? (y/n, default: y): ');
      createWallet = create.toLowerCase() !== 'n';
    }

    if (createWallet && !walletExists) {
      logger.info('Generating new wallet...');
      const newWallet = await walletMgr.generateWallet();
      await walletMgr.saveWallet();
      logger.success(`Wallet created: ${newWallet.address}`);
    } else if (walletExists && createWallet) {
      const wallet = await walletMgr.loadWallet();
      if (wallet) {
        logger.success(`Using wallet: ${wallet.address}`);
      }
    }

    logger.log('\n');

    // Gateway configuration
    logger.log('Gateway Configuration');
    logger.log('-----------------------');

    const gatewayNameInput = await question(
      '✓ Gateway name (default: Edgework Agent): '
    );
    const gatewayName = gatewayNameInput || 'Edgework Agent';

    const regionInput = await question(
      '✓ Region (us-west, eu-central, us-east, auto): '
    );
    const region = regionInput || 'auto';

    logger.log('\n');

    // Compute allocation
    logger.log('Compute Allocation');
    logger.log('--------------------');

    const cpuInput = await question(
      '✓ CPU allocation percentage (1-100, default: 80): '
    );
    const cpuAllocation = Math.min(
      100,
      Math.max(1, parseInt(cpuInput || '80') / 100)
    );

    const gpu = await question(
      '✓ Enable GPU acceleration? (y/n, default: y): '
    );
    const enableGPU = gpu.toLowerCase() !== 'n';

    const webnn = await question(
      '✓ Enable WebNN acceleration? (y/n, default: y): '
    );
    const enableWebNN = webnn.toLowerCase() !== 'n';

    logger.log('\n');

    // System integration
    logger.log('System Integration');
    logger.log('--------------------');

    const tray = await question(
      '✓ Enable system tray icon? (y/n, default: n): '
    );
    const enableSystemTray = tray.toLowerCase() === 'y';

    const boot = await question(
      '✓ Run agent at system boot? (y/n, default: n): '
    );
    const runAtBoot = boot.toLowerCase() === 'y';

    if (runAtBoot) {
      logger.warn(
        'Boot persistence requires elevated privileges (will prompt if needed)'
      );
    }

    logger.log('\n');

    // Summary
    logger.log('Configuration Summary');
    logger.log('-----------------------');
    logger.log(`Gateway Name: ${gatewayName}`);
    logger.log(`Region: ${region}`);
    logger.log(`CPU Allocation: ${(cpuAllocation * 100).toFixed(0)}%`);
    logger.log(`GPU: ${enableGPU ? 'Enabled' : 'Disabled'}`);
    logger.log(`WebNN: ${enableWebNN ? 'Enabled' : 'Disabled'}`);
    logger.log(`System Tray: ${enableSystemTray ? 'Enabled' : 'Disabled'}`);
    logger.log(`Boot Restart: ${runAtBoot ? 'Enabled' : 'Disabled'}`);
    logger.log('\n');

    const confirm = await question(
      '✓ Continue with this configuration? (y/n): '
    );

    if (confirm.toLowerCase() !== 'y') {
      logger.log('Setup cancelled.');
      rl.close();
      process.exit(0);
    }

    rl.close();

    return {
      createWallet,
      gatewayName,
      region,
      cpuAllocation,
      enableSystemTray,
      runAtBoot,
    };
  } finally {
    rl.close();
  }
}

/**
 * Save configuration and complete setup
 */
export async function completeSetup(answers: SetupAnswers): Promise<void> {
  const logger = {
    log: (msg: string) => console.log(msg),
    info: (msg: string) => console.info(`INFO: ${msg}`),
    warn: (msg: string) => console.warn(`WARN: ${msg}`),
    success: (msg: string) => console.log(`SUCCESS: ${msg}`),
    error: (msg: string) => console.error(`ERROR: ${msg}`),
  };

  try {
    logger.log('\n');
    logger.info('Completing setup...\n');

    // Load wallet
    const walletMgr = new WalletManager();
    const wallet = await walletMgr.loadWallet();
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Create agent manager
    const manager = new AgentManager({
      gatewayName: answers.gatewayName,
      walletAddress: wallet.address,
      cpuAllocation: answers.cpuAllocation,
      enableSystemTray: answers.enableSystemTray,
      runAtBoot: answers.runAtBoot,
    });

    await manager.initialize();
    logger.success('Agent manager initialized');

    // Connect to gateway
    const gatewayConnector = new GatewayConnector({
      walletAddress: wallet.address,
    });

    await gatewayConnector.connect();
    logger.success('Connected to Optimism');

    // Register gateway
    let registration;
    try {
      registration = await gatewayConnector.register({
        name: answers.gatewayName,
        region: answers.region,
        walletAddress: wallet.address,
        metadata: {
          cpuAllocation: answers.cpuAllocation,
          gpu: answers.region !== 'auto',
        },
      });
    } catch (error: any) {
      if (
        error.code === 'INSUFFICIENT_FUNDS' ||
        error.message?.includes('insufficient funds')
      ) {
        logger.warn(
          'Insufficient funds for direct registration. Attempting gas-sponsored registration...'
        );
        const RELAYER_URL =
          process.env.EDGEWORK_RELAYER_URL ||
          'https://api.edgework.ai/v1/relayer/register';

        registration = await gatewayConnector.registerViaRelayer(RELAYER_URL, {
          name: answers.gatewayName,
          region: answers.region,
          walletAddress: wallet.address,
          metadata: {
            cpuAllocation: answers.cpuAllocation,
            gpu: answers.region !== 'auto',
          },
        });
      } else {
        throw error;
      }
    }

    logger.success('Gateway registered at ' + registration.gatewayAddress);

    // Setup boot persistence if requested
    if (answers.runAtBoot) {
      await setupBootPersistence();
      logger.success('Boot persistence enabled');
    }

    logger.log('\n');
    logger.info('Setup complete!\n');
    logger.log('Next steps:');
    logger.log('1. Start the gateway: bun run edgework-gateway:start');
    logger.log('2. Start the agent: bun run edgework-agent:start');
    logger.log('3. View status: bun run edgework-agent:status\n');
  } catch (error) {
    logger.error(`Setup failed: ${error}`);
    process.exit(1);
  }
}

/**
 * Setup boot persistence
 */
async function setupBootPersistence(): Promise<void> {
  const platform = process.platform;

  if (platform === 'darwin') {
    await setupMacOSLaunchd();
  } else if (platform === 'linux') {
    await setupLinuxSystemd();
  } else if (platform === 'win32') {
    await setupWindowsTaskScheduler();
  }
}

/**
 * Setup macOS launchd
 */
async function setupMacOSLaunchd(): Promise<void> {
  const homeDir = process.env.HOME || '/root';
  const plistPath = path.join(
    homeDir,
    'Library/LaunchAgents/ai.edgework.agent.plist'
  );

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.edgework.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>bun</string>
    <string>run</string>
    <string>edgework-agent:start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${homeDir}/.edgework/logs/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${homeDir}/.edgework/logs/agent-error.log</string>
</dict>
</plist>`;

  const dir = path.dirname(plistPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(plistPath, plistContent);
}

/**
 * Setup Linux systemd
 */
async function setupLinuxSystemd(): Promise<void> {
  const homeDir = process.env.HOME || '/root';
  const serviceDir = path.join(homeDir, '.config/systemd/user');
  const servicePath = path.join(serviceDir, 'edgework-agent.service');

  const serviceContent = `[Unit]
Description=Edgework Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env bun run edgework-agent:start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target`;

  await fs.mkdir(serviceDir, { recursive: true });
  await fs.writeFile(servicePath, serviceContent);

  console.log(`Service file created at ${servicePath}`);
  console.log('To enable:');
  console.log('  systemctl --user enable edgework-agent.service');
  console.log('  systemctl --user start edgework-agent.service');
}

/**
 * Setup Windows Task Scheduler
 */
async function setupWindowsTaskScheduler(): Promise<void> {
  // Note: This requires Windows 10+ and elevated privileges
  // The actual implementation would use Windows API or PowerShell

  const taskName = 'EdgeworkAgent';
  const taskCmd = `bun run edgework-agent:start`;

  console.log(`To setup task scheduler, run as Administrator:`);
  console.log(
    `schtasks /create /tn "${taskName}" /tr "${taskCmd}" /sc onlogon`
  );
}
