import { describe, it, expect, beforeEach, jest, mock } from 'bun:test';

// Mock viem modules
const mockReadContract = jest.fn();
const mockWriteContract = jest.fn();
const mockWaitForTransactionReceipt = jest.fn();
const mockGetTransactionReceipt = jest.fn();

mock.module('viem', () => ({
  createPublicClient: jest.fn(() => ({
    readContract: mockReadContract,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
    getTransactionReceipt: mockGetTransactionReceipt,
  })),
  createWalletClient: jest.fn(() => ({
    writeContract: mockWriteContract,
  })),
  http: jest.fn(() => ({})),
  parseUnits: (value: string, decimals: number) =>
    BigInt(parseFloat(value) * Math.pow(10, decimals)),
  formatUnits: (value: bigint, decimals: number) =>
    (Number(value) / Math.pow(10, decimals)).toString(),
  decodeEventLog: jest.fn(),
  parseAbiItem: jest.fn((item: string) => item),
}));

mock.module('viem/accounts', () => ({
  privateKeyToAccount: jest.fn((pk: string) => ({
    address: '0x1234567890abcdef',
  })),
}));

mock.module('viem/chains', () => ({
  optimismSepolia: { id: 11155420, name: 'Optimism Sepolia' },
}));

const { AffectTokenManager, AFFECT_TOKEN_ADDRESS } = await import(
  '../AffectTokenManager'
);

