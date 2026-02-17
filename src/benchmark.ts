/**
 * Edgework SDK Inference Benchmark
 *
 * Compares JS scalar vs WASM SIMD performance.
 * Run with: bun packages/edgework-sdk/src/benchmark.ts
 */

import { loadSIMDKernels } from './compute/inference/simd-wasm-bytes';

// Model config (SmolLM2-360M / Cyrano / Cog)
const CONFIG = {
  hiddenDim: 960,
  intermediateDim: 2560,
  numLayers: 32,
  numHeads: 15,
  numKvHeads: 5,
  headDim: 64,
  vocabSize: 49152,
  maxSeqLength: 2048,
};

// ============================================================================
// SIMD Runtime Wrapper
// ============================================================================

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

class SIMDRuntime {
  private exports: SIMDKernelExports | null = null;
  private heapF32: Float32Array | null = null;
  private heapOffset = 0;
  private maxHeapOffset = 0; // Track max used for reuse

  // Pre-allocated weight cache to avoid re-copying weights each call
  private weightCache: Map<string, number> = new Map();

  async initialize(): Promise<void> {
    const instance = await loadSIMDKernels();
    this.exports = instance.exports as unknown as SIMDKernelExports;
    this.heapF32 = new Float32Array(this.exports.memory.buffer);
    this.heapOffset = 0;
  }

  private ensureMemory(bytesNeeded: number): void {
    if (!this.exports) throw new Error('SIMD runtime not initialized');

    const currentSize = this.exports.memory.buffer.byteLength;
    if (this.heapOffset * 4 + bytesNeeded > currentSize) {
      const pagesNeeded = Math.ceil(
        (this.heapOffset * 4 + bytesNeeded - currentSize) / 65536
      );
      try {
        this.exports.memory.grow(pagesNeeded);
        this.heapF32 = new Float32Array(this.exports.memory.buffer);
      } catch {
        // Memory limit reached - clear cache and retry
        this.weightCache.clear();
        this.heapOffset = 0;
        if (bytesNeeded > this.exports.memory.buffer.byteLength) {
          throw new Error(
            `Cannot allocate ${bytesNeeded} bytes - exceeds memory limit`
          );
        }
      }
    }
  }

  private alloc(size: number): number {
    const ptr = this.heapOffset;
    this.heapOffset += size;
    // Align to 16 bytes for SIMD
    this.heapOffset = (this.heapOffset + 3) & ~3;
    if (this.heapOffset > this.maxHeapOffset) {
      this.maxHeapOffset = this.heapOffset;
    }
    return ptr;
  }

  reset(): void {
    // Only reset working memory, keep weight cache
    this.heapOffset = 0;
  }

  // Optimized matmul that reuses input buffer to reduce copies
  matmul(
    x: Float32Array,
    w: Float32Array,
    inDim: number,
    outDim: number
  ): Float32Array {
    if (!this.exports || !this.heapF32) throw new Error('Not initialized');

    this.reset();
    const bytesNeeded = (inDim + outDim * inDim + outDim) * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(inDim);
    const wPtr = this.alloc(outDim * inDim);
    const yPtr = this.alloc(outDim);

    // TypedArray.set is the fastest way to copy
    this.heapF32.set(x, xPtr);
    this.heapF32.set(w, wPtr);

    this.exports.matVec_f32(wPtr, xPtr, yPtr, outDim, inDim);

    // Use subarray + slice for output - avoids extra allocation
    return new Float32Array(this.heapF32.buffer, yPtr * 4, outDim).slice();
  }

  // Pre-cache weights for repeated use (e.g., in layer loop)
  cacheWeight(key: string, w: Float32Array): number {
    if (!this.exports || !this.heapF32) throw new Error('Not initialized');

    if (this.weightCache.has(key)) {
      return this.weightCache.get(key)!;
    }

    this.ensureMemory(w.length * 4);
    const ptr = this.alloc(w.length);
    this.heapF32.set(w, ptr);
    this.weightCache.set(key, ptr);
    return ptr;
  }

  // Fast matmul with pre-cached weight
  matmulCached(
    x: Float32Array,
    wPtr: number,
    wSize: number,
    inDim: number,
    outDim: number
  ): Float32Array {
    if (!this.exports || !this.heapF32) throw new Error('Not initialized');

    // Only allocate input and output (weights already in WASM memory)
    const currentOffset = this.heapOffset;
    this.ensureMemory((inDim + outDim) * 4);

    const xPtr = this.alloc(inDim);
    const yPtr = this.alloc(outDim);

    this.heapF32.set(x, xPtr);
    this.exports.matVec_f32(wPtr, xPtr, yPtr, outDim, inDim);

    const result = new Float32Array(
      this.heapF32.buffer,
      yPtr * 4,
      outDim
    ).slice();

    // Reset working memory but keep weights
    this.heapOffset = currentOffset;
    return result;
  }

