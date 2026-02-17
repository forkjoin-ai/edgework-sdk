/**
 * WebNN Inference Engine
 *
 * Uses WebNN capability detection and delegates tensor math to the SIMD
 * implementation until dedicated WebNN kernels are enabled.
 */

import type { InferenceBackend } from '../../types';
import type { BaseStorage } from '../../data/storage/base-storage';
import { SIMDInference } from './simd-inference';

export class WebNNInference extends SIMDInference {
  readonly backend: InferenceBackend = 'webnn';

  constructor(storage: BaseStorage, modelId: string) {
    super(storage, modelId);
  }

  protected async initializeBackend(): Promise<void> {
    if (typeof navigator === 'undefined' || !('ml' in navigator)) {
      throw new Error('WebNN backend unavailable in this runtime');
    }

    await super.initializeBackend();
  }
}
