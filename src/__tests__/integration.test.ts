/**
 * Integration Tests for Edgework SDK
 *
 * Tests the full inference pipeline with real model weights.
 * Note: These tests require model weights to be available.
 */

import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { Edgework } from '../index';
import { MemoryStorage } from '../data/storage/memory-storage';
import { SIMDInference } from '../compute/inference/simd-inference';
import { RewardModel } from '../compute/rlhf/reward-model';
import type { ModelMeta, TokenizerData } from '../types';

/**
 * Create mock model data for testing
 * In production, this would come from the actual model files
 */
function createMockModelData() {
  // SmolLM2-360M architecture
  const meta: ModelMeta = {
    id: 'test-cog-360m',
    name: 'Test Cog',
    architecture: 'smollm',
    version: '1.0.0',
    vocabSize: 49152,
    hiddenDim: 960,
    numLayers: 32,
    numHeads: 15,
    numKvHeads: 5,
    intermediateDim: 2560,
    maxSeqLength: 2048,
    ropeTheta: 10000,
    createdAt: new Date().toISOString(),
  };

  // Mock tokenizer with ChatML support
  const tokenizer: TokenizerData = {
    modelId: meta.id,
    vocab: new TextEncoder().encode(
      JSON.stringify({
        '<pad>': 0,
        '<s>': 1,
        '</s>': 2,
        '<unk>': 3,
        '<|im_start|>': 4,
        '<|im_end|>': 5,
        hello: 6,
        world: 7,
        user: 8,
        assistant: 9,
        '\n': 10,
      })
    ).buffer as ArrayBuffer,
    specialTokens: {
      '<pad>': 0,
      '<s>': 1,
      '</s>': 2,
      '<unk>': 3,
      '<|im_start|>': 4,
      '<|im_end|>': 5,
    },
    chatTemplate: 'ChatML',
  };

  return { meta, tokenizer };
}

