/**
 * Oracle Service Interface
 *
 * Defines the interface for the license validation oracle.
 * The oracle verifies wallet signatures and checks on-chain license NFTs.
 */

import type { AuthSession } from './index';

/**
 * Oracle configuration
 */
export interface OracleConfig {
  endpoint: string;
  timeout?: number;
  retryCount?: number;
}

/**
 * Challenge request
 */
export interface ChallengeRequest {
  address: string;
}

/**
 * Challenge response from oracle
 */
export interface ChallengeResponse {
  challenge: string;
  expiresAt: number;
  nonce: string;
}

/**
 * Verification request
 */
export interface VerifyRequest {
  address: string;
  challenge: string;
  signature: string;
  nonce: string;
}

/**
 * Verification response
 */
export interface VerifyResponse {
  valid: boolean;
  jwt?: string;
  session?: AuthSession;
  error?: string;
  licenseInfo?: LicenseInfo;
}

/**
 * License information from on-chain
 */
export interface LicenseInfo {
  tokenId: string;
  tier: number;
  expiry: number;
  capabilities: string[];
  transferable: boolean;
}

/**
 * Streaming authorization
 */
export interface StreamingAuth {
  token: string;
  expiresAt: number;
  allowedFunctions: string[];
  rateLimit: number;
}

/**
 * Oracle service interface
 */
export interface IOracleService {
  /**
   * Request a challenge for wallet signature
   */
  getChallenge(address: string): Promise<ChallengeResponse>;

  /**
   * Verify wallet signature and return session
   */
  verify(request: VerifyRequest): Promise<VerifyResponse>;

  /**
   * Refresh an existing session
   */
  refresh(sessionId: string): Promise<VerifyResponse>;

  /**
   * Revoke a session
   */
  revoke(sessionId: string): Promise<void>;

  /**
   * Get streaming authorization for CLI
   */
  getStreamingAuth(
    sessionId: string,
    functions: string[]
  ): Promise<StreamingAuth>;

  /**
   * Check license status without full verification
   */
  checkLicense(address: string): Promise<LicenseInfo | null>;
}

/**
 * Oracle client implementation
 */
export class OracleClient implements IOracleService {
  private config: Required<OracleConfig>;

  constructor(config: OracleConfig) {
    this.config = {
      endpoint: config.endpoint,
      timeout: config.timeout ?? 30000,
      retryCount: config.retryCount ?? 3,
    };
  }

  async getChallenge(address: string): Promise<ChallengeResponse> {
    const response = await this.fetch('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });

    return response as ChallengeResponse;
  }

  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    const response = await this.fetch('/auth/verify', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    return response as VerifyResponse;
  }

  async refresh(sessionId: string): Promise<VerifyResponse> {
    const response = await this.fetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });

    return response as VerifyResponse;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.fetch('/auth/revoke', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async getStreamingAuth(
    sessionId: string,
    functions: string[]
  ): Promise<StreamingAuth> {
    const response = await this.fetch('/auth/streaming', {
      method: 'POST',
      body: JSON.stringify({ sessionId, functions }),
    });

    return response as StreamingAuth;
  }

  async checkLicense(address: string): Promise<LicenseInfo | null> {
    try {
      const response = await this.fetch(`/license/${address}`, {
        method: 'GET',
      });

      return response as LicenseInfo;
    } catch {
      return null;
    }
  }

  private async fetch(path: string, options: RequestInit): Promise<unknown> {
    const url = `${this.config.endpoint}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Oracle request failed: ${response.status} - ${error}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Mock oracle for testing
 */
export class MockOracleClient implements IOracleService {
  private sessions: Map<string, AuthSession> = new Map();
  private challenges: Map<string, ChallengeResponse> = new Map();

  async getChallenge(address: string): Promise<ChallengeResponse> {
    const challenge: ChallengeResponse = {
      challenge: `Sign this message to authenticate with Edgework:\n\nAddress: ${address}\nTimestamp: ${Date.now()}\nNonce: ${Math.random()
        .toString(36)
        .slice(2)}`,
      expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      nonce: Math.random().toString(36).slice(2),
    };

    this.challenges.set(address, challenge);
    return challenge;
  }

  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    const storedChallenge = this.challenges.get(request.address);

    if (!storedChallenge || storedChallenge.challenge !== request.challenge) {
      return { valid: false, error: 'Invalid challenge' };
    }

    if (Date.now() / 1000 > storedChallenge.expiresAt) {
      return { valid: false, error: 'Challenge expired' };
    }

    // In mock, we don't verify the signature - just check format
    if (!request.signature.startsWith('0x')) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const sessionId = `session_${Math.random().toString(36).slice(2)}`;
    const session: AuthSession = {
      token: `jwt_${Math.random().toString(36).slice(2)}`,
      identity: request.address,
      capabilities: ['inference', 'distributed', 'streaming'],
    };

    this.sessions.set(sessionId, session);
    this.challenges.delete(request.address);

    return {
      valid: true,
      jwt: session.token,
      session,
      licenseInfo: {
        tokenId: '1',
        tier: 2, // Pro
        expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        capabilities: session.capabilities,
        transferable: true,
      },
    };
  }

  async refresh(sessionId: string): Promise<VerifyResponse> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    return {
      valid: true,
      jwt: session.token,
      session,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getStreamingAuth(
    sessionId: string,
    functions: string[]
  ): Promise<StreamingAuth> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    return {
      token: `stream_${Math.random().toString(36).slice(2)}`,
      expiresAt: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      allowedFunctions: functions,
      rateLimit: 100, // requests per minute
    };
  }

  async checkLicense(address: string): Promise<LicenseInfo | null> {
    // Mock: return a pro license for any address
    return {
      tokenId: '1',
      tier: 2,
      expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      capabilities: ['inference', 'distributed', 'streaming'],
      transferable: true,
    };
  }
}

/**
 * Create an oracle client
 */
export function createOracleClient(config: OracleConfig): IOracleService {
  return new OracleClient(config);
}

/**
 * Create a mock oracle client for testing
 */
export function createMockOracleClient(): IOracleService {
  return new MockOracleClient();
}
