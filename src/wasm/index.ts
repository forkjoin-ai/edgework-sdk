/**
 * WASM Module Exports
 *
 * Provides encrypted WASM loading, decryption, and streaming capabilities.
 */

export {
  loadWasmCore,
  loadWasmStreaming,
  isWasmLoaded,
  getWasmModule,
  unloadWasm,
  type WasmModule,
  type EdgeworkCoreInstance,
  type LoaderConfig,
} from './loader';
