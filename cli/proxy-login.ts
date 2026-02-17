#!/usr/bin/env bun
/**
 * Edgework Proxy Login
 *
 * Authenticates the user via their local wallet and stores the session token
 * for the proxy to use.
 */

import path from 'path';
import fs from 'fs/promises';
import { WalletManager } from '../src/agent/WalletManager';
import { OracleClient } from '../src/auth/oracle';

const ORACLE_ENDPOINT =
  process.env.ORACLE_ENDPOINT || 'https://oracle.edgework.ai';
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/root';
const CONFIG_DIR = path.join(HOME_DIR, '.edgework');
const SESSION_FILE = path.join(CONFIG_DIR, 'proxy-session.json');

async function main() {
  console.log('🔐 Edgework Proxy Authentication');
  console.log('------------------------------');

  try {
    // 1. Initialize Wallet
    const walletMgr = new WalletManager({ configDir: CONFIG_DIR });

    if (!(await walletMgr.walletExists())) {
      console.log('⚠️  No local wallet found.');
      console.log(
        '   Run "bun cli/setup.ts" first or standard setup to generate one.'
      );
      process.exit(1);
    }

    const wallet = await walletMgr.loadWallet();
    if (!wallet) {
      throw new Error('Failed to load wallet');
    }
    console.log(`👤 Using Wallet: ${wallet.address}`);

    // 2. Initialize Oracle Client
    // Implementation note: , you might want to use the real endpoint.
    // For local dev/testing without a real oracle running, we might need a mock mode
    // or just try to connect.
    // As per previous context, this might fail if the oracle isn't reachable.
    // We'll proceed assuming it's reachable or we catch the error.

    const oracle = new OracleClient({ endpoint: ORACLE_ENDPOINT });

    // 3. Challenge-Response Flow
    console.log('⏳ Authenticating with Oracle...');

    // Note: OracleClient implementation in codebase might vary from the plan
    // Checking src/auth/oracle.ts, it has getChallenge and verify.

    let challenge;
    try {
      const res = await oracle.getChallenge(wallet.address);
      challenge = res.challenge;
    } catch (e) {
      // Fallback for demo/offline if real oracle is required but not present?
      // User requested "Local" capability.
      // If offline, maybe we self-issue a token if in dev mode?
      // Current behavior: let's treat it as real.
      throw new Error(`Oracle unreachable: ${(e as Error).message}`);
    }

    // 4. Sign Challenge
    console.log('✍️  Signing challenge...');
    const signature = await walletMgr.sign(challenge);

    // 5. Verify & Get Session
    const verifyRes = await oracle.verify({
      address: wallet.address,
      challenge,
      signature,
      nonce: 'cli-login-' + Date.now(),
    });

    if (!verifyRes.valid || !verifyRes.session) {
      throw new Error('Verification failed: ' + verifyRes.error);
    }

    // 6. Save Session
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(
      SESSION_FILE,
      JSON.stringify(verifyRes.session, null, 2)
    );

    console.log(`✅ Login successful!`);
    console.log(`🔑 Session stored in: ${SESSION_FILE}`);
    console.log(`\nNow run: bun proxy:start`);
  } catch (err) {
    console.error('\n❌ Login failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