describe('AffectTokenManager', () => {
  let manager: InstanceType<typeof AffectTokenManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    manager = new AffectTokenManager({
      rpcUrl: 'https://sepolia.optimism.io',
      tokenAddress: AFFECT_TOKEN_ADDRESS,
      privateKey:
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
  });

  describe('getBalance', () => {
    it('should fetch AFFECT balance from contract', async () => {
      const balanceWei = BigInt('100000000000000000000'); // 100 AFFECT
      mockReadContract.mockResolvedValue(balanceWei);

      const balance = await manager.getBalance();

      expect(balance).toBe(100);
      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: AFFECT_TOKEN_ADDRESS,
          functionName: 'balanceOf',
        })
      );
    });

    it('should use provided wallet address', async () => {
      const balanceWei = BigInt('50000000000000000000'); // 50 AFFECT
      mockReadContract.mockResolvedValue(balanceWei);

      const customAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
      const balance = await manager.getBalance(customAddress);

      expect(balance).toBe(50);
      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [customAddress],
        })
      );
    });

    it('should throw if no wallet address provided', async () => {
      const managerNoWallet = new AffectTokenManager({
        privateKey: '0xabcdef',
      });

      await expect(managerNoWallet.getBalance()).rejects.toThrow(
        'No wallet address provided'
      );
    });

    it('should handle contract errors', async () => {
      mockReadContract.mockRejectedValue(new Error('Contract call failed'));

      await expect(manager.getBalance()).rejects.toThrow(
        'Contract call failed'
      );
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true when balance is sufficient', async () => {
      mockReadContract.mockResolvedValue(BigInt('1000000000000000000000')); // 1000 AFFECT

      const sufficient = await manager.hasSufficientBalance(0); // Needs 0.1 AFFECT
      expect(sufficient).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      mockReadContract.mockResolvedValue(BigInt('50000000000000000')); // 0.05 AFFECT

      const sufficient = await manager.hasSufficientBalance(0); // Needs 0.1 AFFECT
      expect(sufficient).toBe(false);
    });

    it('should calculate correct amount for different renewal counts', async () => {
      mockReadContract.mockResolvedValue(BigInt('1000000000000000000000')); // 1000 AFFECT

      expect(await manager.hasSufficientBalance(0)).toBe(true); // 0.1 AFFECT
      expect(await manager.hasSufficientBalance(5)).toBe(true); // 3.2 AFFECT
      expect(await manager.hasSufficientBalance(10)).toBe(true); // 102.4 AFFECT
    });

    it('should throw for invalid renewal count', async () => {
      await expect(manager.hasSufficientBalance(-1)).rejects.toThrow(
        'Invalid renewal count'
      );
      await expect(manager.hasSufficientBalance(11)).rejects.toThrow(
        'Invalid renewal count'
      );
    });
  });

  describe('burnForWebsitePublishing', () => {
    it('should burn correct amount for renewal count 0', async () => {
      mockReadContract.mockResolvedValue(BigInt('1000000000000000000000')); // 1000 AFFECT
      mockWriteContract.mockResolvedValue('0xtxhash123');
      mockWaitForTransactionReceipt.mockResolvedValue({
        blockNumber: 12345n,
        status: 'success',
      });

      const receipt = await manager.burnForWebsitePublishing(
        0,
        'site-hash-123'
      );

      expect(receipt.amountAffect).toBe(0.1);
      expect(receipt.renewalCount).toBe(0);
      expect(receipt.siteHash).toBe('site-hash-123');
      expect(receipt.txHash).toBe('0xtxhash123');
      expect(receipt.blockNumber).toBe(12345);
    });

    it('should burn exponential amounts for higher renewal counts', async () => {
      mockReadContract.mockResolvedValue(BigInt('1000000000000000000000')); // 1000 AFFECT
      mockWriteContract.mockResolvedValue('0xtxhash456');
      mockWaitForTransactionReceipt.mockResolvedValue({
        blockNumber: 12346n,
        status: 'success',
      });

      const receipt = await manager.burnForWebsitePublishing(5);

      expect(receipt.amountAffect).toBe(3.2); // 0.1 * 2^5
      expect(receipt.renewalCount).toBe(5);
    });

    it('should throw if renewal count exceeds max', async () => {
      await expect(manager.burnForWebsitePublishing(11)).rejects.toThrow(
        'Renewal count must be between 0 and 10'
      );
    });

    it('should throw if insufficient balance', async () => {
      mockReadContract.mockResolvedValue(BigInt('50000000000000000')); // 0.05 AFFECT

      await expect(manager.burnForWebsitePublishing(0)).rejects.toThrow(
        'Insufficient AFFECT balance'
      );
    });

    it('should throw if no private key provided', async () => {
      const managerNoKey = new AffectTokenManager({
        walletAddress: '0x1234',
      });

      mockReadContract.mockResolvedValue(BigInt('1000000000000000000000'));

      await expect(managerNoKey.burnForWebsitePublishing(0)).rejects.toThrow(
        'Private key required'
      );
    });

    it('should wait for transaction confirmation', async () => {
      mockReadContract.mockResolvedValue(BigInt('1000000000000000000000'));
      mockWriteContract.mockResolvedValue('0xtxhash789');
      mockWaitForTransactionReceipt.mockResolvedValue({
        blockNumber: 12347n,
        status: 'success',
      });

      await manager.burnForWebsitePublishing(0);

      expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          hash: '0xtxhash789',
          confirmations: 1,
        })
      );
    });
  });

  describe('verifyBurnTransaction', () => {
    it('should return true for successful transaction', async () => {
      mockGetTransactionReceipt.mockResolvedValue({
        status: 'success',
        blockNumber: 12345n,
      });

      const isValid = await manager.verifyBurnTransaction('0xtxhash');

      expect(isValid).toBe(true);
    });

    it('should return false for failed transaction', async () => {
      mockGetTransactionReceipt.mockResolvedValue({
        status: 'reverted',
        blockNumber: 12345n,
      });

      const isValid = await manager.verifyBurnTransaction('0xtxhash');

      expect(isValid).toBe(false);
    });

    it('should return false if transaction not found', async () => {
      mockGetTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found')
      );

      const isValid = await manager.verifyBurnTransaction('0xinvalidtx');

      expect(isValid).toBe(false);
    });
  });

  describe('getRenewalPricingSchedule', () => {
    it('should return full schedule from renewal 0', () => {
      const schedule = manager.getRenewalPricingSchedule(0);

      expect(schedule).toHaveLength(11); // 0-10
      expect(schedule[0]).toEqual({
        renewal: 0,
        cost: 0.1,
        cumulativeTotal: 0.1,
      });
      expect(schedule[10]).toEqual({
        renewal: 10,
        cost: 102.4,
        cumulativeTotal: 204.7,
      });
    });

    it('should return remaining schedule from current renewal', () => {
      const schedule = manager.getRenewalPricingSchedule(5);

      expect(schedule).toHaveLength(6); // 5-10
      expect(schedule[0]).toEqual({
        renewal: 5,
        cost: 3.2,
        cumulativeTotal: 3.2,
      });
    });

    it('should handle max renewal count', () => {
      const schedule = manager.getRenewalPricingSchedule(10);

      expect(schedule).toHaveLength(1);
      expect(schedule[0].renewal).toBe(10);
    });
  });
});
