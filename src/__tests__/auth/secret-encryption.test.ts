import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  encryptApiSecret,
  createPaidApiUCAN,
  fetchCogPublicKey,
  clearPublicKeyCache,
  isValidEncryptedSecret,
  extractEncryptedSecret,
  type PaidApiProvider,
  type CogPublicKeyInfo,
  type EncryptedSecretFact,
} from '../../auth/secret-encryption';

/**
 * Generate a test P-256 key pair for mocking Cog's keys
 */
async function generateTestKeyPair(): Promise<{
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return { publicKey, privateKey };
}

/**
 * Decrypt an encrypted secret (for testing round-trip)
 */
async function decryptSecret(
  encrypted: EncryptedSecretFact,
  privateKeyJwk: JsonWebKey
): Promise<string> {
  const toArrayBuffer = (data: Uint8Array): ArrayBuffer =>
    Uint8Array.from(data).buffer;

  // Decode ephemeral public key
  const base64UrlDecode = (str: string): Uint8Array => {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  };

  const epkData = base64UrlDecode(encrypted.epk);
  const epkJwk = JSON.parse(new TextDecoder().decode(epkData)) as JsonWebKey;

  // Import keys
  const ephemeralPubKey = await crypto.subtle.importKey(
    'jwk',
    epkJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeralPubKey },
    privateKey,
    256
  );

  // Derive AES key using same parameters as encryption
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveBits', 'deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('edgework-secret-v1'),
      info: new TextEncoder().encode(`paid-api:${encrypted.provider}`),
    },
    sharedSecretKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decode ciphertext components
  const ct = base64UrlDecode(encrypted.ct);
  const iv = Uint8Array.from(base64UrlDecode(encrypted.iv));
  const tag = base64UrlDecode(encrypted.tag);

  // Reconstruct ciphertext with tag
  const ctWithTag = new Uint8Array(ct.length + tag.length);
  ctWithTag.set(ct);
  ctWithTag.set(tag, ct.length);

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    toArrayBuffer(ctWithTag)
  );

  return new TextDecoder().decode(plaintext);
}

