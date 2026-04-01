/**
 * AFFECT Token Manager for Agent Website Publishing
 *
 * Handles AFFECT token burning for ephemeral website creation and renewal.
 * Operates independently from EDGEWORK TokenSpendingManager since website
 * publishing is a governance/platform feature, not compute infrastructure.
 */

import { parseUnits, formatUnits } from 'viem';
import type { AgentWebsiteTokenBurn } from '../types/agent-website';
import {
  calculateRenewalCost,
  MAX_RENEWAL_COUNT,
} from '../types/agent-website';

interface AffectTokenLogger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

interface TransactionLog {
  data: string;
  topics: readonly string[];
}

interface TransactionReceipt {
  blockNumber: bigint | number;
  status: string;
  logs: TransactionLog[];
}

type HexValue = `0x${string}`;
type EventTopics = [] | [signature: HexValue, ...args: HexValue[]];

function toHexValue(value: string): HexValue {
  return value as HexValue;
}

function toEventTopics(topics: readonly string[]): EventTopics {
  if (topics.length === 0) {
    return [];
  }

  const [signature, ...args] = topics;
  return [toHexValue(signature), ...args.map(toHexValue)];
}

/**
 * AFFECT token contract address (Optimism Sepolia)
 */
export const AFFECT_TOKEN_ADDRESS =
  '0xe0cfDeeB9BA7e52f5CA6a9975b7e1a3633eFC815';

/**
 * AFFECT token burn receipt with transaction details
 */
export interface AffectBurnReceipt {
  /** Transaction hash */
  txHash: string;

  /** Block number */
  blockNumber: number;

  /** Amount burned (in AFFECT, not wei) */
  amountAffect: number;

  /** Amount in wei */
  amountWei: bigint;

  /** Timestamp */
  timestamp: number;

  /** Renewal count */
  renewalCount: number;

  /** Site hash (if available) */
  siteHash?: string;
}

/**
 * Configuration for AFFECT token operations
 */
export interface AffectTokenConfig {
  /** Optimism RPC URL */
  rpcUrl?: string;

  /** AFFECT token contract address (defaults to Optimism Sepolia) */
  tokenAddress?: string;

  /** Private key for signing transactions (agent wallet) */
  privateKey?: string;

  /** Wallet address (if no private key provided) */
  walletAddress?: string;
}

/**
 * Manager for AFFECT token operations related to website publishing
 */
export class AffectTokenManager {
  private config: Required<AffectTokenConfig>;
  private logger: AffectTokenLogger;

  constructor(config: AffectTokenConfig) {
    this.config = {
      rpcUrl: config.rpcUrl || 'https://sepolia.optimism.io',
      tokenAddress: config.tokenAddress || AFFECT_TOKEN_ADDRESS,
      privateKey: config.privateKey || '',
      walletAddress: config.walletAddress || '',
    };

    this.logger = this.createLogger();
  }

  private createLogger() {
    return {
      debug: (msg: string, data?: unknown) =>
        console.debug(`[AffectTokenManager] ${msg}`, data),
      info: (msg: string, data?: unknown) =>
        console.info(`[AffectTokenManager] ${msg}`, data),
      warn: (msg: string, data?: unknown) =>
        console.warn(`[AffectTokenManager] ${msg}`, data),
      error: (msg: string, data?: unknown) =>
        console.error(`[AffectTokenManager] ${msg}`, data),
    };
  }