  rmsNorm(x: Float32Array, weight: Float32Array, eps = 1e-5): Float32Array {
    if (!this.exports || !this.heapF32) throw new Error('Not initialized');

    this.reset();
    const n = x.length;
    const bytesNeeded = n * 3 * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(n);
    const wPtr = this.alloc(n);
    const outPtr = this.alloc(n);

    this.heapF32.set(x, xPtr);
    this.heapF32.set(weight, wPtr);

    this.exports.rmsNorm_f32(xPtr, wPtr, outPtr, n, eps);

    return new Float32Array(this.heapF32.buffer, outPtr * 4, n).slice();
  }

  silu(x: Float32Array): Float32Array {
    if (!this.exports || !this.heapF32) throw new Error('Not initialized');

    this.reset();
    const n = x.length;
    const bytesNeeded = n * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(n);
    this.heapF32.set(x, xPtr);

    this.exports.silu_inplace_f32(xPtr, n);

    return new Float32Array(this.heapF32.buffer, xPtr * 4, n).slice();
  }

  softmax(x: Float32Array): Float32Array {
    if (!this.exports || !this.heapF32) throw new Error('Not initialized');

    this.reset();
    const n = x.length;
    const bytesNeeded = n * 2 * 4;
    this.ensureMemory(bytesNeeded);

    const xPtr = this.alloc(n);
    const outPtr = this.alloc(n);

    this.heapF32.set(x, xPtr);

    this.exports.softmax_f32(xPtr, outPtr, n);

    return new Float32Array(this.heapF32.buffer, outPtr * 4, n).slice();
  }
}

// ============================================================================
// Current SDK Implementations (copied from wasm-inference.ts)
// ============================================================================

