#!/usr/bin/env bun

/**
 * Edgework Agent - Token Spending CLI
 * Show balance, spending history, burn tokens, estimate costs
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { TokenSpendingManager } from '../src/agent/TokenSpendingManager';

interface Config {
  wallet?: { address: string };
  compute?: {
    enableTokenSpending?: boolean;
    tokenAddress?: string;
    tokenCostPerMinute?: string;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'balance';

  try {
    // Load config
    const configPath = join(homedir(), '.edgework', 'agent-config.json');
    let config: Config = {};

    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // Config file not found, continue with defaults
    }

    const walletAddress = config.wallet?.address || process.env.WALLET_ADDRESS;
    if (!walletAddress) {
      console.error(
        '❌ Wallet address not configured. Run `agent:setup` first.'
      );
      process.exit(1);
    }

    // Create token spending manager
    const tokenCostPerMinute = config.compute?.tokenCostPerMinute
      ? BigInt(config.compute.tokenCostPerMinute)
      : 1000000000000000000n; // 1 token/min default

    const manager = new TokenSpendingManager(walletAddress, {
      tokenAddress:
        config.compute?.tokenAddress ||
        '0x55ef8e6e56DEDc7f72658E53C7b2759c74210a5A',
      enableTokenSpending: config.compute?.enableTokenSpending !== false,
      rateLimit: {
        costPerMinute: tokenCostPerMinute,
        costPerCall: 100000000000000000n, // 0.1 token/call
        minimumBalance: 1000000000000000000n, // 1 token
        dailyLimit: 1000000000000000000000n, // 1000 tokens
        subscriptionRequired: false,
      },
      balanceSyncInterval: 300000, // 5 minutes
      rpcUrl: 'https://sepolia.optimism.io',
    });

    await manager.initialize();

    switch (command) {
      case 'balance':
        showBalance(manager);
        break;

      case 'history':
        showHistory(manager);
        break;

      case 'estimate': {
        const minutes = parseInt(args[1] || '60');
        showEstimate(manager, minutes);
        break;
      }

      case 'info':
        showInfo(manager, walletAddress);
        break;

      default:
        showHelp();
    }

    await manager.stop();
  } catch (error) {
    console.error(
      '❌ Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

function showBalance(manager: TokenSpendingManager) {
  const balance = manager.getBalance();
  const total = Number(balance.total) / 1e18; // Convert from wei
  const available = Number(balance.available) / 1e18;
  const locked = Number(balance.locked) / 1e18;

  console.log('\n📊 EDGEWORK Token Balance');
  console.log('─'.repeat(50));
  console.log(`  Total:     ${total.toFixed(4)} EDGEWORK`);
  console.log(`  Available: ${available.toFixed(4)} EDGEWORK`);
  console.log(`  Locked:    ${locked.toFixed(4)} EDGEWORK`);
  console.log(
    `  Last Updated: ${new Date(balance.updatedAt).toLocaleString()}`
  );
  console.log('─'.repeat(50) + '\n');
}

function showHistory(manager: TokenSpendingManager) {
  const ledger = manager.getLedger();
  const spentToday = Number(ledger.spentToday) / 1e18;

  console.log('\n📜 Token Spending History');
  console.log('─'.repeat(50));

  if (ledger.completedTransactions.length === 0) {
    console.log('  No completed transactions yet.');
  } else {
    console.log(`  Spent Today: ${spentToday.toFixed(4)} EDGEWORK\n`);

    ledger.completedTransactions.slice(-5).forEach((tx) => {
      const amount = Number(tx.amount) / 1e18;
      const date = new Date(tx.createdAt).toLocaleTimeString();
      const status =
        tx.status === 'confirmed'
          ? '✓ Confirmed'
          : tx.status === 'failed'
          ? '✗ Failed'
          : '⏳ Pending';

      console.log(`  ${date} - ${amount.toFixed(4)} EDGEWORK - ${status}`);
      if (tx.txHash) {
        console.log(`           TX: ${tx.txHash.slice(0, 10)}...`);
      }
    });
  }

  if (ledger.pendingTransactions.length > 0) {
    console.log(`\n  ⏳ Pending (${ledger.pendingTransactions.length}):`);
    ledger.pendingTransactions.forEach((tx) => {
      const amount = Number(tx.amount) / 1e18;
      console.log(`     ${amount.toFixed(4)} EDGEWORK (Task: ${tx.taskId})`);
    });
  }

  console.log('─'.repeat(50) + '\n');
}

function showEstimate(manager: TokenSpendingManager, minutes: number) {
  const seconds = minutes * 60;
  const cost = manager.getEstimatedCost(seconds);
  const costTokens = Number(cost) / 1e18;
  const balance = manager.getBalance();
  const available = Number(balance.available) / 1e18;
  const canAfford = available >= costTokens;

  console.log('\n💰 Compute Cost Estimate');
  console.log('─'.repeat(50));
  console.log(`  Duration:     ${minutes} minutes`);
  console.log(`  Estimated Cost: ${costTokens.toFixed(4)} EDGEWORK`);
  console.log(`  Your Balance:  ${available.toFixed(4)} EDGEWORK`);
  console.log(
    `  Status:        ${canAfford ? '✓ Can Afford' : '✗ Insufficient Balance'}`
  );
  console.log('─'.repeat(50) + '\n');
}

function showInfo(manager: TokenSpendingManager, walletAddress: string) {
  const balance = manager.getBalance();
  const ledger = manager.getLedger();
  const total = Number(balance.total) / 1e18;
  const available = Number(balance.available) / 1e18;
  const spentToday = Number(ledger.spentToday) / 1e18;

  console.log('\n📋 Token Spending Information');
  console.log('─'.repeat(50));
  console.log(
    `  Wallet:        ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  );
  console.log(`  Total Balance: ${total.toFixed(4)} EDGEWORK`);
  console.log(`  Available:     ${available.toFixed(4)} EDGEWORK`);
  console.log(`  Spent Today:   ${spentToday.toFixed(4)} EDGEWORK`);
  console.log(`  Pending Txs:   ${ledger.pendingTransactions.length}`);
  console.log(`  Completed:     ${ledger.completedTransactions.length}`);
  console.log('─'.repeat(50) + '\n');
}

function showHelp() {
  console.log('\n🔗 Edgework Agent - Token Spending Commands');
  console.log('─'.repeat(50));
  console.log('  agent:tokens balance       Show current token balance');
  console.log('  agent:tokens history       Show spending history');
  console.log('  agent:tokens estimate <m>  Estimate cost for N minutes');
  console.log('  agent:tokens info          Show detailed token info');
  console.log('─'.repeat(50) + '\n');
}

main();
