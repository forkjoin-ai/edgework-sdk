/**
 * WASM Loader with Decryption
 *
 * Loads and decrypts the encrypted WASM core module.
 * Requires a valid license token from the oracle.
 */

// Header structure:
// bytes 0-7:   Magic "EWASM001"
// bytes 8-11:  Original size (uint32 LE)
// bytes 12-15: Encrypted size (uint32 LE)
// bytes 16-47: Salt (32 bytes)
// bytes 48-59: IV (12 bytes)
// bytes 60-63: Reserved
// bytes 64-79: Auth tag (16 bytes)
// bytes 80+:   Encrypted data

const HEADER_SIZE = 64;
const AUTH_TAG_SIZE = 16;
const MAGIC = 'EWASM001';

/**
 * WASM module instance
 */
export interface WasmModule {
  init: (jwt: string) => Promise<unknown>;
  is_licensed: () => boolean;
  get_session: () => unknown;
  EdgeworkCore: new () => EdgeworkCoreInstance;
}

/**
 * EdgeworkCore instance from WASM
 */
export interface EdgeworkCoreInstance {
  get_router: () => unknown;
  get_inference_client: (config: unknown) => unknown;
  get_distributed_client: (config: unknown) => unknown;
  get_gateway_client: (endpoint: string) => unknown;
}

/**
 * Loader configuration
 */
export interface LoaderConfig {
  wasmUrl?: string;
  oracleEndpoint?: string;
  licenseToken?: string;
}

/**
 * Loader state
 */
interface LoaderState {
  loaded: boolean;
  module: WasmModule | null;
  error: Error | null;
}

const state: LoaderState = {
  loaded: false,
  module: null,
  error: null,
};

/**
 * Derive decryption key from license token
 */
async function deriveKey(
  licenseToken: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const normalizedSalt = Uint8Array.from(salt).buffer;
  // Import the license token as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(licenseToken),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive the actual key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: normalizedSalt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Decrypt WASM binary
 */
async function decryptWasm(
  encryptedData: ArrayBuffer,
  licenseToken: string
): Promise<ArrayBuffer> {
  const buffer = new Uint8Array(encryptedData);

  // Verify magic
  const magic = new TextDecoder().decode(buffer.slice(0, 8));
  if (magic !== MAGIC) {
    throw new Error('Invalid WASM format: missing magic header');
  }

  // Parse header
  const view = new DataView(encryptedData);
  const originalSize = view.getUint32(8, true);
  const encryptedSize = view.getUint32(12, true);

  // Extract components
  const salt = buffer.slice(16, 48);
  const iv = buffer.slice(48, 60);
  const authTag = buffer.slice(HEADER_SIZE, HEADER_SIZE + AUTH_TAG_SIZE);
  const ciphertext = buffer.slice(HEADER_SIZE + AUTH_TAG_SIZE);

  // Verify sizes
  if (ciphertext.length !== encryptedSize) {
    throw new Error('Invalid WASM format: size mismatch');
  }

  // Derive key from license token
  const key = await deriveKey(licenseToken, salt);

  // Combine ciphertext + authTag for AES-GCM (Web Crypto expects them together)
  const combined = new Uint8Array(ciphertext.length + AUTH_TAG_SIZE);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  // Decrypt
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: AUTH_TAG_SIZE * 8,
      },
      key,
      combined
    );

    // Verify decrypted size
    if (decrypted.byteLength !== originalSize) {
      throw new Error('Decryption failed: size mismatch');
    }

    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed: invalid license token');
  }
}

/**
 * Load WASM module from URL
 */
async function fetchWasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch WASM: ${response.status}`);
  }

  return response.arrayBuffer();
}

/**
 * Compile and instantiate WASM module
 */
async function instantiateWasm(wasmBytes: ArrayBuffer): Promise<WasmModule> {
  // Create import object for WASM
  const importObject = {
    env: {
      // Add any required imports here
      memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
    },
    wbg: {
      // wasm-bindgen imports will be provided by the glue code
    },
  };

  // Compile and instantiate. TS lib definitions differ across targets:
  // instantiate() may resolve to an Instance or a { module, instance } pair.
  type WasmInstantiateResult =
    | WebAssembly.Instance
    | WebAssembly.WebAssemblyInstantiatedSource;
  const instantiateResult = (await WebAssembly.instantiate(
    wasmBytes,
    importObject
  )) as WasmInstantiateResult;
  const instance =
    instantiateResult instanceof WebAssembly.Instance
      ? instantiateResult
      : instantiateResult.instance;

  // The actual module interface is wrapped by wasm-bindgen glue code
  // This is a simplified version - in production, use wasm-bindgen's generated loader
  return instance.exports as unknown as WasmModule;
}

/**
 * Load the encrypted WASM core
 */
export async function loadWasmCore(config: LoaderConfig): Promise<WasmModule> {
  if (state.loaded && state.module) {
    return state.module;
  }

  if (!config.licenseToken) {
    throw new Error('License token required to load WASM core');
  }

  const wasmUrl = config.wasmUrl || '/wasm/edgework_core.wasm.enc';

  try {
    // Fetch encrypted WASM
    const encryptedWasm = await fetchWasm(wasmUrl);

    // Check if encrypted (starts with EWASM001 magic)
    const magic = new TextDecoder().decode(
      new Uint8Array(encryptedWasm.slice(0, 8))
    );
    let wasmBytes: ArrayBuffer;

    if (magic === MAGIC) {
      // Decrypt
      wasmBytes = await decryptWasm(encryptedWasm, config.licenseToken);
    } else {
      // Unencrypted (development mode)
      wasmBytes = encryptedWasm;
    }

    // Instantiate
    const module = await instantiateWasm(wasmBytes);

    // Initialize with license
    await module.init(config.licenseToken);

    state.loaded = true;
    state.module = module;

    return module;
  } catch (error) {
    state.error = error instanceof Error ? error : new Error(String(error));
    throw state.error;
  }
}

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
  return state.loaded;
}

/**
 * Get loaded WASM module
 */
export function getWasmModule(): WasmModule | null {
  return state.module;
}

/**
 * Unload WASM module
 */
export function unloadWasm(): void {
  state.loaded = false;
  state.module = null;
  state.error = null;
}

/**
 * Streaming WASM loader for CLI
 * Loads WASM in chunks from server, never fully cached on disk
 */
export async function loadWasmStreaming(
  endpoint: string,
  sessionToken: string,
  functionNames: string[]
): Promise<Map<string, (...args: unknown[]) => unknown>> {
  const functions = new Map<string, (...args: unknown[]) => unknown>();

  for (const funcName of functionNames) {
    const response = await fetch(`${endpoint}/stream/${funcName}`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to stream function ${funcName}: ${response.status}`
      );
    }

    // Stream and compile the function chunk
    const wasmChunk = await response.arrayBuffer();

    // Implementation note: implementation, this would compile individual function modules
    // Current behavior: we just track what was requested
    functions.set(funcName, () => {
      console.log(`Executing streamed function: ${funcName}`);
    });
  }

  return functions;
}
