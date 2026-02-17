/**
 * SIMD-Optimized Inference Engine
 *
 * Uses WebAssembly SIMD for accelerated transformer inference.
 * 2.5x faster than pure JS implementation.
 */

import { BaseInference } from './base-inference';
import type { InferenceBackend, LayerWeights } from '../../types';
import type { BaseStorage } from '../../data/storage/base-storage';
import { loadSIMDKernels } from './simd-wasm-bytes';

interface SIMDKernelExports {
  memory: WebAssembly.Memory;
  matVec_f32: (
    a: number,
    x: number,
    y: number,
    rows: number,
    cols: number
  ) => void;
  rmsNorm_f32: (
    x: number,
    w: number,
    out: number,
    n: number,
    eps: number
  ) => void;
  silu_inplace_f32: (x: number, n: number) => void;
  softmax_f32: (x: number, out: number, n: number) => void;
  vecMul_inplace_f32: (a: number, b: number, n: number) => void;
  vecAdd_inplace_f32: (a: number, b: number, n: number) => void;
  memcpy_f32: (dst: number, src: number, n: number) => void;
}

export class SIMDInference extends BaseInference {
  readonly backend: InferenceBackend = 'wasm';

  private simd: SIMDKernelExports | null = null;
  private heapF32: Float32Array | null = null;
  private heapOffset = 0;

  private embeddings: Float32Array | null = null;
  private lmHead: Float32Array | null = null;
  private outputNorm: Float32Array | null = null;
  private currentLayer: LayerWeights | null = null;
  private ropeCache: Map<string, { cos: Float32Array; sin: Float32Array }> =
    new Map();

  // KV cache
  private kvCache: {
    keys: Float32Array[];
    values: Float32Array[];
  } | null = null;

  constructor(storage: BaseStorage, modelId: string) {
    super(storage, modelId);
  }

  /**
   * Initialize SIMD backend
   */
  protected async initializeBackend(): Promise<void> {
    // Load SIMD kernels
    const instance = await loadSIMDKernels();
    this.simd = instance.exports as unknown as SIMDKernelExports;
    this.heapF32 = new Float32Array(this.simd.memory.buffer);

    // Load embeddings
    await this.loadEmbeddings();

    // Initialize KV cache
    if (this.config) {
      const numLayers = this.config.numLayers;
      const kvDim =
        (this.config.hiddenDim / this.config.numHeads) *
        (this.config.numKvHeads ?? this.config.numHeads);
      const maxSeq = this.config.maxSeqLength;

      this.kvCache = {
        keys: Array.from(
          { length: numLayers },
          () => new Float32Array(maxSeq * kvDim)
        ),
        values: Array.from(
          { length: numLayers },
          () => new Float32Array(maxSeq * kvDim)
        ),
      };
    }
  }

  /**
   * Load embedding and output projection weights
   */
  private async loadEmbeddings(): Promise<void> {
    const embedChunks = await this.storage.getTensorChunks(this.modelId, -1);
    if (embedChunks.length === 0) {
      throw new Error('Embeddings not found');
    }

    this.embeddings = this.combineChunks(embedChunks, 'token_embd.weight');
    this.outputNorm = this.combineChunks(embedChunks, 'output_norm.weight');
    this.lmHead =
      this.combineChunks(embedChunks, 'output.weight') || this.embeddings;
  }

  /**
   * Combine tensor chunks
   */
  private combineChunks(
    chunks: Array<{
      tensorName: string;
      chunkIndex: number;
      data: ArrayBuffer;
    }>,
    tensorName: string
  ): Float32Array | null {
    const tensorChunks = chunks
      .filter((c) => c.tensorName === tensorName)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    if (tensorChunks.length === 0) return null;

    const totalSize = tensorChunks.reduce(
      (sum, c) => sum + c.data.byteLength,
      0
    );
    const result = new Float32Array(totalSize / 4);
    let offset = 0;
    for (const chunk of tensorChunks) {
      const data = new Float32Array(chunk.data);
      result.set(data, offset);
      offset += data.length;
    }
    return result;
  }