  /**
   * Get AFFECT token balance for an address
   *
   * @param walletAddress Address to check balance for
   * @returns Balance in AFFECT tokens
   */
  async getBalance(walletAddress?: string): Promise<number> {
    try {
      const address = walletAddress || this.config.walletAddress;
      if (!address) {
        throw new Error('No wallet address provided');
      }

      // when motivation is low-load viem
      const { createPublicClient, http } = await import('viem');
      const { optimismSepolia } = await import('viem/chains');

      const client = createPublicClient({
        chain: optimismSepolia,
        transport: http(this.config.rpcUrl),
      });

      const balanceWei = await client.readContract({
        address: this.config.tokenAddress as `0x${string}`,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ name: 'balance', type: 'uint256' }],
          },
        ],
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });

      // Convert from wei to AFFECT (18 decimals)
      const balance = parseFloat(formatUnits(balanceWei as bigint, 18));

      this.logger.debug('Balance fetched', { address, balance });
      return balance;
    } catch (error) {
      this.logger.error('Failed to get balance', { error });
      throw error;
    }
  }

  /**
   * Check if wallet has sufficient AFFECT balance for website publishing
   *
   * @param renewalCount Current renewal count (0 for new site)
   * @param walletAddress Optional wallet address (uses config if not provided)
   * @returns True if balance is sufficient
   */
  async hasSufficientBalance(
    renewalCount: number,
    walletAddress?: string
  ): Promise<boolean> {
    try {
      if (renewalCount < 0 || renewalCount > MAX_RENEWAL_COUNT) {
        throw new Error(`Invalid renewal count: ${renewalCount}`);
      }

      const balance = await this.getBalance(walletAddress);
      const requiredAmount = calculateRenewalCost(renewalCount);

      this.logger.debug('Checking sufficient balance', {
        balance,
        requiredAmount,
        renewalCount,
        sufficient: balance >= requiredAmount,
      });

      return balance >= requiredAmount;
    } catch (error) {
      this.logger.error('Failed to check sufficient balance', { error });
      throw error;
    }
  }

  /**
   * Burn AFFECT tokens for website publishing
   *
   * @param renewalCount Current renewal count (0-10)
   * @param siteHash Optional site hash for tracking
   * @returns Burn receipt with transaction details
   */
  async burnForWebsitePublishing(
    renewalCount: number,
    siteHash?: string
  ): Promise<AffectBurnReceipt> {
    try {
      // Validate renewal count
      if (renewalCount < 0 || renewalCount > MAX_RENEWAL_COUNT) {
        throw new Error(
          `Renewal count must be between 0 and ${MAX_RENEWAL_COUNT}, got ${renewalCount}`
        );
      }

      // Calculate burn amount
      const amountAffect = calculateRenewalCost(renewalCount);
      const amountWei = parseUnits(amountAffect.toString(), 18);

      this.logger.info('Burning AFFECT for website publishing', {
        renewalCount,
        amountAffect,
        siteHash,
      });

      // Check sufficient balance
      const hasSufficient = await this.hasSufficientBalance(renewalCount);
      if (!hasSufficient) {
        const balance = await this.getBalance();
        throw new Error(
          `Insufficient AFFECT balance: need ${amountAffect}, have ${balance.toFixed(
            2
          )}`
        );
      }

      // when motivation is low-load viem
      const { createWalletClient, http, parseAbiItem } = await import('viem');
      const { privateKeyToAccount } = await import('viem/accounts');
      const { optimismSepolia } = await import('viem/chains');

      if (!this.config.privateKey) {
        throw new Error('Private key required for burning tokens');
      }

      // Create wallet client
      const account = privateKeyToAccount(
        this.config.privateKey as `0x${string}`
      );
      const client = createWalletClient({
        account,
        chain: optimismSepolia,
        transport: http(this.config.rpcUrl),
      });

      // Call burn function on AFFECT token contract
      const txHash = await client.writeContract({
        address: this.config.tokenAddress as `0x${string}`,
        abi: [
          {
            name: 'burn',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [{ name: 'amount', type: 'uint256' }],
            outputs: [],
          },
        ],
        functionName: 'burn',
        args: [amountWei],
      });

      this.logger.info('Burn transaction submitted', { txHash });

      // Wait for confirmation
      const { createPublicClient } = await import('viem');
      const publicClient = createPublicClient({
        chain: optimismSepolia,
        transport: http(this.config.rpcUrl),
      });

      const receipt = (await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })) as TransactionReceipt;

      const burnReceipt: AffectBurnReceipt = {
        txHash,
        blockNumber: Number(receipt.blockNumber),
        amountAffect,
        amountWei,
        timestamp: Date.now(),
        renewalCount,
        siteHash,
      };

      this.logger.info('Burn transaction confirmed', burnReceipt);

      return burnReceipt;
    } catch (error) {
      this.logger.error('Failed to burn AFFECT tokens', {
        error,
        renewalCount,
        siteHash,
      });
      throw error;
    }
  }

  /**
   * Verify a burn transaction on-chain
   *
   * @param txHash Transaction hash to verify
   * @returns True if transaction exists and is successful
   */
  async verifyBurnTransaction(txHash: string): Promise<boolean> {
    try {
      const { createPublicClient, http } = await import('viem');
      const { optimismSepolia } = await import('viem/chains');

      const client = createPublicClient({
        chain: optimismSepolia,
        transport: http(this.config.rpcUrl),
      });

      const receipt = (await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      })) as TransactionReceipt;

      const isSuccess = receipt.status === 'success';

      this.logger.debug('Burn transaction verified', {
        txHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        isSuccess,
      });

      return isSuccess;
    } catch (error) {
      this.logger.error('Failed to verify burn transaction', { error, txHash });
      return false;
    }
  }

  /**
   * Get transaction details for audit trail
   *
   * @param txHash Transaction hash
   * @returns Token burn audit record
   */
  async getTransactionDetails(
    txHash: string,
    siteHash: string
  ): Promise<AgentWebsiteTokenBurn> {
    try {
      const { createPublicClient, http, decodeEventLog, parseAbiItem } =
        await import('viem');
      const { optimismSepolia } = await import('viem/chains');

      const client = createPublicClient({
        chain: optimismSepolia,
        transport: http(this.config.rpcUrl),
      });

      const receipt = (await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      })) as TransactionReceipt;

      // Find Transfer event to address(0) (burn)
      const transferEvent = receipt.logs.find((log: TransactionLog) => {
        try {
          const decoded = decodeEventLog({
            abi: [
              parseAbiItem(
                'event Transfer(address indexed from, address indexed to, uint256 value)'
              ),
            ],
            data: toHexValue(log.data),
            topics: toEventTopics(log.topics),
          });
          return (
            decoded.args.to === '0x0000000000000000000000000000000000000000'
          );
        } catch {
          return false;
        }
      });

      if (!transferEvent) {
        throw new Error('Burn event not found in transaction');
      }

      const decoded = decodeEventLog({
        abi: [
          parseAbiItem(
            'event Transfer(address indexed from, address indexed to, uint256 value)'
          ),
        ],
        data: toHexValue(transferEvent.data),
        topics: toEventTopics(transferEvent.topics),
      });

      // Extract amount from event
      const amountWei = decoded.args.value as bigint;
      const amountAffect = formatUnits(amountWei, 18);

      // Calculate renewal count from amount
      let renewalCount = 0;
      const amount = parseFloat(amountAffect);
      for (let i = 0; i <= MAX_RENEWAL_COUNT; i++) {
        if (Math.abs(calculateRenewalCost(i) - amount) < 0.0001) {
          renewalCount = i;
          break;
        }
      }

      const auditRecord: AgentWebsiteTokenBurn = {
        txHash,
        siteHash,
        amountAffect: amountWei.toString(),
        renewalCount,
        blockNumber: Number(receipt.blockNumber),
        verifiedAt: new Date().toISOString(),
      };

      this.logger.debug('Transaction details retrieved', auditRecord);

      return auditRecord;
    } catch (error) {
      this.logger.error('Failed to get transaction details', { error, txHash });
      throw error;
    }
  }

  /**
   * Get renewal pricing schedule for display
   *
   * @param currentRenewalCount Current renewal count
   * @returns Array of upcoming renewal costs
   */
  getRenewalPricingSchedule(currentRenewalCount = 0): Array<{
    renewal: number;
    cost: number;
    cumulativeTotal: number;
  }> {
    const schedule = [];
    let cumulative = 0;

    for (let i = currentRenewalCount; i <= MAX_RENEWAL_COUNT; i++) {
      const cost = calculateRenewalCost(i);
      cumulative += cost;
      schedule.push({
        renewal: i,
        cost,
        cumulativeTotal: parseFloat(cumulative.toFixed(1)),
      });
    }

    return schedule;
  }
}
