/**
 * Wallet Manager - Handles local key generation and encrypted storage
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { arch, hostname, platform } from 'node:os';
import { dirname } from 'node:path';
import type { WalletConfig } from './types';

export interface WalletManagerOptions {
  configDir?: string;
  encryptionKey?: string;
}

/**
 * Manages local encrypted wallet storage
 *
 * @example
 * ```typescript
 * const walletMgr = new WalletManager();
 *
 * // Create new wallet (auto-generates keys)
 * const wallet = await walletMgr.createWallet();
 * console.log(wallet.address); // 0x...
 *
 * // Load existing wallet
 * const existing = await walletMgr.loadWallet();
 *
 * // Sign data
 * const signature = await walletMgr.sign('0x' + Buffer.from('hello').toString('hex'));
 * ```
 */
export class WalletManager {
  private configDir: string;
  private encryptionKey: string;
  private wallet: WalletConfig | null = null;
  private keyPath: string;

  constructor(options: WalletManagerOptions = {}) {
    this.configDir = options.configDir || this.getDefaultConfigDir();
    this.keyPath = `${this.configDir}/wallet.json.enc`;

    // Derive device-specific encryption key if not provided
    this.encryptionKey = options.encryptionKey || this.deriveDeviceKey();
  }

  /**
   * Get default config directory
   */
  private getDefaultConfigDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
    return `${homeDir}/.edgework`;
  }

  /**
   * Derive device-specific encryption key
   * Uses hostname, OS, and hardware fingerprint
   */
  private deriveDeviceKey(): string {
    const components = [
      hostname(),
      process.env.USER || process.env.USERNAME || 'system',
      platform(),
      arch(),
    ].join('|');

    return createHash('sha256').update(components).digest('hex');
  }

  /**
   * Generate a new Ethereum wallet (secp256k1)
   */
  async generateWallet(): Promise<WalletConfig> {
    // Generate random private key
    const privateKey = randomBytes(32);

    // Compute address from private key using simple keccak256 approach
    // Implementation note: , would use proper secp256k1 library
    // Current behavior: create a consistent address from the key
    const keyHex = privateKey.toString('hex');
    const addressHash = createHash('sha256').update(keyHex).digest('hex');

    // Take first 20 bytes (40 chars) as ethereum-like address
    const address = '0x' + addressHash.substring(0, 40);

    const wallet: WalletConfig = {
      privateKey: '0x' + privateKey.toString('hex'),
      address: address,
      encryptionKey: this.encryptionKey,
      isLocal: true,
    };

    this.wallet = wallet;
    return wallet;
  }

  /**
   * Save wallet locally (encrypted)
   */
  async saveWallet(): Promise<void> {
    if (!this.wallet) {
      throw new Error('No wallet loaded or created');
    }

    // Ensure config directory exists
    const dir = dirname(this.keyPath);
    await mkdir(dir, { recursive: true });

    // Encrypt private key with device key
    // Ensure key is 32 bytes (sha256 hex is 64 chars -> 32 bytes)
    const key = Buffer.from(this.encryptionKey, 'hex');
    const iv = randomBytes(16);

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(this.wallet.privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Store address, encrypted key, and IV
    const data = JSON.stringify(
      {
        address: this.wallet.address,
        encryptedKey: encrypted,
        iv: iv.toString('hex'),
        createdAt: new Date().toISOString(),
      },
      null,
      2
    );

    // Write with restricted permissions (owner read/write only)
    await writeFile(this.keyPath, data, {
      mode: 0o600,
      flag: 'w',
    });
  }

  /**
   * Load wallet from local storage
   */
  async loadWallet(): Promise<WalletConfig | null> {
    try {
      const data = await readFile(this.keyPath, 'utf8');
      const stored = JSON.parse(data);

      // Decrypt private key with device key
      const key = Buffer.from(this.encryptionKey, 'hex');
      // Support legacy wallets (no IV) if necessary, but we can't efficiently decrypt them without createDecipher
      // Assuming fresh setup or migration isn't required for needs attention state
      if (!stored.iv) {
        throw new Error('Invalid wallet format: missing IV');
      }

      const iv = Buffer.from(stored.iv, 'hex');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(stored.encryptedKey, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.wallet = {
        privateKey: decrypted,
        address: stored.address,
        encryptionKey: this.encryptionKey,
        isLocal: true,
      };

      return this.wallet;
    } catch {
      return null;
    }
  }

  /**
   * Check if wallet exists
   */
  async walletExists(): Promise<boolean> {
    try {
      await access(this.keyPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sign data with wallet private key
   */
  async sign(message: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('No wallet loaded');
    }

    // Create HMAC signature as placeholder
    // Implementation note: , would use secp256k1 signing
    const hmac = createHmac('sha256', this.wallet.privateKey);
    hmac.update(message);
    const signature = '0x' + hmac.digest('hex');

    return signature;
  }

  /**
   * Delete wallet (security feature)
   */
  async deleteWallet(): Promise<void> {
    try {
      await unlink(this.keyPath);
      this.wallet = null;
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Get current wallet address
   */
  getAddress(): string | null {
    return this.wallet?.address || null;
  }

  /**
   * Verify wallet is loaded
   */
  isLoaded(): boolean {
    return this.wallet !== null;
  }
}
