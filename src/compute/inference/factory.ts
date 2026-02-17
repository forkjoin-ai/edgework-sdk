/**
 * Inference Engine Factory
 *
 * Creates appropriate inference backend based on environment capabilities.
 */

import { WebGPUInference } from './webgpu-inference';
import { WebNNInference } from './webnn-inference';
import { getModelConfig } from '../../models';
import { WASMInference } from './wasm-inference';
import { SIMDInference } from './simd-inference';
import { BaseInference } from './base-inference';
import type { BaseStorage } from '../../data/storage/base-storage';
import type { InferenceBackend } from '../../types';

export interface InferenceOptions {
  /** Preferred inference backend */
  backend?: InferenceBackend;
  /** Force the specified backend even if not optimal */
  force?: boolean;
  /** Use SIMD-optimized WASM (default: true) */
  useSIMD?: boolean;
}

/**
 * Detect the best available inference backend
 */
export function detectBestBackend(): InferenceBackend {
  // Check for WebGPU support
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return 'webgpu';
  }

  // Check for WebNN support
  if (typeof navigator !== 'undefined' && 'ml' in navigator) {
    return 'webnn';
  }

  // Fall back to WASM/CPU
  return 'wasm';
}

/**
 * Check if an inference backend is available
 */
export function isBackendAvailable(backend: InferenceBackend): boolean {
  switch (backend) {
    case 'webgpu':
      return typeof navigator !== 'undefined' && 'gpu' in navigator;
    case 'webnn':
      return typeof navigator !== 'undefined' && 'ml' in navigator;
    case 'wasm':
    case 'cpu':
      return true;
    default:
      return false;
  }
}

/**
 * Create an inference engine
 */
export async function createInferenceEngine(
  storage: BaseStorage,
  modelId: string,
  options: InferenceOptions = {}
): Promise<BaseInference> {
  const { backend, force = false, useSIMD = true } = options;

  // Determine which backend to use
  let selectedBackend: InferenceBackend;
  if (backend && (force || isBackendAvailable(backend))) {
    selectedBackend = backend;
  } else {
    selectedBackend = detectBestBackend();
  }

  // Create the engine
  let engine: BaseInference;
  switch (selectedBackend) {
    case 'webgpu':
      engine = new WebGPUInference(storage, modelId);
      break;
    case 'webnn':
      try {
        engine = new WebNNInference(storage, modelId);
      } catch (error) {
        console.warn('WebNN backend unavailable, using SIMD/WASM fallback');
        engine = useSIMD
          ? new SIMDInference(storage, modelId)
          : new WASMInference(storage, modelId);
      }
      break;
    case 'wasm':
    case 'cpu':
    default:
      // Use SIMD-optimized WASM by default (2.5x faster)
      engine = useSIMD
        ? new SIMDInference(storage, modelId)
        : new WASMInference(storage, modelId);
      break;
  }

  try {
    await engine.initialize();
  } catch (error) {
    if (selectedBackend === 'webnn' && !force) {
      console.warn('WebNN initialization failed, retrying with SIMD/WASM');
      engine = useSIMD
        ? new SIMDInference(storage, modelId)
        : new WASMInference(storage, modelId);
      await engine.initialize();
    } else {
      throw error;
    }
  }
  return engine;
}

/**
 * Get inference capabilities info
 */
export function getInferenceCapabilities(): {
  webgpu: boolean;
  webnn: boolean;
  wasm: boolean;
  simd: boolean;
  recommended: InferenceBackend;
} {
  // Check for WASM SIMD support
  const simdSupported = (() => {
    try {
      // Test for SIMD support by checking if v128 type is available
      return (
        typeof WebAssembly !== 'undefined' &&
        WebAssembly.validate(
          new Uint8Array([
            0x00,
            0x61,
            0x73,
            0x6d, // WASM magic
            0x01,
            0x00,
            0x00,
            0x00, // Version 1
            0x01,
            0x05,
            0x01,
            0x60,
            0x00,
            0x01,
            0x7b, // Type section with v128
          ])
        )
      );
    } catch {
      return false;
    }
  })();

  return {
    webgpu: isBackendAvailable('webgpu'),
    webnn: isBackendAvailable('webnn'),
    wasm: true,
    simd: simdSupported,
    recommended: detectBestBackend(),
  };
}