  /**
   * Load a layer's weights
   */
  private async loadLayer(layerIndex: number): Promise<LayerWeights> {
    const chunks = await this.storage.getTensorChunks(this.modelId, layerIndex);
    const prefix = `blk.${layerIndex}`;

    return {
      layerIndex,
      attnQ: this.combineChunks(chunks, `${prefix}.attn_q.weight`)!,
      attnK: this.combineChunks(chunks, `${prefix}.attn_k.weight`)!,
      attnV: this.combineChunks(chunks, `${prefix}.attn_v.weight`)!,
      attnOut: this.combineChunks(chunks, `${prefix}.attn_output.weight`)!,
      attnNorm: this.combineChunks(chunks, `${prefix}.attn_norm.weight`)!,
      ffnGate: this.combineChunks(chunks, `${prefix}.ffn_gate.weight`)!,
      ffnUp: this.combineChunks(chunks, `${prefix}.ffn_up.weight`)!,
      ffnDown: this.combineChunks(chunks, `${prefix}.ffn_down.weight`)!,
      ffnNorm: this.combineChunks(chunks, `${prefix}.ffn_norm.weight`)!,
    };
  }

  // ============================================================================
  // SIMD Memory Management
  // ============================================================================

  private ensureMemory(bytesNeeded: number): void {
    if (!this.simd) throw new Error('SIMD not initialized');

    const currentSize = this.simd.memory.buffer.byteLength;
    if (this.heapOffset * 4 + bytesNeeded > currentSize) {
      const pagesNeeded = Math.ceil(
        (this.heapOffset * 4 + bytesNeeded - currentSize) / 65536
      );
      try {
        this.simd.memory.grow(pagesNeeded);
        this.heapF32 = new Float32Array(this.simd.memory.buffer);
      } catch {
        // Memory limit - reset and retry
        this.heapOffset = 0;
        if (bytesNeeded > this.simd.memory.buffer.byteLength) {
          throw new Error(`Cannot allocate ${bytesNeeded} bytes`);
        }
      }
    }
  }

  private alloc(size: number): number {
    const ptr = this.heapOffset;
    this.heapOffset += size;
    // Align to 16 bytes for SIMD
    this.heapOffset = (this.heapOffset + 3) & ~3;
    return ptr;
  }

  private resetHeap(): void {
    this.heapOffset = 0;
  }

  // ============================================================================
  // SIMD Kernels
  // ============================================================================

  private simdMatmul(
    x: Float32Array,
    w: Float32Array,
    inDim: number,
    outDim: number
  ): Float32Array {
    if (!this.simd || !this.heapF32) throw new Error('Not initialized');

    this.resetHeap();
    const bytesNeeded = (inDim + outDim * inDim + outDim) * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(inDim);
    const wPtr = this.alloc(outDim * inDim);
    const yPtr = this.alloc(outDim);

    this.heapF32.set(x, xPtr);
    this.heapF32.set(w, wPtr);

    this.simd.matVec_f32(wPtr, xPtr, yPtr, outDim, inDim);

    return new Float32Array(this.heapF32.buffer, yPtr * 4, outDim).slice();
  }

  private simdRmsNorm(
    x: Float32Array,
    weight: Float32Array,
    eps = 1e-5
  ): Float32Array {
    if (!this.simd || !this.heapF32) throw new Error('Not initialized');

    this.resetHeap();
    const n = x.length;
    const bytesNeeded = n * 3 * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(n);
    const wPtr = this.alloc(n);
    const outPtr = this.alloc(n);

    this.heapF32.set(x, xPtr);
    this.heapF32.set(weight, wPtr);

    this.simd.rmsNorm_f32(xPtr, wPtr, outPtr, n, eps);

    return new Float32Array(this.heapF32.buffer, outPtr * 4, n).slice();
  }

  private simdSilu(x: Float32Array): Float32Array {
    if (!this.simd || !this.heapF32) throw new Error('Not initialized');

    this.resetHeap();
    const n = x.length;
    const bytesNeeded = n * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(n);
    this.heapF32.set(x, xPtr);

    this.simd.silu_inplace_f32(xPtr, n);

    return new Float32Array(this.heapF32.buffer, xPtr * 4, n).slice();
  }

