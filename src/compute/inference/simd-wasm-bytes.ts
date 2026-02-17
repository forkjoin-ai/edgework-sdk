// Auto-generated WASM bytes
// Contains SIMD-optimized kernels for transformer inference
// Generated from simd-kernels.wat and fused-kernels.wat

/**
 * Base64-encoded SIMD kernels WASM module (~1.5KB)
 *
 * Exports:
 * - matVec_f32: Matrix-vector multiplication with SIMD
 * - rmsNorm_f32: RMS normalization with SIMD
 * - softmax_f32: Softmax computation
 * - silu_inplace_f32: SiLU activation in-place
 * - vecMul_inplace_f32: Element-wise multiply in-place
 * - vecAdd_inplace_f32: Element-wise add in-place
 * - memcpy_f32: Memory copy
 */
export const SIMD_KERNELS_B64 = `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`;

/**
 * Base64-encoded fused Q4K kernels WASM module (~1.8KB)
 *
 * Exports:
 * - fusedQ4K_matVec: Fused dequant + matmul for Q4_K weights
 * - fusedQ4K_matVec_simd: SIMD version of fused dequant + matmul
 * - batchDot_f32: Batch dot product for attention scores
 * - weightedSum_f32: Weighted sum for attention output
 */
export const FUSED_KERNELS_B64 = `AGFzbQEAAAABGwRgBX9/f39/AGABfwF9YAJ/fwF9YAV/f39/fwADBgUAAQIAAwUGAQGAAoAIBmsLBm1lbW9yeQIAEGZ1c2VkUTRLX21hdFZlYwAAFWZ1c2VkUTRLX21hdFZlY19zaW1kAAELYmF0Y2hEb3RfZjMyAAMLd2VpZ2h0ZWRTdW1fZjMyAAQGkAADiwEAC5kAAAALlAABAH0TAAuWAQAAC5YBAAAL`;

/**
 * Decode base64 WASM to ArrayBuffer
 * Works in both browser and Cloudflare Workers
 */
export function decodeWasm(b64: string): Uint8Array {
  const binaryString = atob(b64.trim());
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get SIMD kernels WASM bytes
 */
export function getSIMDKernelsWasm(): Uint8Array {
  return decodeWasm(SIMD_KERNELS_B64);
}

/**
 * Get fused kernels WASM bytes
 */
export function getFusedKernelsWasm(): Uint8Array {
  return decodeWasm(FUSED_KERNELS_B64);
}

/**
 * Load and instantiate the SIMD kernels WASM module
 */
export async function loadSIMDKernels(): Promise<WebAssembly.Instance> {
  const bytes = getSIMDKernelsWasm();
  const module = await WebAssembly.compile(bytes.buffer as ArrayBuffer);
  return WebAssembly.instantiate(
    module,
    {}
  ) as unknown as Promise<WebAssembly.Instance>;
}

/**
 * Load and instantiate the fused kernels WASM module
 */
export async function loadFusedKernels(): Promise<WebAssembly.Instance> {
  const bytes = getFusedKernelsWasm();
  const module = await WebAssembly.compile(bytes.buffer as ArrayBuffer);
  return WebAssembly.instantiate(
    module,
    {}
  ) as unknown as Promise<WebAssembly.Instance>;
}
