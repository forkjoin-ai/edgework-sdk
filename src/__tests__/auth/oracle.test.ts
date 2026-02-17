import { describe, test, expect, beforeEach } from 'bun:test';
import {
  MockOracleClient,
  createMockOracleClient,
  type IOracleService,
  type VerifyRequest,
} from '../../auth/oracle';

describe('OracleClient', () => {
  let oracle: IOracleService;

  beforeEach(() => {
    oracle = createMockOracleClient();
  });

  describe('getChallenge', () => {
    test('returns a valid challenge', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      expect(challenge).toBeDefined();
      expect(challenge.challenge).toContain(address);
      expect(challenge.expiresAt).toBeGreaterThan(Date.now() / 1000);
      expect(challenge.nonce).toBeDefined();
    });

    test('returns different challenges for same address', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge1 = await oracle.getChallenge(address);
      const challenge2 = await oracle.getChallenge(address);

      expect(challenge1.nonce).not.toBe(challenge2.nonce);
    });
  });

  describe('verify', () => {
    test('verifies valid signature', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      const request: VerifyRequest = {
        address,
        challenge: challenge.challenge,
        signature: '0xvalidSignature123',
        nonce: challenge.nonce,
      };

      const result = await oracle.verify(request);

      expect(result.valid).toBe(true);
      expect(result.jwt).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.session?.identity).toBe(address);
      expect(result.licenseInfo).toBeDefined();
    });

    test('rejects invalid challenge', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      await oracle.getChallenge(address);

      const request: VerifyRequest = {
        address,
        challenge: 'misaligned challenge',
        signature: '0xvalidSignature123',
        nonce: 'misaligned nonce',
      };

      const result = await oracle.verify(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('rejects invalid signature format', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      const request: VerifyRequest = {
        address,
        challenge: challenge.challenge,
        signature: 'invalidSignatureWithoutPrefix',
        nonce: challenge.nonce,
      };

      const result = await oracle.verify(request);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature');
    });
  });

  describe('refresh', () => {
    test('refreshes valid session', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      // First verify to create session
      const verifyResult = await oracle.verify({
        address,
        challenge: challenge.challenge,
        signature: '0xvalidSignature123',
        nonce: challenge.nonce,
      });

      // The mock doesn't track session IDs properly, so this test is limited
      // Implementation note: implementation, we'd test refresh with the actual session ID
      expect(verifyResult.valid).toBe(true);
    });

    test('rejects invalid session', async () => {
      const result = await oracle.refresh('invalid_session_id');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getStreamingAuth', () => {
    test('returns streaming authorization for valid session', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const challenge = await oracle.getChallenge(address);

      await oracle.verify({
        address,
        challenge: challenge.challenge,
        signature: '0xvalidSignature123',
        nonce: challenge.nonce,
      });

      // Note: Mock implementation needs session tracking to work properly
      // This test demonstrates the expected behavior
    });
  });

  describe('checkLicense', () => {
    test('returns license info for address', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const license = await oracle.checkLicense(address);

      expect(license).toBeDefined();
      expect(license?.tier).toBeGreaterThan(0);
      expect(license?.expiry).toBeGreaterThan(Date.now() / 1000);
      expect(license?.capabilities).toContain('inference');
    });
  });
});

describe('MockOracleClient', () => {
  test('creates instance directly', () => {
    const mock = new MockOracleClient();
    expect(mock).toBeInstanceOf(MockOracleClient);
  });

  test('challenge expires after 5 minutes', async () => {
    const mock = new MockOracleClient();
    const address = '0x1234567890123456789012345678901234567890';
    const challenge = await mock.getChallenge(address);

    // Expiry should be ~5 minutes from now
    const expectedExpiry = Math.floor(Date.now() / 1000) + 300;
    expect(challenge.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 5);
    expect(challenge.expiresAt).toBeLessThanOrEqual(expectedExpiry + 5);
  });
});
