/**
 * Wallet Authentication Module
 *
 * Handles wallet connection and license validation via Optimism NFT.
 * Works with any EIP-1193 compatible wallet (MetaMask, WalletConnect, etc.)
 */

import type { AuthSession } from './index';

// Optimism Mainnet Chain ID
const OPTIMISM_CHAIN_ID = 10;
const OPTIMISM_CHAIN_ID_HEX = '0xa';

// License NFT Contract Address on Optimism
const LICENSE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'; // Placeholder - deploy contract for production

// Oracle API endpoint
const ORACLE_ENDPOINT = 'https://oracle.edgework.ai';

/**
 * EIP-1193 Provider interface (MetaMask, etc.)
 */
export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Wallet connection state
 */
export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
  isOptimism: boolean;
}

/**
 * License NFT metadata
 */
export interface LicenseNFT {
  tokenId: string;
  tier: 'starter' | 'pro' | 'enterprise';
  expiry: number;
  capabilities: string[];
}

/**
 * Oracle challenge response
 */
interface ChallengeResponse {
  challenge: string;
  expiresAt: number;
}

/**
 * Oracle verification response
 */
interface VerifyResponse {
  valid: boolean;
  jwt: string;
  session: AuthSession;
  error?: string;
}

/**
 * Wallet Authentication Client
 */
export class WalletAuth {
  private provider: EIP1193Provider | null = null;
  private state: WalletState = {
    connected: false,
    address: null,
    chainId: null,
    isOptimism: false,
  };
  private oracleEndpoint: string;

  constructor(oracleEndpoint: string = ORACLE_ENDPOINT) {
    this.oracleEndpoint = oracleEndpoint;
  }

  /**
   * Connect to wallet and validate license
   */
  async connect(provider?: EIP1193Provider): Promise<AuthSession> {
    // Get provider from window if not provided
    this.provider = provider || this.getWindowProvider();

    if (!this.provider) {
      throw new Error(
        'No wallet provider found. Please install MetaMask or another Web3 wallet.'
      );
    }

    // Request account access
    const accounts = (await this.provider.request({
      method: 'eth_requestAccounts',
    })) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your wallet.');
    }

    const address = accounts[0].toLowerCase();

    // Get current chain
    const chainIdHex = (await this.provider.request({
      method: 'eth_chainId',
    })) as string;
    const chainId = parseInt(chainIdHex, 16);

    this.state = {
      connected: true,
      address,
      chainId,
      isOptimism: chainId === OPTIMISM_CHAIN_ID,
    };

    // Switch to Optimism if needed
    if (!this.state.isOptimism) {
      await this.switchToOptimism();
    }

    // Validate license via oracle
    const session = await this.validateLicense(address);

    // Set up event listeners
    this.setupEventListeners();

    return session;
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.state = {
      connected: false,
      address: null,
      chainId: null,
      isOptimism: false,
    };
    this.provider = null;
  }

  /**
   * Get current wallet state
   */
  getState(): WalletState {
    return { ...this.state };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state.connected && this.state.isOptimism;
  }

  /**
   * Get connected address
   */
  getAddress(): string | null {
    return this.state.address;
  }

  /**
   * Switch to Optimism network
   */
  private async switchToOptimism(): Promise<void> {
    if (!this.provider) throw new Error('No provider');

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: OPTIMISM_CHAIN_ID_HEX }],
      });
    } catch (switchError: unknown) {
      // Chain not added, add it
      if ((switchError as { code?: number })?.code === 4902) {
        await this.provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: OPTIMISM_CHAIN_ID_HEX,
              chainName: 'Optimism',
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://mainnet.optimism.io'],
              blockExplorerUrls: ['https://optimistic.etherscan.io'],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }

    this.state.chainId = OPTIMISM_CHAIN_ID;
    this.state.isOptimism = true;
  }

  /**
   * Validate license via oracle
   */
  private async validateLicense(address: string): Promise<AuthSession> {
    // Step 1: Get challenge from oracle
    const challengeResponse = await fetch(
      `${this.oracleEndpoint}/auth/challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      }
    );

    if (!challengeResponse.ok) {
      throw new Error('Failed to get challenge from oracle');
    }

    const { challenge, expiresAt } =
      (await challengeResponse.json()) as ChallengeResponse;

    // Check expiry
    if (Date.now() / 1000 > expiresAt) {
      throw new Error('Challenge expired');
    }

    // Step 2: Sign the challenge
    const signature = await this.signMessage(challenge);

    // Step 3: Verify signature with oracle
    const verifyResponse = await fetch(`${this.oracleEndpoint}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        challenge,
        signature,
      }),
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.text();
      throw new Error(`License validation failed: ${error}`);
    }

    const result = (await verifyResponse.json()) as VerifyResponse;

    if (!result.valid) {
      throw new Error(result.error || 'License validation failed');
    }

    return result.session;
  }

  /**
   * Sign a message with the connected wallet
   */
  private async signMessage(message: string): Promise<string> {
    if (!this.provider || !this.state.address) {
      throw new Error('Wallet not connected');
    }

    const signature = (await this.provider.request({
      method: 'personal_sign',
      params: [message, this.state.address],
    })) as string;

    return signature;
  }

  /**
   * Get window.ethereum provider
   */
  private getWindowProvider(): EIP1193Provider | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const provider = (window as Window & { ethereum?: EIP1193Provider })
      .ethereum;
    return provider ?? null;
  }

  /**
   * Set up wallet event listeners
   */
  private setupEventListeners(): void {
    if (!this.provider) return;

    this.provider.on('accountsChanged', (accounts: unknown) => {
      const accts = accounts as string[];
      if (accts.length === 0) {
        this.disconnect();
      } else {
        this.state.address = accts[0].toLowerCase();
      }
    });

    this.provider.on('chainChanged', (chainId: unknown) => {
      const id = parseInt(chainId as string, 16);
      this.state.chainId = id;
      this.state.isOptimism = id === OPTIMISM_CHAIN_ID;
    });

    this.provider.on('disconnect', () => {
      this.disconnect();
    });
  }
}

/**
 * Check if a wallet has a valid license NFT
 * (Direct contract call without oracle, for display purposes)
 */
export async function checkLicenseNFT(
  provider: EIP1193Provider,
  address: string
): Promise<LicenseNFT | null> {
  // ERC-721 balanceOf selector
  const balanceOfSelector = '0x70a08231';
  const paddedAddress = address.slice(2).padStart(64, '0');

  try {
    const result = (await provider.request({
      method: 'eth_call',
      params: [
        {
          to: LICENSE_CONTRACT_ADDRESS,
          data: balanceOfSelector + paddedAddress,
        },
        'latest',
      ],
    })) as string;

    const balance = parseInt(result, 16);
    if (balance === 0) {
      return null;
    }

    // Would fetch actual NFT metadata here
    return {
      tokenId: '1',
      tier: 'pro',
      expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      capabilities: ['inference', 'distributed', 'streaming'],
    };
  } catch {
    return null;
  }
}

/**
 * Create a new WalletAuth instance
 */
export function createWalletAuth(oracleEndpoint?: string): WalletAuth {
  return new WalletAuth(oracleEndpoint);
}