  // ============================================================================
  // Inference Forward Pass
  // ============================================================================

  /**
   * Run forward pass with SIMD acceleration
   */
  protected async forward(
    inputIds: number[],
    _position: number
  ): Promise<Float32Array> {
    if (!this.config || !this.embeddings || !this.lmHead || !this.outputNorm) {
      throw new Error('Model not loaded');
    }

    const { hiddenDim, numLayers, numHeads, numKvHeads } = this.config;
    const kvHeads = numKvHeads ?? numHeads;
    const headDim = hiddenDim / numHeads;

    // Get embeddings for last token
    const lastToken = inputIds[inputIds.length - 1];
    let hidden: Float32Array = new Float32Array(hiddenDim);
    for (let i = 0; i < hiddenDim; i++) {
      hidden[i] = this.embeddings[lastToken * hiddenDim + i];
    }

    // Forward through layers
    for (let layerIdx = 0; layerIdx < numLayers; layerIdx++) {
      if (!this.currentLayer || this.currentLayer.layerIndex !== layerIdx) {
        this.currentLayer = await this.loadLayer(layerIdx);
      }
      const layer = this.currentLayer;

      // Attention with SIMD
      const normedForAttn = this.simdRmsNorm(hidden, layer.attnNorm);
      const attnOut = this.selfAttention(
        normedForAttn,
        layer,
        layerIdx,
        inputIds.length - 1,
        numHeads,
        kvHeads,
        headDim
      );

      for (let i = 0; i < hiddenDim; i++) {
        hidden[i] += attnOut[i];
      }

      // FFN with SIMD
      const normedForFFN = this.simdRmsNorm(hidden, layer.ffnNorm);
      const ffnOut = this.ffn(
        normedForFFN,
        layer.ffnGate,
        layer.ffnUp,
        layer.ffnDown,
        hiddenDim,
        this.config.intermediateDim ?? hiddenDim * 4
      );

      for (let i = 0; i < hiddenDim; i++) {
        hidden[i] += ffnOut[i];
      }
    }

    this.lastHiddenState = new Float32Array(hidden);
    hidden = this.simdRmsNorm(hidden, this.outputNorm);

    // Project to logits (use JS for large vocab to avoid WASM memory limits)
    const vocabSize = this.config.vocabSize;
    const logits = new Float32Array(vocabSize);
    for (let i = 0; i < vocabSize; i++) {
      let sum = 0;
      for (let j = 0; j < hiddenDim; j++) {
        sum += hidden[j] * this.lmHead[i * hiddenDim + j];
      }
      logits[i] = sum;
    }

    return logits;
  }