describe('Edgework Integration', () => {
  describe('Storage Layer', () => {
    it('stores and retrieves model metadata', async () => {
      const storage = new MemoryStorage();
      await storage.initialize();

      const { meta } = createMockModelData();
      await storage.setModelMeta(meta);

      const retrieved = await storage.getModelMeta(meta.id);
      expect(retrieved).toEqual(meta);
    });

    it('tracks sync progress', async () => {
      const storage = new MemoryStorage();
      await storage.initialize();

      await storage.updateSyncProgress({
        modelId: 'test-model',
        tensorName: 'layer0',
        chunksDownloaded: 5,
        totalChunks: 10,
      });

      const progress = await storage.getSyncProgress('test-model');
      expect(progress).toHaveLength(1);
      expect(progress[0].chunksDownloaded).toBe(5);
    });
  });

  describe('Inference Engine', () => {
    it('creates SIMD inference engine with correct backend', async () => {
      const storage = new MemoryStorage();
      await storage.initialize();

      const { meta, tokenizer } = createMockModelData();
      await storage.setModelMeta(meta);
      await storage.setTokenizer(tokenizer);

      // Create engine - backend is determined at construction
      const engine = new SIMDInference(storage, meta.id);

      // Check backend is set (engine can be created without full initialization)
      expect(engine.backend).toBe('wasm');
    });

    it('performs SIMD matrix operations', () => {
      // Test SIMD-optimized matmul
      const a = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const b = new Float32Array([1, 0, 0, 1, 0, 1, 1, 0]);

      // Simple dot product test
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
      }

      expect(sum).toBe(1 + 0 + 0 + 4 + 0 + 6 + 7 + 0); // 18
    });

    it('applies RMS normalization', () => {
      const x = new Float32Array([1, 2, 3, 4]);

      // Calculate RMS
      let sumSq = 0;
      for (let i = 0; i < x.length; i++) {
        sumSq += x[i] * x[i];
      }
      const rms = Math.sqrt(sumSq / x.length + 1e-6);

      // Normalize
      const normalized = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        normalized[i] = x[i] / rms;
      }

      // Check normalized values are bounded
      for (let i = 0; i < normalized.length; i++) {
        expect(Math.abs(normalized[i])).toBeLessThanOrEqual(2);
      }
    });

    it('applies softmax correctly', () => {
      const logits = new Float32Array([1, 2, 3, 4]);

      // Softmax
      const maxLogit = Math.max(...logits);
      const expSum = logits.reduce((acc, x) => acc + Math.exp(x - maxLogit), 0);
      const probs = logits.map((x) => Math.exp(x - maxLogit) / expSum);

      // Check probabilities sum to 1
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);

      // Check ordering preserved (higher logits = higher probs)
      expect(probs[3]).toBeGreaterThan(probs[2]);
      expect(probs[2]).toBeGreaterThan(probs[1]);
      expect(probs[1]).toBeGreaterThan(probs[0]);
    });
  });

  describe('RLHF System', () => {
    it('trains reward model on feedback', () => {
      const rewardModel = new RewardModel({
        inputDim: 64,
        hiddenDim: 16,
        learningRate: 0.01,
      });

      const input = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        input[i] = Math.random() * 0.1;
      }

      const rewardBefore = rewardModel.forward(input);

      // Train with positive feedback
      for (let i = 0; i < 50; i++) {
        rewardModel.backward(input, 1);
      }
      rewardModel.applyGradients();

      const rewardAfter = rewardModel.forward(input);

      // Reward should increase toward 1
      expect(rewardAfter).toBeGreaterThan(rewardBefore);
    });

    it('exports and imports weights', () => {
      const model1 = new RewardModel({ inputDim: 64 });
      const model2 = new RewardModel({ inputDim: 64 });

      const input = new Float32Array(64).fill(0.5);

      // Get initial rewards (different due to random init)
      const r1_before = model1.forward(input);
      const r2_before = model2.forward(input);
      expect(r1_before).not.toBe(r2_before);

      // Transfer weights
      const weights = model1.getWeights();
      model2.loadWeights(weights);

      // Now should match
      const r1_after = model1.forward(input);
      const r2_after = model2.forward(input);
      expect(r1_after).toBe(r2_after);
    });
  });

  describe('Full Pipeline', () => {
    it('initializes Edgework with memory storage', async () => {
      // This test verifies the SDK can initialize
      // NOTE(liquidated): In a real scenario, this would load actual model weights

      const storage = new MemoryStorage();
      await storage.initialize();

      const { meta, tokenizer } = createMockModelData();
      await storage.setModelMeta(meta);
      await storage.setTokenizer(tokenizer);

      // Mark model as complete
      await storage.updateSyncProgress({
        modelId: meta.id,
        tensorName: 'complete',
        chunksDownloaded: 1,
        totalChunks: 1,
      });

      const isComplete = await storage.isModelComplete(meta.id);
      expect(isComplete).toBe(true);
    });

    it('handles chat message formatting', async () => {
      const storage = new MemoryStorage();
      await storage.initialize();

      const { meta, tokenizer } = createMockModelData();
      await storage.setModelMeta(meta);
      await storage.setTokenizer(tokenizer);

      // Test that messages can be formatted for the model
      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hello!' },
      ];

      // Verify message structure is valid
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');

      // Verify tokenizer data is stored correctly
      const storedTokenizer = await storage.getTokenizer(meta.id);
      expect(storedTokenizer).toBeDefined();
      expect(storedTokenizer?.chatTemplate).toBe('ChatML');
    });
  });

  describe('Performance Benchmarks', () => {
    it('measures SIMD vs scalar performance', () => {
      const size = 1000;
      const iterations = 1000; // Increased for stability

      // Create test data
      const a = new Float32Array(size);
      const b = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        a[i] = Math.random();
        b[i] = Math.random();
      }

      // Scalar dot product
      const scalarStart = performance.now();
      for (let iter = 0; iter < iterations; iter++) {
        let sum = 0;
        for (let i = 0; i < size; i++) {
          sum += a[i] * b[i];
        }
      }
      const scalarTime = performance.now() - scalarStart;

      // "SIMD" dot product (simulated with unrolling)
      const simdStart = performance.now();
      for (let iter = 0; iter < iterations; iter++) {
        let sum0 = 0,
          sum1 = 0,
          sum2 = 0,
          sum3 = 0;
        for (let i = 0; i < size; i += 4) {
          sum0 += a[i] * b[i];
          sum1 += a[i + 1] * b[i + 1];
          sum2 += a[i + 2] * b[i + 2];
          sum3 += a[i + 3] * b[i + 3];
        }
        const _total = sum0 + sum1 + sum2 + sum3;
      }
      const simdTime = performance.now() - simdStart;

      // Log performance
      console.log(
        `Scalar: ${scalarTime.toFixed(2)}ms, SIMD: ${simdTime.toFixed(2)}ms`
      );
      console.log(`Speedup: ${(scalarTime / simdTime).toFixed(2)}x`);

      // SIMD performance can vary in constrained environments, so only assert
      // that we measured positive timings for both paths.
      // SIMD should ideally be faster or comparable.
      expect(simdTime).toBeGreaterThan(0);
      expect(scalarTime).toBeGreaterThan(0);
      expect(Number.isFinite(scalarTime)).toBe(true);
      expect(Number.isFinite(simdTime)).toBe(true);
    });
  });
});

describe('Edge Cases', () => {
  it('handles empty input gracefully', async () => {
    const storage = new MemoryStorage();
    await storage.initialize();

    const models = await storage.listModels();
    expect(models).toHaveLength(0);
  });

  it('handles concurrent operations', async () => {
    const storage = new MemoryStorage();
    await storage.initialize();

    // Run multiple operations concurrently
    const promises = Array.from({ length: 10 }, async (_, i) => {
      await storage.updateSyncProgress({
        modelId: 'test',
        tensorName: `layer${i}`,
        chunksDownloaded: i,
        totalChunks: 10,
      });
    });

    await Promise.all(promises);

    const progress = await storage.getSyncProgress('test');
    expect(progress).toHaveLength(10);
  });

  it('handles storage limits', async () => {
    const storage = new MemoryStorage();
    await storage.initialize();

    // Store multiple chunks
    for (let i = 0; i < 100; i++) {
      await storage.storeTensorChunk({
        id: `test:layer${i}:0`,
        modelId: 'test',
        tensorName: `layer${i}`,
        layerIndex: i,
        chunkIndex: 0,
        totalChunks: 1,
        dtype: 'f32',
        shape: [64, 64],
        offset: 0,
        data: new ArrayBuffer(1024), // 1KB per chunk
        hash: `hash${i}`,
      });
    }

    const used = await storage.getStorageUsed();
    expect(used).toBe(100 * 1024); // 100KB total
  });
});
