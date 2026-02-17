/**
 * Zero-Knowledge Secret Encryption for Edgework SDK
 *
 * Implements ECIES (Elliptic Curve Integrated Encryption Scheme) for
 * zero-knowledge API key handling. Users encrypt their API keys client-side
 * using Cog's public key - the platform never sees plaintext secrets.
 *
 * Encryption flow:
 * 1. Fetch Cog's P-256 public key from gateway
 * 2. Generate ephemeral ECDH key pair (forward secrecy)
 * 3. Derive shared secret via ECDH
 * 4. Derive AES-256 key from shared secret using HKDF
 * 5. Encrypt API key with AES-256-GCM
 * 6. Return encrypted blob for UCAN fct field
 *
 * @security Forward secrecy via ephemeral keys per encryption
 * @security Replay protection via nonce and timestamp
 * @security Time-boxed by UCAN expiration
 */

/**
 * Supported paid API providers
 */
export type PaidApiProvider = 'openai' | 'anthropic' | 'gemini' | 'groq';

/**
 * Cog public key information
 */
export interface CogPublicKeyInfo {
  keyId: string;
  publicKey: JsonWebKey;
  expiresAt: number;
  endpoint: string;
}

/**
 * Encrypted secret structure for UCAN fct field
 */
export interface EncryptedSecretFact {
  alg: 'ECIES-P256';
  epk: string;
  ct: string;
  iv: string;
  tag: string;
  cogKeyId: string;
  provider: PaidApiProvider;
  nonce: string;
  encryptedAt: number;
}

/**
 * Options for secret encryption
 */
export interface SecretEncryptionOptions {
  /** Mesh gateway endpoint (default: https://mesh.affectively.ai) */
  gatewayEndpoint?: string;
  /** Override public key (for testing) */
  cogPublicKey?: CogPublicKeyInfo;
  /** Cache TTL for public key in ms (default: 1 hour) */
  publicKeyCacheTtl?: number;
}

/**
 * Options for creating a paid API UCAN
 */
export interface PaidApiUCANOptions extends SecretEncryptionOptions {
  /** Expiration in seconds (default: 3600 = 1 hour, max: 604800 = 7 days) */
  expirationSeconds?: number;
  /** Maximum cost in cents per request */
  maxCostCentsPerRequest?: number;
  /** Maximum cost in cents per day */
  maxCostCentsPerDay?: number;
  /** Allowed models (empty = all allowed) */
  allowedModels?: string[];
}

// Default gateway endpoint
const DEFAULT_GATEWAY = 'https://mesh.affectively.ai';

// Maximum expiration (7 days in seconds)
const MAX_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;

// Public key cache
let cachedPublicKey: CogPublicKeyInfo | null = null;
let cacheExpiresAt = 0;

/**
 * Base64url encode a string
 */
function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64url decode a string
 */
function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Fetch Cog's public key from mesh gateway
 *
 * The public key is cached for 1 hour by default.
 *
 * @param gatewayEndpoint - Gateway URL
 * @param cacheTtl - Cache TTL in ms
 * @returns Cog's public key info
 */
