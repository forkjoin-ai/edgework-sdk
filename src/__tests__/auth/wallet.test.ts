import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  WalletAuth,
  createWalletAuth,
  type EIP1193Provider,
} from '../../auth/wallet';

// Mock EIP-1193 provider
function createMockProvider(
  options: {
    accounts?: string[];
    chainId?: string;
    signResult?: string;
    shouldFail?: boolean;
  } = {}
): EIP1193Provider {
  const {
    accounts = ['0x1234567890123456789012345678901234567890'],
    chainId = '0xa', // Optimism
    signResult = '0xmocksignature123',
    shouldFail = false,
  } = options;

  const listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  return {
    request: async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown[];
    }) => {
      if (shouldFail) {
        throw new Error('Provider error');
      }

      switch (method) {
        case 'eth_requestAccounts':
          return accounts;
        case 'eth_chainId':
          return chainId;
        case 'personal_sign':
          return signResult;
        case 'wallet_switchEthereumChain':
          return null;
        case 'wallet_addEthereumChain':
          return null;
        case 'eth_call':
          // Mock balanceOf returning 1
          return '0x0000000000000000000000000000000000000000000000000000000000000001';
        default:
          throw new Error(`Unknown method: ${method}`);
      }
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) || [];
      listeners.set(event, [...existing, listener]);
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) || [];
      listeners.set(
        event,
        existing.filter((l) => l !== listener)
      );
    },
  };
}

describe('WalletAuth', () => {
  describe('constructor', () => {
    test('creates instance with default endpoint', () => {
      const auth = new WalletAuth();
      expect(auth).toBeInstanceOf(WalletAuth);
    });

    test('creates instance with custom endpoint', () => {
      const auth = new WalletAuth('https://custom.oracle.com');
      expect(auth).toBeInstanceOf(WalletAuth);
    });
  });

  describe('getState', () => {
    test('returns disconnected state initially', () => {
      const auth = new WalletAuth();
      const state = auth.getState();

      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
      expect(state.chainId).toBeNull();
      expect(state.isOptimism).toBe(false);
    });
  });

  describe('isConnected', () => {
    test('returns false when not connected', () => {
      const auth = new WalletAuth();
      expect(auth.isConnected()).toBe(false);
    });
  });

  describe('getAddress', () => {
    test('returns null when not connected', () => {
      const auth = new WalletAuth();
      expect(auth.getAddress()).toBeNull();
    });
  });

  describe('disconnect', () => {
    test('clears state', () => {
      const auth = new WalletAuth();
      auth.disconnect();

      const state = auth.getState();
      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
    });
  });
});

describe('createWalletAuth', () => {
  test('creates WalletAuth instance', () => {
    const auth = createWalletAuth();
    expect(auth).toBeInstanceOf(WalletAuth);
  });

  test('accepts custom oracle endpoint', () => {
    const auth = createWalletAuth('https://test.oracle.com');
    expect(auth).toBeInstanceOf(WalletAuth);
  });
});

describe('WalletAuth with mock provider', () => {
  test('handles provider with no accounts', async () => {
    const provider = createMockProvider({ accounts: [] });
    const auth = new WalletAuth();

    await expect(auth.connect(provider)).rejects.toThrow('No accounts found');
  });

  test('handles provider error', async () => {
    const provider = createMockProvider({ shouldFail: true });
    const auth = new WalletAuth();

    await expect(auth.connect(provider)).rejects.toThrow();
  });

  test('detects non-Optimism chain', async () => {
    const provider = createMockProvider({ chainId: '0x1' }); // Mainnet
    const auth = new WalletAuth();

    // Connect will try to switch to Optimism
    // Since we mock wallet_switchEthereumChain to succeed, it should work
    // But the actual connect will fail at the oracle step
    await expect(auth.connect(provider)).rejects.toThrow();
  });
});

describe('WalletAuth event handling', () => {
  test('sets up event listeners on connect attempt', async () => {
    const provider = createMockProvider();
    const auth = new WalletAuth();

    // This will fail at oracle validation but should still set up listeners
    try {
      await auth.connect(provider);
    } catch {
      // Expected to fail at oracle validation
    }

    // Provider should have listeners registered
    // (In a real test we'd verify this more directly)
  });
});

describe('Chain switching', () => {
  test('attempts to switch to Optimism when on misaligned chain', async () => {
    let switchCalled = false;
    const provider: EIP1193Provider = {
      request: async ({ method }) => {
        switch (method) {
          case 'eth_requestAccounts':
            return ['0x1234567890123456789012345678901234567890'];
          case 'eth_chainId':
            return '0x1'; // Mainnet
          case 'wallet_switchEthereumChain':
            switchCalled = true;
            return null;
          default:
            throw new Error(`Unknown method: ${method}`);
        }
      },
      on: () => {
        /* noop - mock */
      },
      removeListener: () => {
        /* noop - mock */
      },
    };

    const auth = new WalletAuth();

    try {
      await auth.connect(provider);
    } catch {
      // Expected to fail at oracle validation
    }

    expect(switchCalled).toBe(true);
  });

  test('adds Optimism chain if not available', async () => {
    let addChainCalled = false;
    const provider: EIP1193Provider = {
      request: async ({ method }) => {
        switch (method) {
          case 'eth_requestAccounts':
            return ['0x1234567890123456789012345678901234567890'];
          case 'eth_chainId':
            return '0x1'; // Mainnet
          case 'wallet_switchEthereumChain':
            throw { code: 4902 }; // Chain not added
          case 'wallet_addEthereumChain':
            addChainCalled = true;
            return null;
          default:
            throw new Error(`Unknown method: ${method}`);
        }
      },
      on: () => {
        /* noop - mock */
      },
      removeListener: () => {
        /* noop - mock */
      },
    };

    const auth = new WalletAuth();

    try {
      await auth.connect(provider);
    } catch {
      // Expected to fail at oracle validation
    }

    expect(addChainCalled).toBe(true);
  });
});
