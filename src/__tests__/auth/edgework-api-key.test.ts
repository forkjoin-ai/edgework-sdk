import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createEdgeworkAuthHeader,
  resolveEdgeworkApiKey,
} from '../../edgework-api-key';

describe('edgework-api-key helpers', () => {
  let originalApiKey: string | undefined;
  let originalApiToken: string | undefined;
  let originalEwApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.EDGEWORK_API_KEY;
    originalApiToken = process.env.EDGEWORK_API_TOKEN;
    originalEwApiKey = process.env.EW_API_KEY;
    delete process.env.EDGEWORK_API_KEY;
    delete process.env.EDGEWORK_API_TOKEN;
    delete process.env.EW_API_KEY;
  });

  afterEach(() => {
    if (typeof originalApiKey === 'string') {
      process.env.EDGEWORK_API_KEY = originalApiKey;
    } else {
      delete process.env.EDGEWORK_API_KEY;
    }

    if (typeof originalApiToken === 'string') {
      process.env.EDGEWORK_API_TOKEN = originalApiToken;
    } else {
      delete process.env.EDGEWORK_API_TOKEN;
    }

    if (typeof originalEwApiKey === 'string') {
      process.env.EW_API_KEY = originalEwApiKey;
    } else {
      delete process.env.EW_API_KEY;
    }
  });

  test('prefers explicit api key over environment variable', () => {
    process.env.EDGEWORK_API_KEY = 'env-key';

    const resolved = resolveEdgeworkApiKey('explicit-key');

    expect(resolved).toBe('explicit-key');
  });

  test('falls back to EDGEWORK_API_KEY when explicit api key is missing', () => {
    process.env.EDGEWORK_API_KEY = 'env-key';

    const resolved = resolveEdgeworkApiKey();

    expect(resolved).toBe('env-key');
  });

  test('falls back to EDGEWORK_API_TOKEN when EDGEWORK_API_KEY is missing', () => {
    process.env.EDGEWORK_API_TOKEN = 'token-key';

    const resolved = resolveEdgeworkApiKey();

    expect(resolved).toBe('token-key');
  });

  test('falls back to EW_API_KEY when other env vars are missing', () => {
    process.env.EW_API_KEY = 'short-key';

    const resolved = resolveEdgeworkApiKey();

    expect(resolved).toBe('short-key');
  });

  test('prefers EDGEWORK_API_KEY over fallback env vars', () => {
    process.env.EDGEWORK_API_KEY = 'primary-key';
    process.env.EDGEWORK_API_TOKEN = 'secondary-key';
    process.env.EW_API_KEY = 'tertiary-key';

    const resolved = resolveEdgeworkApiKey();

    expect(resolved).toBe('primary-key');
  });

  test('treats blank explicit api key as missing and uses env fallback', () => {
    process.env.EDGEWORK_API_KEY = 'env-key';

    const resolved = resolveEdgeworkApiKey('   ');

    expect(resolved).toBe('env-key');
  });

  test('returns empty auth header when no api key is available', () => {
    const headers = createEdgeworkAuthHeader();

    expect(headers).toEqual({});
  });

  test('returns bearer auth header when api key is available', () => {
    process.env.EDGEWORK_API_KEY = 'env-key';

    const headers = createEdgeworkAuthHeader();

    expect(headers).toEqual({
      Authorization: 'Bearer env-key',
    });
  });
});
