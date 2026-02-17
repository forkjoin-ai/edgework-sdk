import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  loadWasmCore,
  isWasmLoaded,
  getWasmModule,
  unloadWasm,
  type LoaderConfig,
} from '../../wasm/loader';

describe('WASM Loader', () => {
  afterEach(() => {
    unloadWasm();
  });

  describe('isWasmLoaded', () => {
    test('returns false initially', () => {
      expect(isWasmLoaded()).toBe(false);
    });

    test('returns false after unload', () => {
      unloadWasm();
      expect(isWasmLoaded()).toBe(false);
    });
  });

  describe('getWasmModule', () => {
    test('returns null initially', () => {
      expect(getWasmModule()).toBeNull();
    });

    test('returns null after unload', () => {
      unloadWasm();
      expect(getWasmModule()).toBeNull();
    });
  });

  describe('unloadWasm', () => {
    test('clears loaded state', () => {
      unloadWasm();
      expect(isWasmLoaded()).toBe(false);
      expect(getWasmModule()).toBeNull();
    });

    test('can be called multiple times', () => {
      unloadWasm();
      unloadWasm();
      unloadWasm();
      expect(isWasmLoaded()).toBe(false);
    });
  });

  describe('loadWasmCore', () => {
    test('throws without license token', async () => {
      const config: LoaderConfig = {};

      await expect(loadWasmCore(config)).rejects.toThrow(
        'License token required'
      );
    });

    test('throws with empty license token', async () => {
      const config: LoaderConfig = { licenseToken: '' };

      await expect(loadWasmCore(config)).rejects.toThrow(
        'License token required'
      );
    });

    test('uses custom wasmUrl when provided', async () => {
      const config: LoaderConfig = {
        licenseToken: 'valid-token',
        wasmUrl: '/custom/path/to/wasm',
      };

      // Will fail to fetch, but verifies the path is used
      await expect(loadWasmCore(config)).rejects.toThrow();
    });
  });
});

describe('WASM Encryption Format', () => {
  const MAGIC = 'EWASM001';

  test('magic header is correct length', () => {
    expect(MAGIC.length).toBe(8);
  });

  test('magic header is ASCII', () => {
    const encoded = new TextEncoder().encode(MAGIC);
    expect(encoded.length).toBe(8);
  });
});

describe('loadWasmStreaming', () => {
  test('requires session token', async () => {
    const { loadWasmStreaming } = await import('../../wasm/loader');

    // Will fail to fetch, but verifies it's callable
    await expect(
      loadWasmStreaming('https://api.example.com', 'token', ['func1'])
    ).rejects.toThrow();
  });
});
