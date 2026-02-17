/**
 * Edgework Inference Layer
 *
 * Client-side inference using WebGPU, WebNN, SIMD, or WASM fallback.
 */

export { WebGPUInference } from './webgpu-inference';
export { WebNNInference } from './webnn-inference';
export { WASMInference } from './wasm-inference';
export { SIMDInference } from './simd-inference';
export {
  createInferenceEngine,
  detectBestBackend,
  getInferenceCapabilities,
} from './factory';
export { Tokenizer, loadTokenizer } from './tokenizer';
export type { InferenceOptions } from './factory';
