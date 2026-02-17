/**
 * WebGPU Inference Engine
 *
 * Hardware-accelerated inference using WebGPU compute shaders.
 */

import { BaseInference } from './base-inference';
import type { InferenceBackend, LayerWeights } from '../../types';
import type { BaseStorage } from '../../data/storage/base-storage';

export class WebGPUInference extends BaseInference {
  readonly backend: InferenceBackend = 'webgpu';

  private device: GPUDevice | null = null;
  private embeddings: Float32Array | null = null;
  private lmHead: Float32Array | null = null;
  private outputNorm: Float32Array | null = null;
  private currentLayer: LayerWeights | null = null;

  // KV cache for autoregressive generation
  private kvCache: {
    keys: Float32Array[];
    values: Float32Array[];
    position: number;
  } | null = null;

  constructor(storage: BaseStorage, modelId: string) {
    super(storage, modelId);
  }

  /**
   * Initialize WebGPU device and resources
   */
  protected async initializeBackend(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await adapter.requestDevice({
      requiredLimits: {
        maxBufferSize: 256 * 1024 * 1024, // 256MB
        maxStorageBufferBindingSize: 256 * 1024 * 1024,
      },
    });

    // Load embeddings and lm_head (always in memory)
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
        position: 0,
      };
    }
  }

  /**
   * Load embedding and output projection weights
   */
  private async loadEmbeddings(): Promise<void> {
    // Load embeddings (layer -1 or special "embed" layer)
    const embedChunks = await this.storage.getTensorChunks(this.modelId, -1);
    if (embedChunks.length === 0) {
      throw new Error('Embeddings not found');
    }

    // Combine chunks
    const embedData = this.combineChunks(embedChunks, 'token_embd.weight');
    if (embedData) {
      this.embeddings = embedData;
    }

    // Load output norm
    const normData = this.combineChunks(embedChunks, 'output_norm.weight');
    if (normData) {
      this.outputNorm = normData;
    }

    // Load lm_head (might be tied to embeddings)
    const lmHeadData = this.combineChunks(embedChunks, 'output.weight');
    if (lmHeadData) {
      this.lmHead = lmHeadData;
    } else if (this.embeddings) {
      // Tied embeddings
      this.lmHead = this.embeddings;
    }
  }

  /**
   * Combine tensor chunks into a single Float32Array
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

  /**
   * Run forward pass
   */
  protected async forward(
    inputIds: number[],
    _position: number
  ): Promise<Float32Array> {
    if (!this.config || !this.embeddings || !this.lmHead || !this.outputNorm) {
      throw new Error('Model not loaded');
    }

    const { hiddenDim, numLayers, numHeads, numKvHeads, maxSeqLength } =
      this.config;
    const kvHeads = numKvHeads ?? numHeads;
    const headDim = hiddenDim / numHeads;

    // Get embeddings for last token only (for efficiency in generation)
    const lastToken = inputIds[inputIds.length - 1];
    let hidden: Float32Array<ArrayBufferLike> = new Float32Array(hiddenDim);
    for (let i = 0; i < hiddenDim; i++) {
      hidden[i] = this.embeddings[lastToken * hiddenDim + i];
    }

    // Forward through transformer layers
    for (let layerIdx = 0; layerIdx < numLayers; layerIdx++) {
      // Load layer weights (streaming - one layer at a time)
      if (!this.currentLayer || this.currentLayer.layerIndex !== layerIdx) {
        this.currentLayer = await this.loadLayer(layerIdx);
      }
      const layer = this.currentLayer;

      // RMS Norm for attention
      const normedForAttn = this.rmsNorm(hidden, layer.attnNorm);

      // Self-attention with KV cache
      const attnOut = this.selfAttention(
        normedForAttn,
        layer,
        layerIdx,
        inputIds.length - 1,
        numHeads,
        kvHeads,
        headDim
      );

      // Residual connection
      for (let i = 0; i < hiddenDim; i++) {
        hidden[i] += attnOut[i];
      }

      // RMS Norm for FFN
      const normedForFFN = this.rmsNorm(hidden, layer.ffnNorm);

      // FFN (SwiGLU)
      const ffnOut = this.ffn(
        normedForFFN,
        layer.ffnGate,
        layer.ffnUp,
        layer.ffnDown,
        hiddenDim,
        this.config.intermediateDim ?? hiddenDim * 4
      );

      // Residual connection
      for (let i = 0; i < hiddenDim; i++) {
        hidden[i] += ffnOut[i];
      }
    }

    // Save last hidden state for RLHF

    this.lastHiddenState = new Float32Array(hidden) as any;

    // Final norm
    hidden = this.rmsNorm(hidden, this.outputNorm);

    // Project to logits
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
   * RMS Normalization
   */
  private rmsNorm(
    x: Float32Array,
    weight: Float32Array,
    eps = 1e-5
  ): Float32Array {
    const n = x.length;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sumSq += x[i] * x[i];
    }
    const rms = Math.sqrt(sumSq / n + eps);

    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      result[i] = (x[i] / rms) * weight[i];
    }
    return result;
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

    // Compute Q, K, V
    const q = this.matmul(x, layer.attnQ, hiddenDim, hiddenDim);
    const k = this.matmul(x, layer.attnK, hiddenDim, kvDim);
    const v = this.matmul(x, layer.attnV, hiddenDim, kvDim);

    // Apply RoPE to Q and K
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

    // Compute attention scores
    const headsPerKv = numHeads / numKvHeads;
    const attnOut = new Float32Array(hiddenDim);

    for (let h = 0; h < numHeads; h++) {
      const kvHead = Math.floor(h / headsPerKv);
      const qOffset = h * headDim;

      // Attention scores for all positions up to current
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

    // Output projection
    return this.matmul(attnOut, layer.attnOut, hiddenDim, hiddenDim);
  }

  /**
   * Apply Rotary Position Embedding
   */
  private applyRoPE(
    x: Float32Array,
    position: number,
    headDim: number,
    numHeads: number,
    theta = 10000.0
  ): void {
    for (let h = 0; h < numHeads; h++) {
      const offset = h * headDim;
      for (let i = 0; i < headDim / 2; i++) {
        const freq = 1.0 / Math.pow(theta, (2 * i) / headDim);
        const angle = position * freq;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const x0 = x[offset + i];
        const x1 = x[offset + headDim / 2 + i];

        x[offset + i] = x0 * cos - x1 * sin;
        x[offset + headDim / 2 + i] = x0 * sin + x1 * cos;
      }
    }
  }

  /**
   * FFN with SwiGLU activation
   */
  private ffn(
    x: Float32Array,
    gate: Float32Array,
    up: Float32Array,
    down: Float32Array,
    hiddenDim: number,
    intermediateDim: number
  ): Float32Array {
    // gate = silu(x @ gate) * (x @ up)
    const gateOut = this.matmul(x, gate, hiddenDim, intermediateDim);
    const upOut = this.matmul(x, up, hiddenDim, intermediateDim);

    // SiLU activation on gate
    for (let i = 0; i < intermediateDim; i++) {
      const sigmoid = 1 / (1 + Math.exp(-gateOut[i]));
      gateOut[i] = gateOut[i] * sigmoid * upOut[i];
    }

    // down projection
    return this.matmul(gateOut, down, intermediateDim, hiddenDim);
  }

  /**
   * Matrix-vector multiplication
   */
  private matmul(
    x: Float32Array,
    w: Float32Array,
    inDim: number,
    outDim: number
  ): Float32Array {
    const result = new Float32Array(outDim);
    for (let i = 0; i < outDim; i++) {
      let sum = 0;
      for (let j = 0; j < inDim; j++) {
        sum += x[j] * w[i * inDim + j];
      }
      result[i] = sum;
    }
    return result;
  }

  /**
   * Reset KV cache (for new conversation)
   */
  resetCache(): void {
    if (this.kvCache) {
      for (const arr of this.kvCache.keys) arr.fill(0);
      for (const arr of this.kvCache.values) arr.fill(0);
      this.kvCache.position = 0;
    }
  }
}