function matmul(
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

function rmsNorm(
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

function applyRoPE(
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

function silu(x: Float32Array): void {
  for (let i = 0; i < x.length; i++) {
    const sigmoid = 1 / (1 + Math.exp(-x[i]));
    x[i] = x[i] * sigmoid;
  }
}

function softmax(x: Float32Array): Float32Array {
  const maxVal = Math.max(...x);
  let sum = 0;
  const result = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    result[i] = Math.exp(x[i] - maxVal);
    sum += result[i];
  }
  for (let i = 0; i < x.length; i++) {
    result[i] /= sum;
  }
  return result;
}

// ============================================================================
// Benchmark Utilities
// ============================================================================

interface BenchResult {
  name: string;
  avgUs: number;
  opsPerSec: number;
}

function bench(
  name: string,
  fn: () => void,
  iterations: number,
  warmup = 5
): BenchResult {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  // Measure
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - start;

  return {
    name,
    avgUs: (totalMs / iterations) * 1000,
    opsPerSec: (iterations / totalMs) * 1000,
  };
}

function randomF32(size: number): Float32Array {
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) arr[i] = (Math.random() - 0.5) * 2;
  return arr;
}

// ============================================================================
// Main Benchmark
// ============================================================================

async function main() {
  console.log(
    '╔═══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║       Edgework SDK - JS Scalar vs WASM SIMD Benchmark         ║'
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════╝\n'
  );

  // Initialize SIMD runtime
  console.log('Initializing SIMD runtime...');
  const simd = new SIMDRuntime();
  await simd.initialize();
  console.log('SIMD runtime ready.\n');

  const {
    hiddenDim,
    intermediateDim,
    numHeads,
    numKvHeads,
    headDim,
    vocabSize,
  } = CONFIG;

  const results: BenchResult[] = [];
  const simdResults: BenchResult[] = [];

  // -------------------------------------------------------------------------
  // MatMul (the main bottleneck)
  // -------------------------------------------------------------------------
  console.log('▸ Matrix-Vector Multiplication (matmul)\n');
  console.log('  Operation      JS Scalar       WASM SIMD       Speedup');
  console.log('  ─────────────────────────────────────────────────────────');

  const testCases = [
    { name: 'Q-proj', outDim: hiddenDim, inDim: hiddenDim },
    { name: 'K-proj', outDim: numKvHeads * headDim, inDim: hiddenDim },
    { name: 'Gate-proj', outDim: intermediateDim, inDim: hiddenDim },
    { name: 'Down-proj', outDim: hiddenDim, inDim: intermediateDim },
  ];

  for (const { name, outDim, inDim } of testCases) {
    const w = randomF32(outDim * inDim);
    const x = randomF32(inDim);
    const iters = 50;

    // JS Scalar
    const jsResult = bench(
      `${name}-JS`,
      () => matmul(x, w, inDim, outDim),
      iters
    );
    results.push(jsResult);

    // WASM SIMD
    const simdResult = bench(
      `${name}-SIMD`,
      () => simd.matmul(x, w, inDim, outDim),
      iters
    );
    simdResults.push(simdResult);

    const speedup = jsResult.avgUs / simdResult.avgUs;
    console.log(
      `  ${name.padEnd(12)} ${jsResult.avgUs
        .toFixed(0)
        .padStart(8)} μs    ${simdResult.avgUs
        .toFixed(0)
        .padStart(8)} μs    ${speedup.toFixed(2)}x`
    );
  }

  // LM-head separately (large vocab)
  console.log('\n  LM-head (vocab projection - large):');
  const lmHeadW = randomF32(vocabSize * hiddenDim);
  const lmHeadX = randomF32(hiddenDim);
  const lmHeadIters = 3;

  const lmHeadJS = bench(
    'LM-head-JS',
    () => matmul(lmHeadX, lmHeadW, hiddenDim, vocabSize),
    lmHeadIters
  );
  results.push(lmHeadJS);

  // LM-head too large for WASM memory (188MB for 49K vocab), skip SIMD
  const lmSpeedup = 1.0;
  console.log(
    `  LM-head      ${lmHeadJS.avgUs
      .toFixed(0)
      .padStart(8)} μs    (skipped - too large for WASM mem)`
  );
  console.log('  Note: LM-head would need chunked/streamed SIMD for 49K vocab');

  // -------------------------------------------------------------------------
  // RMS Norm
  // -------------------------------------------------------------------------
  console.log('\n▸ RMS Normalization\n');
  console.log('  Operation      JS Scalar       WASM SIMD       Speedup');
  console.log('  ─────────────────────────────────────────────────────────');

  const normX = randomF32(hiddenDim);
  const normW = randomF32(hiddenDim);

  const normJS = bench('rmsNorm-JS', () => rmsNorm(normX, normW), 1000);
  results.push(normJS);

  const normSIMD = bench(
    'rmsNorm-SIMD',
    () => simd.rmsNorm(normX, normW),
    1000
  );
  simdResults.push(normSIMD);

  const normSpeedup = normJS.avgUs / normSIMD.avgUs;
  console.log(
    `  rmsNorm      ${normJS.avgUs
      .toFixed(1)
      .padStart(8)} μs    ${normSIMD.avgUs
      .toFixed(1)
      .padStart(8)} μs    ${normSpeedup.toFixed(2)}x`
  );

  // -------------------------------------------------------------------------
  // RoPE (JS only - no SIMD kernel yet)
  // -------------------------------------------------------------------------
  console.log('\n▸ Rotary Position Embedding (RoPE) - JS only\n');

  const qVec = randomF32(numHeads * headDim);
  const ropeResult = bench(
    'RoPE',
    () => applyRoPE(qVec.slice(), 100, headDim, numHeads),
    500
  );
  results.push(ropeResult);
  console.log(
    `  RoPE         ${ropeResult.avgUs
      .toFixed(1)
      .padStart(8)} μs/op  (no SIMD kernel yet)`
  );

  // -------------------------------------------------------------------------
  // SiLU Activation
  // -------------------------------------------------------------------------
  console.log('\n▸ SiLU Activation\n');
  console.log('  Operation      JS Scalar       WASM SIMD       Speedup');
  console.log('  ─────────────────────────────────────────────────────────');

  const siluVec = randomF32(intermediateDim);
  const siluJS = bench('SiLU-JS', () => silu(siluVec.slice()), 500);
  results.push(siluJS);

  const siluSIMD = bench('SiLU-SIMD', () => simd.silu(siluVec.slice()), 500);
  simdResults.push(siluSIMD);

  const siluSpeedup = siluJS.avgUs / siluSIMD.avgUs;
  console.log(
    `  SiLU         ${siluJS.avgUs
      .toFixed(1)
      .padStart(8)} μs    ${siluSIMD.avgUs
      .toFixed(1)
      .padStart(8)} μs    ${siluSpeedup.toFixed(2)}x`
  );

  // -------------------------------------------------------------------------
  // Softmax
  // -------------------------------------------------------------------------
  console.log('\n▸ Softmax\n');
  console.log('  Operation        JS Scalar       WASM SIMD       Speedup');
  console.log('  ───────────────────────────────────────────────────────────');

  const softmaxSmall = randomF32(256);

  const sm1JS = bench('softmax(256)-JS', () => softmax(softmaxSmall), 500);
  results.push(sm1JS);

  const sm1SIMD = bench(
    'softmax(256)-SIMD',
    () => simd.softmax(softmaxSmall),
    500
  );
  simdResults.push(sm1SIMD);

  const sm1Speedup = sm1JS.avgUs / sm1SIMD.avgUs;
  console.log(
    `  softmax(256)   ${sm1JS.avgUs
      .toFixed(1)
      .padStart(8)} μs    ${sm1SIMD.avgUs
      .toFixed(1)
      .padStart(8)} μs    ${sm1Speedup.toFixed(2)}x`
  );

  // -------------------------------------------------------------------------
  // Simulated Full Layer - JS vs SIMD
  // -------------------------------------------------------------------------
  console.log('\n▸ Simulated Transformer Layer\n');

  // Weights
  const attnNorm = randomF32(hiddenDim);
  const ffnNorm = randomF32(hiddenDim);
  const qProj = randomF32(hiddenDim * hiddenDim);
  const kProj = randomF32(numKvHeads * headDim * hiddenDim);
  const vProj = randomF32(numKvHeads * headDim * hiddenDim);
  const oProj = randomF32(hiddenDim * hiddenDim);
  const gateProj = randomF32(intermediateDim * hiddenDim);
  const upProj = randomF32(intermediateDim * hiddenDim);
  const downProj = randomF32(hiddenDim * intermediateDim);

  // JS Scalar layer
  function simulateLayerJS(hidden: Float32Array): Float32Array {
    const normed = rmsNorm(hidden, attnNorm);
    const q = matmul(normed, qProj, hiddenDim, hiddenDim);
    const k = matmul(normed, kProj, hiddenDim, numKvHeads * headDim);
    const v = matmul(normed, vProj, hiddenDim, numKvHeads * headDim);
    applyRoPE(q, 100, headDim, numHeads);
    applyRoPE(k, 100, headDim, numKvHeads);
    const attnOut = matmul(q, oProj, hiddenDim, hiddenDim);

    const afterAttn = new Float32Array(hiddenDim);
    for (let i = 0; i < hiddenDim; i++) afterAttn[i] = hidden[i] + attnOut[i];

    const normedFFN = rmsNorm(afterAttn, ffnNorm);
    const gate = matmul(normedFFN, gateProj, hiddenDim, intermediateDim);
    const up = matmul(normedFFN, upProj, hiddenDim, intermediateDim);
    silu(gate);
    for (let i = 0; i < intermediateDim; i++) gate[i] *= up[i];
    const ffnOut = matmul(gate, downProj, intermediateDim, hiddenDim);

    const output = new Float32Array(hiddenDim);
    for (let i = 0; i < hiddenDim; i++) output[i] = afterAttn[i] + ffnOut[i];
    return output;
  }

  // SIMD layer
  function simulateLayerSIMD(hidden: Float32Array): Float32Array {
    const normed = simd.rmsNorm(hidden, attnNorm);
    const q = simd.matmul(normed, qProj, hiddenDim, hiddenDim);
    const k = simd.matmul(normed, kProj, hiddenDim, numKvHeads * headDim);
    const v = simd.matmul(normed, vProj, hiddenDim, numKvHeads * headDim);
    applyRoPE(q, 100, headDim, numHeads); // Still JS
    applyRoPE(k, 100, headDim, numKvHeads);
    const attnOut = simd.matmul(q, oProj, hiddenDim, hiddenDim);

    const afterAttn = new Float32Array(hiddenDim);
    for (let i = 0; i < hiddenDim; i++) afterAttn[i] = hidden[i] + attnOut[i];

    const normedFFN = simd.rmsNorm(afterAttn, ffnNorm);
    const gate = simd.matmul(normedFFN, gateProj, hiddenDim, intermediateDim);
    const up = simd.matmul(normedFFN, upProj, hiddenDim, intermediateDim);
    const gateAct = simd.silu(gate);
    for (let i = 0; i < intermediateDim; i++) gateAct[i] *= up[i];
    const ffnOut = simd.matmul(gateAct, downProj, intermediateDim, hiddenDim);

    const output = new Float32Array(hiddenDim);
    for (let i = 0; i < hiddenDim; i++) output[i] = afterAttn[i] + ffnOut[i];
    return output;
  }

  const layerInput = randomF32(hiddenDim);

  console.log('  Backend        Per Layer    32 Layers    Tokens/sec');
  console.log('  ─────────────────────────────────────────────────────────');

  const layerResultJS = bench(
    'Full layer JS',
    () => simulateLayerJS(layerInput),
    20
  );
  results.push(layerResultJS);

  const perLayerMsJS = layerResultJS.avgUs / 1000;
  const totalLayersMsJS = perLayerMsJS * CONFIG.numLayers;
  const tokensPerSecJS = 1000 / totalLayersMsJS;

  console.log(
    `  JS Scalar    ${perLayerMsJS
      .toFixed(2)
      .padStart(8)} ms    ${totalLayersMsJS
      .toFixed(1)
      .padStart(6)} ms    ${tokensPerSecJS.toFixed(2).padStart(6)} tok/s`
  );

  const layerResultSIMD = bench(
    'Full layer SIMD',
    () => simulateLayerSIMD(layerInput),
    20
  );
  simdResults.push(layerResultSIMD);

  const perLayerMsSIMD = layerResultSIMD.avgUs / 1000;
  const totalLayersMsSIMD = perLayerMsSIMD * CONFIG.numLayers;
  const tokensPerSecSIMD = 1000 / totalLayersMsSIMD;

  console.log(
    `  WASM SIMD    ${perLayerMsSIMD
      .toFixed(2)
      .padStart(8)} ms    ${totalLayersMsSIMD
      .toFixed(1)
      .padStart(6)} ms    ${tokensPerSecSIMD.toFixed(2).padStart(6)} tok/s`
  );

  const layerSpeedup = perLayerMsJS / perLayerMsSIMD;
  console.log(`\n  Layer speedup: ${layerSpeedup.toFixed(2)}x`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(
    '\n═══════════════════════════════════════════════════════════════════'
  );
  console.log('PERFORMANCE SUMMARY: JS SCALAR vs WASM SIMD');
  console.log(
    '═══════════════════════════════════════════════════════════════════\n'
  );

  console.log('  INFERENCE PERFORMANCE:');
  console.log(
    '  ───────────────────────────────────────────────────────────────'
  );
  console.log(
    `  JS Scalar:   ${tokensPerSecJS.toFixed(
      2
    )} tok/s  (${totalLayersMsJS.toFixed(0)} ms/token)`
  );
  console.log(
    `  WASM SIMD:   ${tokensPerSecSIMD.toFixed(
      2
    )} tok/s  (${totalLayersMsSIMD.toFixed(0)} ms/token)`
  );
  console.log(`  Speedup:     ${layerSpeedup.toFixed(2)}x`);
  console.log();

  // Operation-level speedups
  console.log('  OPERATION SPEEDUPS:');
  console.log(
    '  ───────────────────────────────────────────────────────────────'
  );

  const qProjJS = results.find((r) => r.name === 'Q-proj-JS')!;
  const qProjSIMD = simdResults.find((r) => r.name === 'Q-proj-SIMD')!;
  const gateProjJS = results.find((r) => r.name === 'Gate-proj-JS')!;
  const gateProjSIMD = simdResults.find((r) => r.name === 'Gate-proj-SIMD')!;
  const downProjJS = results.find((r) => r.name === 'Down-proj-JS')!;
  const downProjSIMD = simdResults.find((r) => r.name === 'Down-proj-SIMD')!;

  console.log(
    `  MatMul (Q-proj):    ${(qProjJS.avgUs / qProjSIMD.avgUs).toFixed(2)}x`
  );
  console.log(
    `  MatMul (Gate-proj): ${(gateProjJS.avgUs / gateProjSIMD.avgUs).toFixed(
      2
    )}x`
  );
  console.log(
    `  MatMul (Down-proj): ${(downProjJS.avgUs / downProjSIMD.avgUs).toFixed(
      2
    )}x`
  );
  console.log(`  MatMul (LM-head):   N/A (needs chunked impl)`);
  console.log(`  RMS Norm:           ${normSpeedup.toFixed(2)}x`);
  console.log(`  SiLU:               ${siluSpeedup.toFixed(2)}x`);
  console.log(`  Softmax:            ${sm1Speedup.toFixed(2)}x`);
  console.log();

  // What's next
  console.log('  OPTIMIZATION OPPORTUNITIES:');
  console.log(
    '  ───────────────────────────────────────────────────────────────'
  );
  console.log('  1. RoPE SIMD kernel (currently JS)');
  console.log('  2. Fused attention kernel');
  console.log('  3. Quantized weight support (Q4_K)');
  console.log('  4. WebGPU compute shaders');

  console.log(
    '\n═══════════════════════════════════════════════════════════════════\n'
  );

  return {
    jsTokensPerSec: tokensPerSecJS,
    simdTokensPerSec: tokensPerSecSIMD,
    speedup: layerSpeedup,
  };
}

main().catch(console.error);