export async function fetchCogPublicKey(
  gatewayEndpoint = DEFAULT_GATEWAY,
  cacheTtl = 60 * 60 * 1000 // 1 hour
): Promise<CogPublicKeyInfo> {
  // Return cached key if still valid
  if (cachedPublicKey && Date.now() < cacheExpiresAt) {
    return cachedPublicKey;
  }

  const response = await fetch(
    `${gatewayEndpoint}/.well-known/cog-public-key.json`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Cog public key: ${response.status}`);
  }

  const data = (await response.json()) as {
    keyId: string;
    publicKey: JsonWebKey;
    expiresAt: number;
    algorithm: string;
  };

  // Validate key type
  if (data.publicKey?.kty !== 'EC' || data.publicKey?.crv !== 'P-256') {
    throw new Error('Invalid Cog public key format - expected EC P-256');
  }

  cachedPublicKey = {
    keyId: data.keyId,
    publicKey: data.publicKey,
    expiresAt: data.expiresAt,
    endpoint: gatewayEndpoint,
  };

  // Set cache expiration (use min of TTL and key expiration)
  cacheExpiresAt = Math.min(Date.now() + cacheTtl, data.expiresAt);

  return cachedPublicKey;
}

/**
 * Clear the cached public key (useful for testing or key rotation)
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
  cacheExpiresAt = 0;
}

/**
 * Encrypt an API secret for zero-knowledge transmission
 *
 * Uses ECIES (Elliptic Curve Integrated Encryption Scheme):
 * 1. Generate ephemeral ECDH key pair
 * 2. Compute shared secret with Cog's public key
 * 3. Derive AES-256 key using HKDF
 * 4. Encrypt API key with AES-256-GCM
 *
 * @param apiKey - The API key to encrypt (plaintext)
 * @param provider - API provider (openai, anthropic, etc.)
 * @param options - Encryption options
 * @returns Encrypted secret fact for UCAN
 *
 * @security The apiKey parameter is used only for encryption and not stored
 * @security Ephemeral keys provide forward secrecy
 */
export async function encryptApiSecret(
  apiKey: string,
  provider: PaidApiProvider,
  options: SecretEncryptionOptions = {}
): Promise<EncryptedSecretFact> {
  // 1. Get Cog's public key
  const cogKey =
    options.cogPublicKey ??
    (await fetchCogPublicKey(
      options.gatewayEndpoint,
      options.publicKeyCacheTtl
    ));

  // Check if key has expired
  if (cogKey.expiresAt < Date.now()) {
    clearPublicKeyCache();
    throw new Error(
      'Cog public key has expired - please retry to fetch a new key'
    );
  }

  // 2. Import Cog's public key for ECDH
  const cogPubKey = await crypto.subtle.importKey(
    'jwk',
    cogKey.publicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 3. Generate ephemeral key pair (for forward secrecy)
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable for export
    ['deriveBits']
  );

  // 4. Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: cogPubKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // 5. Derive AES key using HKDF
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
      info: new TextEncoder().encode(`paid-api:${provider}`),
    },
    sharedSecretKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // 6. Encrypt the API key with AES-256-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(apiKey);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    plaintext
  );

  // 7. Export ephemeral public key as JWK
  const ephemeralPubKeyJwk = await crypto.subtle.exportKey(
    'jwk',
    ephemeralKeyPair.publicKey
  );

  // 8. Separate ciphertext and authentication tag
  // AES-GCM appends the tag to the ciphertext
  const ctWithTag = new Uint8Array(ciphertext);
  const ct = ctWithTag.slice(0, -16);
  const tag = ctWithTag.slice(-16);

  // 9. Build encrypted secret fact
  return {
    alg: 'ECIES-P256',
    epk: base64UrlEncode(JSON.stringify(ephemeralPubKeyJwk)),
    ct: base64UrlEncode(ct),
    iv: base64UrlEncode(iv),
    tag: base64UrlEncode(tag),
    cogKeyId: cogKey.keyId,
    provider,
    nonce: crypto.randomUUID(),
    encryptedAt: Date.now(),
  };
}

/**
 * Create a UCAN token with an encrypted API secret
 *
 * This is the main function for zero-knowledge API delegation.
 * The resulting UCAN can be used to make paid API requests through
 * the paid-ai-proxy without exposing the API key.
 *
 * @param userId - User ID (issuer)
 * @param apiKey - The API key to encrypt and embed
 * @param provider - API provider
 * @param options - UCAN options
 * @returns UCAN token string (JWT-like format)
 *
 * @example
 * ```typescript
 * const ucan = await createPaidApiUCAN(
 *   'user-123',
 *   'sk-abc123...',  // Your OpenAI key (encrypted, never sent in plaintext)
 *   'openai',
 *   { expirationSeconds: 3600 }
 * );
 *
 * // Use in request
 * fetch('https://paid-ai-proxy.affectively.ai/v1/chat/completions', {
 *   headers: { 'Authorization': `Bearer ${ucan}` }
 * });
 * ```
 */
export async function createPaidApiUCAN(
  userId: string,
  apiKey: string,
  provider: PaidApiProvider,
  options: PaidApiUCANOptions = {}
): Promise<string> {
  // Validate and cap expiration
  const expirationSeconds = Math.min(
    options.expirationSeconds ?? 3600,
    MAX_EXPIRATION_SECONDS
  );

  // Encrypt the secret
  const encryptedSecret = await encryptApiSecret(apiKey, provider, {
    gatewayEndpoint: options.gatewayEndpoint,
    cogPublicKey: options.cogPublicKey,
    publicKeyCacheTtl: options.publicKeyCacheTtl,
  });

  // Build UCAN payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: userId,
    aud: 'paid-ai-proxy',
    att: [
      {
        can: 'paid-api:use',
        with: `provider:${provider}:user:${userId}`,
        constraints: {
          ...(options.maxCostCentsPerRequest && {
            maxCostCentsPerRequest: options.maxCostCentsPerRequest,
          }),
          ...(options.maxCostCentsPerDay && {
            maxCostCentsPerDay: options.maxCostCentsPerDay,
          }),
          ...(options.allowedModels?.length && {
            allowedModels: options.allowedModels,
          }),
        },
      },
    ],
    exp: now + expirationSeconds,
    nbf: now,
    nonce: crypto.randomUUID(),
    facts: [encryptedSecret as unknown as Record<string, unknown>],
  };

  // Build header
  const header = {
    alg: 'ES256',
    typ: 'UCAN',
  };

  // Encode header and payload
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));

  // Current behavior: create unsigned token (signature will be added by auth service)
  // Implementation note: , this would be signed with the user's key
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Sign with a placeholder (real implementation would use user's signing key)
  // The mesh gateway will verify this signature
  const signature = await signPayload(unsignedToken, userId);

  return `${unsignedToken}.${signature}`;
}

/**
 * Sign a UCAN payload
 *
 * Note: In production, this uses the user's signing key from secure storage.
 * This implementation provides a placeholder that should be replaced with
 * proper key management integration.
 *
 * @param payload - The payload to sign
 * @param userId - User ID for key lookup
 * @returns Base64url-encoded signature
 */
async function signPayload(payload: string, userId: string): Promise<string> {
  // Implementation note: get user's signing key from secure storage
  // Current behavior: : derive a key from userId + environment secret
  // This should be replaced with proper key management

  const encoder = new TextEncoder();

  // Get or generate signing key for user
  // Implementation note: , this would come from secure key storage
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`user-signing-key-${userId}`),
    'HKDF',
    false,
    ['deriveBits', 'deriveKey']
  );

  const signingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('edgework-ucan-signing-v1'),
      info: encoder.encode(userId),
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the payload
  const signature = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    encoder.encode(payload)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Check if an encrypted secret fact is valid (not expired, correct format)
 *
 * @param fact - The encrypted secret fact to validate
 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
 * @returns true if valid
 */
export function isValidEncryptedSecret(
  fact: EncryptedSecretFact,
  maxAgeMs = 5 * 60 * 1000
): boolean {
  if (fact.alg !== 'ECIES-P256') return false;
  if (!fact.epk || !fact.ct || !fact.iv || !fact.tag) return false;
  if (!fact.cogKeyId || !fact.provider || !fact.nonce) return false;

  // Check timestamp freshness
  const age = Date.now() - fact.encryptedAt;
  if (age < 0 || age > maxAgeMs) return false;

  return true;
}

/**
 * Extract encrypted secret from a UCAN token
 *
 * @param tokenString - UCAN token string
 * @returns Encrypted secret fact or null if not found
 */
export function extractEncryptedSecret(
  tokenString: string
): EncryptedSecretFact | null {
  try {
    const parts = tokenString.split('.');
    if (parts.length !== 3) return null;

    const payloadB64 = parts[1];
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    );

    const facts = payload.facts || payload.fct || [];
    const secretFact = facts.find(
      (f: Record<string, unknown>) =>
        f.alg === 'ECIES-P256' && f.ct && f.provider
    );

    return secretFact || null;
  } catch {
    return null;
  }
}
