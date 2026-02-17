/**
 * Edgework Auth Module
 *
 * Provides authentication and authorization services:
 * - Wallet-based auth (Optimism NFT licenses)
 * - UCAN-based auth (legacy)
 * - Oracle service for license validation
 */

// Core types
export interface AuthSession {
  token: string;
  identity: string;
  capabilities: string[];
}

// Wallet auth
export {
  WalletAuth,
  createWalletAuth,
  checkLicenseNFT,
  type EIP1193Provider,
  type WalletState,
  type LicenseNFT,
} from './wallet';

// Oracle service
export {
  OracleClient,
  MockOracleClient,
  createOracleClient,
  createMockOracleClient,
  type IOracleService,
  type OracleConfig,
  type ChallengeRequest,
  type ChallengeResponse,
  type VerifyRequest,
  type VerifyResponse,
  type LicenseInfo,
  type StreamingAuth,
} from './oracle';

// Zero-knowledge secret encryption for paid API delegation
export {
  encryptApiSecret,
  createPaidApiUCAN,
  fetchCogPublicKey,
  clearPublicKeyCache,
  isValidEncryptedSecret,
  extractEncryptedSecret,
  type PaidApiProvider,
  type CogPublicKeyInfo,
  type EncryptedSecretFact,
  type SecretEncryptionOptions,
  type PaidApiUCANOptions,
} from './secret-encryption';

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  login(token: string): Promise<void>;
  logout(): Promise<void>;
}

type UCANCapability = {
  with: string;
  can: string;
};

// Implementation note: ] implementation
export class EdgeworkAuth implements AuthService {
  private session: AuthSession | null = null;

  async getSession(): Promise<AuthSession | null> {
    return this.session;
  }

  async login(token: string): Promise<void> {
    const verification = await this.verifyUCANToken(token);

    if (!verification.valid) {
      throw new Error(`Authentication failed: ${verification.error}`);
    }

    this.session = {
      token,
      identity: verification.userId || 'unknown',
      capabilities: verification.capabilities || [],
    };
  }

  async logout(): Promise<void> {
    this.session = null;
  }

  /**
   * Verify UCAN token structure and core claims defensively.
   */
  private async verifyUCANToken(token: string): Promise<{
    valid: boolean;
    error?: string;
    userId?: string;
    capabilities?: string[];
  }> {
    try {
      if (!token || token.length > 8192) {
        return { valid: false, error: 'Token missing or too large' };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;
      if (!headerB64 || !payloadB64 || !signatureB64) {
        return { valid: false, error: 'Incomplete token parts' };
      }

      const sessionDecode = (str: string) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        if (typeof atob !== 'undefined') return atob(base64);
        return Buffer.from(base64, 'base64').toString('binary');
      };

      const header = JSON.parse(sessionDecode(headerB64));
      const payload = JSON.parse(sessionDecode(payloadB64));
      const now = Math.floor(Date.now() / 1000);

      if (
        !header ||
        typeof header !== 'object' ||
        (header.alg !== 'EdDSA' && header.alg !== 'ES256K')
      ) {
        return { valid: false, error: 'Unsupported token algorithm' };
      }

      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid token payload' };
      }

      if (typeof payload.iss !== 'string' || payload.iss.length < 3) {
        return { valid: false, error: 'Invalid issuer claim' };
      }

      if (payload.exp && payload.exp < now) {
        return { valid: false, error: 'Token expired' };
      }

      if (payload.nbf && payload.nbf > now) {
        return { valid: false, error: 'Token not yet valid' };
      }

      const capabilities: UCANCapability[] = Array.isArray(payload.att)
        ? (payload.att as UCANCapability[])
        : [];
      if (
        capabilities.some(
          (cap) =>
            !cap ||
            typeof cap !== 'object' ||
            typeof cap.with !== 'string' ||
            typeof cap.can !== 'string'
        )
      ) {
        return { valid: false, error: 'Malformed capability entries' };
      }

      return {
        valid: true,
        userId: payload.iss,
        capabilities: capabilities.map((cap) => `${cap.can}@${cap.with}`),
      };
    } catch (e) {
      return { valid: false, error: 'Token decode failed' };
    }
  }
}
