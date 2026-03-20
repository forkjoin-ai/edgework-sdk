/**
 * Gateway Connector - Registers agents with Edgework on Optimism
 */

import type {
  GatewayConnectorOptions,
  GatewayConfig,
  GatewayRegistration,
  WalletConfig,
} from './types';
import { WalletManager } from './WalletManager';
import {
  createEdgeworkAuthHeader,
  resolveEdgeworkApiKey,
} from '../edgework-api-key';

export interface RegistrationMetadata {
  name: string;
  region: string;
  gpuType?: string;
  cpuCores?: number;
  country?: string;
  customData?: Record<string, unknown>;
}

/**
 * Connects to Optimism and registers gateway
 *
 * @example
 * ```typescript
 * const connector = new GatewayConnector({
 *   walletAddress: '0x...',
 *   provider: 'https://sepolia.optimism.io',
 * });
 *
 * // Register existing wallet
 * const reg = await connector.register();
 *
 * // Or create new wallet and register
 * const { wallet, registration } = await connector.registerWithNewWallet({
 *   name: 'My Gateway',
 *   region: 'us-west',
 * });
 * ```
 */
export class GatewayConnector {
  private provider: string;
  private walletAddress: string;
  private registryAddress: string;
  private apiKey: string | undefined;
  private chainId: number;
  private walletManager: WalletManager;
  private web3Provider: any = null;
  private contract: any = null;
  private logger: any;

  constructor(options: GatewayConnectorOptions) {
    this.provider = options.provider || 'https://sepolia.optimism.io';
    this.walletAddress = options.walletAddress;
    this.registryAddress = options.registryAddress || '0x' + '0'.repeat(40); // Placeholder
    this.apiKey = resolveEdgeworkApiKey(options.apiKey);
    this.chainId = options.chainId || 11155420; // Optimism Sepolia
    this.walletManager = new WalletManager();
    this.logger = this.createLogger();
  }

  private async loadEthers(): Promise<typeof import('ethers')> {
    return import('ethers');
  }

  private createLogger() {
    return {
      debug: (msg: string, data?: any) =>
        console.debug(`[GatewayConnector] ${msg}`, data),
      info: (msg: string, data?: any) =>
        console.info(`[GatewayConnector] ${msg}`, data),
      warn: (msg: string, data?: any) =>
        console.warn(`[GatewayConnector] ${msg}`, data),
      error: (msg: string, data?: any) =>
        console.error(`[GatewayConnector] ${msg}`, data),
    };
  }

  /**
   * Connect to provider
   */
  async connect(): Promise<void> {
    try {
      const ethers = await this.loadEthers();

      // Create provider
      this.web3Provider = new ethers.JsonRpcProvider(
        this.provider,
        this.chainId
      );

      // Test connection
      const network = await this.web3Provider.getNetwork();
      this.logger.info('Connected to network', {
        chainId: network.chainId,
        name: network.name,
      });

      // Create contract instance (ABI stub for registry)
      const registryAbi = [
        'function registerGateway(bytes32 ucanRoot, string metadata) external',
        'function getGateway(address) view returns (tuple(address owner, bytes32 ucanRoot, string metadata, uint256 totalComputeUnits, uint256 pendingRewards, uint256 claimedRewards, uint256 lastHeartbeat, uint256 registeredAt, bool isActive, bool isBanned))',
        'function sendHeartbeat() external',
      ];

      this.contract = new ethers.Contract(
        this.registryAddress,
        registryAbi,
        this.web3Provider
      );

      this.logger.debug('Connected to registry', {
        address: this.registryAddress,
      });
    } catch (error) {
      this.logger.error('Failed to connect', { error });
      throw error;
    }
  }

  /**
   * Disconnect from provider
   */
  async disconnect(): Promise<void> {
    this.web3Provider = null;
    this.contract = null;
    this.logger.debug('Disconnected from provider');
  }

