import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  resolveAffectivelyApiKey,
  createAffectivelyAuthHeader,
  isAffectivelyAvailable,
  isValidAffectivelyApiKey,
  AFFECTIVELY_API_KEY_ENV_VAR,
} from '../affectively-api-key';

describe('affectively-api-key', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[AFFECTIVELY_API_KEY_ENV_VAR];
    delete process.env['VITE_AFFECTIVELY_API_KEY'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isValidAffectivelyApiKey', () => {
    it('accepts af_ prefix', () => {
      expect(isValidAffectivelyApiKey('af_123456')).toBe(true);
    });

    it('accepts af_live_ prefix', () => {
      expect(isValidAffectivelyApiKey('af_live_abc123')).toBe(true);
    });

    it('accepts af_test_ prefix', () => {
      expect(isValidAffectivelyApiKey('af_test_xyz789')).toBe(true);
    });

    it('accepts af_dev_ prefix', () => {
      expect(isValidAffectivelyApiKey('af_dev_foo')).toBe(true);
    });

    it('rejects keys without valid prefix', () => {
      expect(isValidAffectivelyApiKey('sk_123456')).toBe(false);
      expect(isValidAffectivelyApiKey('invalid_key')).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(isValidAffectivelyApiKey('')).toBe(false);
    });
  });

  describe('resolveAffectivelyApiKey', () => {
    it('returns explicit key when provided', () => {
      expect(resolveAffectivelyApiKey('af_explicit')).toBe('af_explicit');
    });

    it('returns env var when no explicit key', () => {
      process.env[AFFECTIVELY_API_KEY_ENV_VAR] = 'af_from_env';
      expect(resolveAffectivelyApiKey()).toBe('af_from_env');
    });

    it('returns undefined when nothing is set', () => {
      expect(resolveAffectivelyApiKey()).toBeUndefined();
    });

    it('prefers explicit key over env var', () => {
      process.env[AFFECTIVELY_API_KEY_ENV_VAR] = 'af_env';
      expect(resolveAffectivelyApiKey('af_param')).toBe('af_param');
    });

    it('ignores empty explicit key', () => {
      process.env[AFFECTIVELY_API_KEY_ENV_VAR] = 'af_env';
      expect(resolveAffectivelyApiKey('')).toBe('af_env');
    });

    it('ignores whitespace-only explicit key', () => {
      process.env[AFFECTIVELY_API_KEY_ENV_VAR] = 'af_env';
      expect(resolveAffectivelyApiKey('   ')).toBe('af_env');
    });

    it('returns VITE env var as fallback', () => {
      process.env['VITE_AFFECTIVELY_API_KEY'] = 'af_vite_key';
      expect(resolveAffectivelyApiKey()).toBe('af_vite_key');
    });
  });

  describe('createAffectivelyAuthHeader', () => {
    it('returns Authorization header with resolved key', () => {
      const headers = createAffectivelyAuthHeader('af_test_key');
      expect(headers).toEqual({ Authorization: 'Bearer af_test_key' });
    });

    it('returns empty object when no key', () => {
      const headers = createAffectivelyAuthHeader();
      expect(headers).toEqual({});
    });

    it('returns empty object for null key', () => {
      const headers = createAffectivelyAuthHeader(null);
      expect(headers).toEqual({});
    });
  });

  describe('isAffectivelyAvailable', () => {
    it('returns true when key is resolvable', () => {
      process.env[AFFECTIVELY_API_KEY_ENV_VAR] = 'af_test_available';
      expect(isAffectivelyAvailable()).toBe(true);
    });

    it('returns false when no key', () => {
      expect(isAffectivelyAvailable()).toBe(false);
    });

    it('returns true with explicit key', () => {
      expect(isAffectivelyAvailable('af_explicit')).toBe(true);
    });
  });
});