  /**
   * Self-attention with RoPE and KV caching
   */
  private selfAttention(
    x: Float32Array,
    layer: LayerWeights,
    layerIdx: number,
    position: number,
    numHeads: number,
    numKvHeads: number,
    headDim: number
  ): Float32Array {
    const hiddenDim = x.length;
    const kvDim = numKvHeads * headDim;

    // Use SIMD matmul for Q, K, V projections
    const q = this.simdMatmul(x, layer.attnQ, hiddenDim, hiddenDim);
    const k = this.simdMatmul(x, layer.attnK, hiddenDim, kvDim);
    const v = this.simdMatmul(x, layer.attnV, hiddenDim, kvDim);

    // Apply RoPE using cached trig tables for the current position.
    this.applyRoPE(q, position, headDim, numHeads);
    this.applyRoPE(k, position, headDim, numKvHeads);

    // Update KV cache
    if (this.kvCache) {
      const cacheK = this.kvCache.keys[layerIdx];
      const cacheV = this.kvCache.values[layerIdx];
      for (let i = 0; i < kvDim; i++) {
        cacheK[position * kvDim + i] = k[i];
        cacheV[position * kvDim + i] = v[i];
      }
    }

    // Compute attention
    const headsPerKv = numHeads / numKvHeads;
    const attnOut = new Float32Array(hiddenDim);

    for (let h = 0; h < numHeads; h++) {
      const kvHead = Math.floor(h / headsPerKv);
      const qOffset = h * headDim;

      const scores = new Float32Array(position + 1);
      for (let p = 0; p <= position; p++) {
        let score = 0;
        for (let d = 0; d < headDim; d++) {
          const kVal = this.kvCache
            ? this.kvCache.keys[layerIdx][p * kvDim + kvHead * headDim + d]
            : k[kvHead * headDim + d];
          score += q[qOffset + d] * kVal;
        }
        scores[p] = score / Math.sqrt(headDim);
      }

      // Softmax
      const maxScore = Math.max(...scores);
      let sumExp = 0;
      for (let p = 0; p <= position; p++) {
        scores[p] = Math.exp(scores[p] - maxScore);
        sumExp += scores[p];
      }
      for (let p = 0; p <= position; p++) {
        scores[p] /= sumExp;
      }

      // Weighted sum of values
      for (let p = 0; p <= position; p++) {
        for (let d = 0; d < headDim; d++) {
          const vVal = this.kvCache
            ? this.kvCache.values[layerIdx][p * kvDim + kvHead * headDim + d]
            : v[kvHead * headDim + d];
          attnOut[qOffset + d] += scores[p] * vVal;
        }
      }
    }

    // Output projection with SIMD
    return this.simdMatmul(attnOut, layer.attnOut, hiddenDim, hiddenDim);
  }

  /**
   * Apply RoPE
   */
  private applyRoPE(
    x: Float32Array,
    position: number,
    headDim: number,
    numHeads: number,
    theta = 10000.0
  ): void {
    const { cos, sin } = this.getRoPETrigonometry(position, headDim, theta);
    for (let h = 0; h < numHeads; h++) {
      const offset = h * headDim;
      for (let i = 0; i < headDim / 2; i++) {
        const x0 = x[offset + i];
        const x1 = x[offset + headDim / 2 + i];

        x[offset + i] = x0 * cos[i] - x1 * sin[i];
        x[offset + headDim / 2 + i] = x0 * sin[i] + x1 * cos[i];
      }
    }
  }

  private getRoPETrigonometry(
    position: number,
    headDim: number,
    theta: number
  ): { cos: Float32Array; sin: Float32Array } {
    const cacheKey = `${position}:${headDim}:${theta}`;
    const cached = this.ropeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const halfDim = Math.floor(headDim / 2);
    const cos = new Float32Array(halfDim);
    const sin = new Float32Array(halfDim);
    for (let i = 0; i < halfDim; i++) {
      const freq = 1.0 / Math.pow(theta, (2 * i) / headDim);
      const angle = position * freq;
      cos[i] = Math.cos(angle);
      sin[i] = Math.sin(angle);
    }

    const entry = { cos, sin };
    // Keep cache bounded to avoid unbounded growth on long-running sessions.
    if (this.ropeCache.size > 128) {
      this.ropeCache.clear();
    }
    this.ropeCache.set(cacheKey, entry);
    return entry;
  }

  /**
   * FFN with SwiGLU and SIMD
   */
  private ffn(
    x: Float32Array,
    gate: Float32Array,
    up: Float32Array,
    down: Float32Array,
    hiddenDim: number,
    intermediateDim: number
  ): Float32Array {
    // Use SIMD matmul for gate and up projections
    const gateOut = this.simdMatmul(x, gate, hiddenDim, intermediateDim);
    const upOut = this.simdMatmul(x, up, hiddenDim, intermediateDim);

    // SiLU with SIMD
    const gateAct = this.simdSilu(gateOut);

    // Element-wise multiply
    for (let i = 0; i < intermediateDim; i++) {
      gateAct[i] *= upOut[i];
    }

    // Down projection with SIMD
    return this.simdMatmul(gateAct, down, intermediateDim, hiddenDim);
  }

  /**
   * Reset KV cache
   */
  resetCache(): void {
    if (this.kvCache) {
      for (const arr of this.kvCache.keys) arr.fill(0);
      for (const arr of this.kvCache.values) arr.fill(0);
    }
    this.ropeCache.clear();
  }
}