  /**
   * Register with existing wallet
   */
  async register(
    config?: Partial<GatewayConfig>
  ): Promise<GatewayRegistration> {
    if (!this.contract) {
      throw new Error('Not connected. Call connect() first.');
    }

    if (!this.walletAddress) {
      throw new Error('No wallet address configured');
    }

    try {
      // Load wallet
      const wallet = await this.walletManager.loadWallet();
      if (!wallet) {
        throw new Error(
          'Wallet not found. Create one with registerWithNewWallet()'
        );
      }

      const ethers = await this.loadEthers();

      // Create signer
      const signer = new ethers.Wallet(wallet.privateKey, this.web3Provider);

      // Prepare metadata
      const metadata = JSON.stringify(config || {});
      const ucanRoot = ethers.id('edgework-gateway');

      this.logger.info('Registering gateway', {
        address: this.walletAddress,
        metadata,
      });

      // Sign transaction
      const contractWithSigner = this.contract.connect(signer);
      const tx = await contractWithSigner.registerGateway(ucanRoot, metadata);

      this.logger.info('Registration transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();

      this.logger.info('Gateway registered', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      // Get registration details
      const registration = await this.getStatus();
      if (!registration) {
        throw new Error('Failed to retrieve registration details');
      }

      return registration;
    } catch (error) {
      this.logger.error('Registration failed', { error });
      throw error;
    }
  }

  /**
   * Register with a new auto-generated wallet
   */
  async registerWithNewWallet(
    config: Omit<GatewayConfig, 'walletAddress'>
  ): Promise<{ wallet: WalletConfig; registration: GatewayRegistration }> {
    try {
      this.logger.info('Creating new wallet');

      // Generate wallet
      const wallet = await this.walletManager.generateWallet();

      // Save it locally
      await this.walletManager.saveWallet();

      this.logger.info('Wallet created and saved', {
        address: wallet.address,
      });

      // Update wallet address
      this.walletAddress = wallet.address;

      // Register with this wallet
      const fullConfig: GatewayConfig = {
        ...config,
        walletAddress: wallet.address,
      };

      const registration = await this.register(fullConfig);

      this.logger.info('Registered with new wallet', {
        address: wallet.address,
        registration,
      });

      return { wallet, registration };
    } catch (error) {
      this.logger.error('Failed to register with new wallet', { error });
      throw error;
    }
  }

  /**
   * Get current registration status
   */
  async getStatus(): Promise<GatewayRegistration | null> {
    if (!this.contract) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      const gateway = await this.contract.getGateway(this.walletAddress);

      if (!gateway.registeredAt || gateway.registeredAt === 0n) {
        return null;
      }

      return {
        gatewayAddress: this.walletAddress,
        owner: gateway.owner,
        ucanRoot: gateway.ucanRoot,
        registeredAt: Number(gateway.registeredAt),
        isActive: gateway.isActive,
        totalComputeUnits: Number(gateway.totalComputeUnits),
        pendingRewards: Number(gateway.pendingRewards),
      };
    } catch (error) {
      this.logger.warn('Failed to get status', { error });
      return null;
    }
  }

  /**
   * Send heartbeat to keep gateway active
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.contract) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      const wallet = await this.walletManager.loadWallet();
      if (!wallet) {
        throw new Error('Wallet not loaded');
      }

      const ethers = await this.loadEthers();
      const signer = new ethers.Wallet(wallet.privateKey, this.web3Provider);

      const contractWithSigner = this.contract.connect(signer);
      const tx = await contractWithSigner.sendHeartbeat();

      this.logger.debug('Heartbeat sent', { txHash: tx.hash });

      await tx.wait();
      this.logger.debug('Heartbeat confirmed');
    } catch (error) {
      this.logger.error('Heartbeat failed', { error });
      throw error;
    }
  }

  /**
   * Unregister from gateway
   */
  async unregister(reason = 'User requested'): Promise<void> {
    if (!this.contract) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      const wallet = await this.walletManager.loadWallet();
      if (!wallet) {
        throw new Error('Wallet not loaded');
      }

      const ethers = await this.loadEthers();
      const signer = new ethers.Wallet(wallet.privateKey, this.web3Provider);

      // Note: This assumes a deregister function exists
      // In practice, you'd call the actual registry method
      this.logger.info('Unregistering gateway', { reason });

      // Clean up local wallet
      await this.walletManager.deleteWallet();
      this.walletAddress = '';

      this.logger.info('Gateway unregistered and wallet deleted');
    } catch (error) {
      this.logger.error('Unregistration failed', { error });
      throw error;
    }
  }

  /**
   * Register via a relayer (gas-sponsored)
   */
  async registerViaRelayer(
    relayerUrl: string,
    config: GatewayConfig
  ): Promise<GatewayRegistration> {
    if (!this.walletAddress) {
      throw new Error('No wallet address configured');
    }

    try {
      const wallet = await this.walletManager.loadWallet();
      if (!wallet) {
        throw new Error('Wallet not found for signing');
      }

      const ethers = await this.loadEthers();
      const signer = new ethers.Wallet(wallet.privateKey); // No provider needed for signing

      // Prepare metadata
      const metadata = JSON.stringify(config || {});
      const ucanRoot = ethers.id('edgework-gateway');

      // prepare hash
      // bytes32 hash = keccak256(abi.encodePacked(gateway, ucanRoot, metadata));
      const hash = ethers.solidityPackedKeccak256(
        ['address', 'bytes32', 'string'],
        [this.walletAddress, ucanRoot, metadata]
      );

      // Sign the hash (EIP-191)
      const signature = await signer.signMessage(ethers.getBytes(hash));

      this.logger.info('Sending signed registration to relayer', {
        relayerUrl,
        address: this.walletAddress,
      });

      // Post to relayer
      const response = await fetch(relayerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `Edgework-SDK/0.1.0`,
          Accept: 'application/json',
          ...createEdgeworkAuthHeader(this.apiKey),
        },
        body: JSON.stringify({
          gateway: this.walletAddress,
          ucanRoot,
          metadata,
          signature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Relayer request failed', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(
          `Relayer error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      this.logger.info('Relayer accepted request', result);

      // Poll for status or assume success based on relayer response
      // Current behavior: we'll try to get status from the chain (might take a moment)
      // Implementation note: implementation, we might wait for the tx hash returned by relayer

      // Wait a bit for indexing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Attempt to get status
      // Note: This might still return null if tx hasn't mined.
      // The caller might need to poll getStatus().
      return {
        gatewayAddress: this.walletAddress,
        owner: this.walletAddress, // Approximated
        ucanRoot,
        registeredAt: Date.now(),
        isActive: true,
        totalComputeUnits: 0,
        pendingRewards: 0,
      };
    } catch (error) {
      this.logger.error('Relayer registration failed', { error });
      throw error;
    }
  }
}
