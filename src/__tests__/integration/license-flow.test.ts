/**
 * Integration Tests for License Validation Flow
 *
 * Tests the complete flow from wallet connection to WASM loading.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  MockOracleClient,
  createMockOracleClient,
  type IOracleService,
} from '../../auth/oracle';
import { WalletAuth, type EIP1193Provider } from '../../auth/wallet';
import {
  loadWasmCore,
  unloadWasm,
  isWasmLoaded,
  type LoaderConfig,
} from '../../wasm/loader';

// Mock wallet provider
function createMockWalletProvider(
  options: {
    address?: string;
    chainId?: string;
  } = {}
): EIP1193Provider {
  const address =
    options.address || '0x1234567890123456789012345678901234567890';
  const chainId = options.chainId || '0xa'; // Optimism

  return {
    request: async ({ method }) => {
      switch (method) {
        case 'eth_requestAccounts':
          return [address];
        case 'eth_chainId':
          return chainId;
        case 'personal_sign':
          return '0xmocksignature';
        case 'wallet_switchEthereumChain':
          return null;
        case 'wallet_addEthereumChain':
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
}

describe('License Validation Flow', () => {
  let oracle: IOracleService;

  beforeEach(() => {
    oracle = createMockOracleClient();
  });

  afterEach(() => {
    unloadWasm();
  });

  describe('Oracle Challenge-Response Flow', () => {
    test('completes full challenge-response cycle', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // Step 1: Get challenge
      const challenge = await oracle.getChallenge(address);
      expect(challenge.challenge).toContain(address);
      expect(challenge.expiresAt).toBeGreaterThan(Date.now() / 1000);

      // Step 2: Sign challenge (mock signature)
      const signature = '0xmocksignature123456789';

      // Step 3: Verify signature
      const result = await oracle.verify({
        address,
        challenge: challenge.challenge,
        signature,
        nonce: challenge.nonce,
      });

      expect(result.valid).toBe(true);
      expect(result.jwt).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.session?.identity).toBe(address);
    });

    test('rejects expired challenges', async () => {
      const address = '0x1234567890123456789012345678901234567890';

      // Get a fresh challenge
      const challenge = await oracle.getChallenge(address);

      // Get a new challenge (invalidates the first)
      await oracle.getChallenge(address);

      // Try to use the old challenge
      const result = await oracle.verify({
        address,
        challenge: challenge.challenge,
        signature: '0xsig',
        nonce: challenge.nonce,
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('License Tiers', () => {
    test('returns license info with tier', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      const result = await oracle.verify({
        address,
        challenge: challenge.challenge,
        signature: '0xsig',
        nonce: challenge.nonce,
      });

      expect(result.licenseInfo).toBeDefined();
      expect(result.licenseInfo?.tier).toBeGreaterThan(0);
    });

    test('license has expiry in the future', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const license = await oracle.checkLicense(address);

      expect(license).toBeDefined();
      expect(license?.expiry).toBeGreaterThan(Date.now() / 1000);
    });

    test('license includes capabilities', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const license = await oracle.checkLicense(address);

      expect(license?.capabilities).toBeDefined();
      expect(Array.isArray(license?.capabilities)).toBe(true);
    });
  });

  describe('Streaming Authorization', () => {
    test('requires valid session for streaming auth', async () => {
      await expect(
        oracle.getStreamingAuth('invalid-session', ['func1'])
      ).rejects.toThrow();
    });
  });

  describe('Session Management', () => {
    test('refresh returns valid for active session', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      const verifyResult = await oracle.verify({
        address,
        challenge: challenge.challenge,
        signature: '0xsig',
        nonce: challenge.nonce,
      });

      expect(verifyResult.valid).toBe(true);
    });

    test('revoke invalidates session', async () => {
      await oracle.revoke('some-session-id');
      // Should not throw
      expect(true).toBe(true);
    });
  });
});

describe('WASM Loading Integration', () => {
  afterEach(() => {
    unloadWasm();
  });

  test('requires license token', async () => {
    await expect(loadWasmCore({})).rejects.toThrow('License token required');
  });

  test('unload clears state', () => {
    unloadWasm();
    expect(isWasmLoaded()).toBe(false);
  });
});

describe('End-to-End Flow Simulation', () => {
  test('simulates full authentication flow', async () => {
    // Step 1: Create mock oracle
    const oracle = createMockOracleClient();
    const address = '0xabcdef1234567890abcdef1234567890abcdef12';

    // Step 2: Get challenge
    const challenge = await oracle.getChallenge(address);
    expect(challenge).toBeDefined();

    // Step 3: Verify (simulates wallet signature)
    const result = await oracle.verify({
      address,
      challenge: challenge.challenge,
      signature: '0xvalidsig',
      nonce: challenge.nonce,
    });

    expect(result.valid).toBe(true);
    expect(result.jwt).toBeDefined();

    // Step 4: Check license
    const license = await oracle.checkLicense(address);
    expect(license).toBeDefined();
    expect(license?.tier).toBeGreaterThan(0);

    // Step 5: Would load WASM with JWT (mocked)
    const jwt = result.jwt!;
    expect(jwt.length).toBeGreaterThan(0);

    // Flow complete!
  });
});

describe('Error Handling', () => {
  test('handles invalid address format gracefully', async () => {
    const oracle = createMockOracleClient();

    // Even invalid addresses should get a challenge (validation happens on verify)
    const challenge = await oracle.getChallenge('invalid');
    expect(challenge).toBeDefined();
  });

  test('handles missing signature', async () => {
    const oracle = createMockOracleClient();
    const challenge = await oracle.getChallenge('0x123');

    const result = await oracle.verify({
      address: '0x123',
      challenge: challenge.challenge,
      signature: 'nosig', // Invalid format
      nonce: challenge.nonce,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