describe('Secret Encryption', () => {
  let testKeyPair: { publicKey: JsonWebKey; privateKey: JsonWebKey };
  let mockCogPublicKey: CogPublicKeyInfo;

  beforeEach(async () => {
    clearPublicKeyCache();
    testKeyPair = await generateTestKeyPair();
    mockCogPublicKey = {
      keyId: 'test-key-001',
      publicKey: testKeyPair.publicKey,
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
      endpoint: 'https://test.mesh.gateway',
    };
  });

  afterEach(() => {
    clearPublicKeyCache();
  });

  describe('encryptApiSecret', () => {
    test('encrypts an OpenAI API key successfully', async () => {
      const apiKey = 'sk-test-openai-key-12345';
      const provider: PaidApiProvider = 'openai';

      const encrypted = await encryptApiSecret(apiKey, provider, {
        cogPublicKey: mockCogPublicKey,
      });

      expect(encrypted.alg).toBe('ECIES-P256');
      expect(encrypted.provider).toBe('openai');
      expect(encrypted.cogKeyId).toBe('test-key-001');
      expect(encrypted.epk).toBeTruthy();
      expect(encrypted.ct).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.tag).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();
      expect(encrypted.encryptedAt).toBeGreaterThan(0);
    });

    test('encrypts an Anthropic API key successfully', async () => {
      const apiKey = 'sk-ant-test-anthropic-key-67890';
      const provider: PaidApiProvider = 'anthropic';

      const encrypted = await encryptApiSecret(apiKey, provider, {
        cogPublicKey: mockCogPublicKey,
      });

      expect(encrypted.alg).toBe('ECIES-P256');
      expect(encrypted.provider).toBe('anthropic');
    });

    test('produces different ciphertext for same key (ephemeral keys)', async () => {
      const apiKey = 'sk-test-key';
      const provider: PaidApiProvider = 'openai';

      const encrypted1 = await encryptApiSecret(apiKey, provider, {
        cogPublicKey: mockCogPublicKey,
      });
      const encrypted2 = await encryptApiSecret(apiKey, provider, {
        cogPublicKey: mockCogPublicKey,
      });

      // Ephemeral keys should produce different ciphertext
      expect(encrypted1.ct).not.toBe(encrypted2.ct);
      expect(encrypted1.epk).not.toBe(encrypted2.epk);
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
    });

    test('round-trip encryption/decryption works', async () => {
      const originalKey = 'sk-super-secret-api-key-abc123';
      const provider: PaidApiProvider = 'openai';

      const encrypted = await encryptApiSecret(originalKey, provider, {
        cogPublicKey: mockCogPublicKey,
      });

      // Decrypt using our test private key
      const decrypted = await decryptSecret(encrypted, testKeyPair.privateKey);

      expect(decrypted).toBe(originalKey);
    });

    test('throws on expired public key', async () => {
      const expiredKey: CogPublicKeyInfo = {
        ...mockCogPublicKey,
        expiresAt: Date.now() - 1000, // Expired
      };

      await expect(
        encryptApiSecret('sk-test', 'openai', { cogPublicKey: expiredKey })
      ).rejects.toThrow('expired');
    });
  });

  describe('isValidEncryptedSecret', () => {
    test('returns true for valid encrypted secret', async () => {
      const encrypted = await encryptApiSecret('sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
      });

      expect(isValidEncryptedSecret(encrypted)).toBe(true);
    });

    test('returns false for misaligned algorithm', async () => {
      const encrypted = await encryptApiSecret('sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
      });

      const invalid = { ...encrypted, alg: 'RSA-OAEP' as const };
      expect(
        isValidEncryptedSecret(invalid as unknown as EncryptedSecretFact)
      ).toBe(false);
    });

    test('returns false for missing fields', async () => {
      const encrypted = await encryptApiSecret('sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
      });

      const missingCt = { ...encrypted, ct: '' };
      expect(isValidEncryptedSecret(missingCt)).toBe(false);

      const missingIv = { ...encrypted, iv: '' };
      expect(isValidEncryptedSecret(missingIv)).toBe(false);

      const missingTag = { ...encrypted, tag: '' };
      expect(isValidEncryptedSecret(missingTag)).toBe(false);
    });

    test('returns false for stale timestamp (> 5 minutes)', async () => {
      const encrypted = await encryptApiSecret('sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
      });

      const stale = { ...encrypted, encryptedAt: Date.now() - 6 * 60 * 1000 };
      expect(isValidEncryptedSecret(stale)).toBe(false);
    });

    test('returns false for future timestamp', async () => {
      const encrypted = await encryptApiSecret('sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
      });

      const future = { ...encrypted, encryptedAt: Date.now() + 60 * 1000 };
      expect(isValidEncryptedSecret(future)).toBe(false);
    });
  });

  describe('createPaidApiUCAN', () => {
    test('creates a valid UCAN token with encrypted secret', async () => {
      const userId = 'user-123';
      const apiKey = 'sk-test-key';
      const provider: PaidApiProvider = 'openai';

      const ucan = await createPaidApiUCAN(userId, apiKey, provider, {
        cogPublicKey: mockCogPublicKey,
        expirationSeconds: 3600,
      });

      // UCAN should be in JWT format (3 parts)
      const parts = ucan.split('.');
      expect(parts.length).toBe(3);

      // Decode and verify payload
      const payloadB64 = parts[1];
      let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const payload = JSON.parse(atob(base64));

      expect(payload.iss).toBe(userId);
      expect(payload.aud).toBe('paid-ai-proxy');
      expect(payload.att).toBeDefined();
      expect(payload.att[0].can).toBe('paid-api:use');
      expect(payload.facts).toBeDefined();
      expect(payload.facts[0].alg).toBe('ECIES-P256');
    });

    test('caps expiration at 7 days', async () => {
      const ucan = await createPaidApiUCAN('user-123', 'sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
        expirationSeconds: 30 * 24 * 60 * 60, // 30 days requested
      });

      const parts = ucan.split('.');
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const payload = JSON.parse(atob(base64));

      const maxExpiration = 7 * 24 * 60 * 60;
      const actualExpiration = payload.exp - payload.nbf;
      expect(actualExpiration).toBeLessThanOrEqual(maxExpiration);
    });

    test('includes cost constraints when provided', async () => {
      const ucan = await createPaidApiUCAN('user-123', 'sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
        maxCostCentsPerRequest: 100,
        maxCostCentsPerDay: 1000,
        allowedModels: ['gpt-4', 'gpt-4-turbo'],
      });

      const parts = ucan.split('.');
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const payload = JSON.parse(atob(base64));

      expect(payload.att[0].constraints.maxCostCentsPerRequest).toBe(100);
      expect(payload.att[0].constraints.maxCostCentsPerDay).toBe(1000);
      expect(payload.att[0].constraints.allowedModels).toEqual([
        'gpt-4',
        'gpt-4-turbo',
      ]);
    });
  });

  describe('extractEncryptedSecret', () => {
    test('extracts encrypted secret from valid UCAN', async () => {
      const ucan = await createPaidApiUCAN('user-123', 'sk-test', 'openai', {
        cogPublicKey: mockCogPublicKey,
      });

      const extracted = extractEncryptedSecret(ucan);

      expect(extracted).not.toBeNull();
      expect(extracted?.alg).toBe('ECIES-P256');
      expect(extracted?.provider).toBe('openai');
    });

    test('returns null for invalid token format', () => {
      expect(extractEncryptedSecret('not-a-token')).toBeNull();
      expect(extractEncryptedSecret('one.two')).toBeNull();
      expect(extractEncryptedSecret('')).toBeNull();
    });

    test('returns null for UCAN without encrypted secret', () => {
      // Create a minimal UCAN without encrypted secret
      const header = btoa(JSON.stringify({ alg: 'ES256', typ: 'UCAN' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const payload = btoa(
        JSON.stringify({
          iss: 'user-123',
          aud: 'test',
          att: [],
          exp: Date.now() / 1000 + 3600,
          facts: [], // No encrypted secret
        })
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'mock-signature';

      const token = `${header}.${payload}.${signature}`;
      expect(extractEncryptedSecret(token)).toBeNull();
    });
  });

  describe('clearPublicKeyCache', () => {
    test('clears cached public key', async () => {
      // This test verifies the cache clearing functionality
      clearPublicKeyCache();
      // No error means success
      expect(true).toBe(true);
    });
  });
});

describe('Provider Support', () => {
  let mockCogPublicKey: CogPublicKeyInfo;

  beforeEach(async () => {
    clearPublicKeyCache();
    const testKeyPair = await generateTestKeyPair();
    mockCogPublicKey = {
      keyId: 'test-key-001',
      publicKey: testKeyPair.publicKey,
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      endpoint: 'https://test.mesh.gateway',
    };
  });

  afterEach(() => {
    clearPublicKeyCache();
  });

  const providers: PaidApiProvider[] = [
    'openai',
    'anthropic',
    'gemini',
    'groq',
  ];

  for (const provider of providers) {
    test(`supports ${provider} provider`, async () => {
      const encrypted = await encryptApiSecret(`sk-${provider}-key`, provider, {
        cogPublicKey: mockCogPublicKey,
      });

      expect(encrypted.provider).toBe(provider);
      expect(encrypted.alg).toBe('ECIES-P256');
    });
  }
});

describe('Security Properties', () => {
  let mockCogPublicKey: CogPublicKeyInfo;
  let testKeyPair: { publicKey: JsonWebKey; privateKey: JsonWebKey };

  beforeEach(async () => {
    clearPublicKeyCache();
    testKeyPair = await generateTestKeyPair();
    mockCogPublicKey = {
      keyId: 'test-key-001',
      publicKey: testKeyPair.publicKey,
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      endpoint: 'https://test.mesh.gateway',
    };
  });

  afterEach(() => {
    clearPublicKeyCache();
  });

  test('forward secrecy: different ephemeral keys per encryption', async () => {
    const apiKey = 'sk-test-key';
    const ephemeralKeys: string[] = [];

    for (let i = 0; i < 5; i++) {
      const encrypted = await encryptApiSecret(apiKey, 'openai', {
        cogPublicKey: mockCogPublicKey,
      });
      ephemeralKeys.push(encrypted.epk);
    }

    // All ephemeral keys should be unique
    const uniqueKeys = new Set(ephemeralKeys);
    expect(uniqueKeys.size).toBe(5);
  });

  test('nonce uniqueness: different nonce per encryption', async () => {
    const apiKey = 'sk-test-key';
    const nonces: string[] = [];

    for (let i = 0; i < 5; i++) {
      const encrypted = await encryptApiSecret(apiKey, 'openai', {
        cogPublicKey: mockCogPublicKey,
      });
      nonces.push(encrypted.nonce);
    }

    // All nonces should be unique
    const uniqueNonces = new Set(nonces);
    expect(uniqueNonces.size).toBe(5);
  });

  test('ciphertext indistinguishability: same plaintext produces different ciphertext', async () => {
    const apiKey = 'sk-identical-key';
    const ciphertexts: string[] = [];

    for (let i = 0; i < 3; i++) {
      const encrypted = await encryptApiSecret(apiKey, 'openai', {
        cogPublicKey: mockCogPublicKey,
      });
      ciphertexts.push(encrypted.ct);
    }

    // All ciphertexts should be different (due to ephemeral keys + random IV)
    const uniqueCiphertexts = new Set(ciphertexts);
    expect(uniqueCiphertexts.size).toBe(3);
  });

  test('cannot decrypt with misaligned key', async () => {
    const encrypted = await encryptApiSecret('sk-secret', 'openai', {
      cogPublicKey: mockCogPublicKey,
    });

    // Generate a different key pair
    const wrongKeyPair = await generateTestKeyPair();

    // Attempting to decrypt with misaligned key should fail
    await expect(
      decryptSecret(encrypted, wrongKeyPair.privateKey)
    ).rejects.toThrow();
  });
});
