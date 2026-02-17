/**
 * Memory Storage Tests
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { MemoryStorage } from '../data/storage/memory-storage';
import type {
  ModelMeta,
  TensorChunk,
  TokenizerData,
  SyncProgress,
  UserAdapter,
} from '../types';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.initialize();
  });

  describe('initialization', () => {
    it('initializes without error', async () => {
      const newStorage = new MemoryStorage();
      await newStorage.initialize();
      expect(newStorage.backend).toBe('memory');
    });
  });

  describe('model metadata', () => {
    const testMeta: ModelMeta = {
      id: 'test-model',
      name: 'Test Model',
      architecture: 'smollm',
      version: '1.0.0',
      vocabSize: 32000,
      hiddenDim: 512,
      numLayers: 12,
      numHeads: 8,
      maxSeqLength: 1024,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    it('stores and retrieves model meta', async () => {
      await storage.setModelMeta(testMeta);
      const retrieved = await storage.getModelMeta('test-model');
      expect(retrieved).toEqual(testMeta);
    });

    it('returns null for non-existent model', async () => {
      const result = await storage.getModelMeta('non-existent');
      expect(result).toBeNull();
    });

    it('deletes model meta', async () => {
      await storage.setModelMeta(testMeta);
      await storage.deleteModelMeta('test-model');
      const result = await storage.getModelMeta('test-model');
      expect(result).toBeNull();
    });

    it('lists all models', async () => {
      await storage.setModelMeta(testMeta);
      await storage.setModelMeta({
        ...testMeta,
        id: 'test-model-2',
        name: 'Test 2',
      });
      const models = await storage.listModels();
      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toContain('test-model');
      expect(models.map((m) => m.id)).toContain('test-model-2');
    });

    it('overwrites existing model meta', async () => {
      await storage.setModelMeta(testMeta);
      await storage.setModelMeta({ ...testMeta, name: 'Updated Name' });
      const retrieved = await storage.getModelMeta('test-model');
      expect(retrieved?.name).toBe('Updated Name');
    });
  });

  describe('tensor chunks', () => {
    const testChunk: TensorChunk = {
      id: 'test-model:layer0:0',
      modelId: 'test-model',
      tensorName: 'layer0',
      layerIndex: 0,
      chunkIndex: 0,
      totalChunks: 2,
      dtype: 'q4_k',
      shape: [512, 512],
      offset: 0,
      data: new ArrayBuffer(1024),
      hash: 'abc123',
    };

    it('stores and retrieves tensor chunk', async () => {
      await storage.storeTensorChunk(testChunk);
      const result = await storage.getTensorChunk('test-model', 'layer0', 0);
      expect(result).toEqual(testChunk);
    });

    it('returns null for non-existent chunk', async () => {
      const result = await storage.getTensorChunk('test-model', 'layer0', 0);
      expect(result).toBeNull();
    });

    it('retrieves chunks by layer', async () => {
      const chunk1 = { ...testChunk, id: 'test-model:layer0:0', chunkIndex: 0 };
      const chunk2 = { ...testChunk, id: 'test-model:layer0:1', chunkIndex: 1 };
      await storage.storeTensorChunk(chunk1);
      await storage.storeTensorChunk(chunk2);

      const chunks = await storage.getTensorChunks('test-model', 0);
      expect(chunks).toHaveLength(2);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);
    });

    it('deletes all chunks for a model', async () => {
      await storage.storeTensorChunk(testChunk);
      await storage.storeTensorChunk({
        ...testChunk,
        id: 'test-model:layer1:0',
        tensorName: 'layer1',
        layerIndex: 1,
      });

      await storage.deleteTensorChunks('test-model');

      const chunks0 = await storage.getTensorChunks('test-model', 0);
      const chunks1 = await storage.getTensorChunks('test-model', 1);
      expect(chunks0).toHaveLength(0);
      expect(chunks1).toHaveLength(0);
    });
  });

  describe('tokenizer', () => {
    const testTokenizer: TokenizerData = {
      modelId: 'test-model',
      vocab: new ArrayBuffer(1024),
      merges: new ArrayBuffer(512),
      specialTokens: { '<s>': 1, '</s>': 2, '<pad>': 0 },
      chatTemplate: 'ChatML',
    };

    it('stores and retrieves tokenizer', async () => {
      await storage.setTokenizer(testTokenizer);
      const result = await storage.getTokenizer('test-model');
      expect(result).toEqual(testTokenizer);
    });

    it('returns null for non-existent tokenizer', async () => {
      const result = await storage.getTokenizer('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('sync progress', () => {
    const testProgress: SyncProgress = {
      modelId: 'test-model',
      tensorName: 'layer0',
      chunksDownloaded: 1,
      totalChunks: 4,
      lastSync: '2024-01-01T00:00:00.000Z',
    };

    it('stores and retrieves sync progress', async () => {
      await storage.updateSyncProgress(testProgress);
      const result = await storage.getSyncProgress('test-model');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(testProgress);
    });

    it('returns empty array for no progress', async () => {
      const result = await storage.getSyncProgress('non-existent');
      expect(result).toHaveLength(0);
    });

    it('updates existing progress', async () => {
      await storage.updateSyncProgress(testProgress);
      await storage.updateSyncProgress({
        ...testProgress,
        chunksDownloaded: 3,
      });

      const result = await storage.getSyncProgress('test-model');
      expect(result).toHaveLength(1);
      expect(result[0].chunksDownloaded).toBe(3);
    });

    it('tracks multiple tensors separately', async () => {
      await storage.updateSyncProgress(testProgress);
      await storage.updateSyncProgress({
        ...testProgress,
        tensorName: 'layer1',
        chunksDownloaded: 2,
      });

      const result = await storage.getSyncProgress('test-model');
      expect(result).toHaveLength(2);
    });

    it('clears sync progress', async () => {
      await storage.updateSyncProgress(testProgress);
      await storage.clearSyncProgress('test-model');
      const result = await storage.getSyncProgress('test-model');
      expect(result).toHaveLength(0);
    });
  });

  describe('user adapters', () => {
    const testAdapter: UserAdapter = {
      id: 'adapter-123',
      modelId: 'test-model',
      userId: 'user-456',
      adapterType: 'reward_head',
      weights: new ArrayBuffer(4096),
      trainingExamples: 100,
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };

    it('stores and retrieves user adapter', async () => {
      await storage.setUserAdapter(testAdapter);
      const result = await storage.getUserAdapter('test-model', 'user-456');
      expect(result).toEqual(testAdapter);
    });

    it('returns null for non-existent adapter', async () => {
      const result = await storage.getUserAdapter('test-model', 'non-existent');
      expect(result).toBeNull();
    });

    it('deletes user adapter', async () => {
      await storage.setUserAdapter(testAdapter);
      await storage.deleteUserAdapter('adapter-123');
      const result = await storage.getUserAdapter('test-model', 'user-456');
      expect(result).toBeNull();
    });
  });

  describe('training log', () => {
    it('adds and retrieves training log entries', async () => {
      const id = await storage.addTrainingLogEntry({
        adapterId: 'adapter-123',
        messageHash: 'hash1',
        feedback: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      expect(id).toBe(0);

      const log = await storage.getTrainingLog('adapter-123');
      expect(log).toHaveLength(1);
      expect(log[0].messageHash).toBe('hash1');
      expect(log[0].id).toBe(0);
    });

    it('increments log IDs', async () => {
      const id1 = await storage.addTrainingLogEntry({
        adapterId: 'adapter-123',
        messageHash: 'hash1',
        feedback: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const id2 = await storage.addTrainingLogEntry({
        adapterId: 'adapter-123',
        messageHash: 'hash2',
        feedback: -1,
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      expect(id1).toBe(0);
      expect(id2).toBe(1);
    });

    it('filters by adapter ID', async () => {
      await storage.addTrainingLogEntry({
        adapterId: 'adapter-1',
        messageHash: 'hash1',
        feedback: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      await storage.addTrainingLogEntry({
        adapterId: 'adapter-2',
        messageHash: 'hash2',
        feedback: -1,
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      const log1 = await storage.getTrainingLog('adapter-1');
      const log2 = await storage.getTrainingLog('adapter-2');

      expect(log1).toHaveLength(1);
      expect(log2).toHaveLength(1);
      expect(log1[0].messageHash).toBe('hash1');
      expect(log2[0].messageHash).toBe('hash2');
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.addTrainingLogEntry({
          adapterId: 'adapter-123',
          messageHash: `hash${i}`,
          feedback: i % 2 === 0 ? 1 : -1,
          createdAt: `2024-01-0${i + 1}T00:00:00.000Z`,
        });
      }

      const log = await storage.getTrainingLog('adapter-123', 5);
      expect(log).toHaveLength(5);
      // Should return the last 5 entries
      expect(log[0].messageHash).toBe('hash5');
    });
  });

  describe('utility methods', () => {
    it('checks model completion', async () => {
      // No progress = not complete
      let complete = await storage.isModelComplete('test-model');
      expect(complete).toBe(false);

      // Incomplete progress
      await storage.updateSyncProgress({
        modelId: 'test-model',
        tensorName: 'layer0',
        chunksDownloaded: 1,
        totalChunks: 4,
      });
      complete = await storage.isModelComplete('test-model');
      expect(complete).toBe(false);

      // Complete progress
      await storage.updateSyncProgress({
        modelId: 'test-model',
        tensorName: 'layer0',
        chunksDownloaded: 4,
        totalChunks: 4,
      });
      complete = await storage.isModelComplete('test-model');
      expect(complete).toBe(true);
    });

    it('calculates storage used', async () => {
      // Empty storage
      let used = await storage.getStorageUsed();
      expect(used).toBe(0);

      // Add some chunks
      await storage.storeTensorChunk({
        id: 'test:layer0:0',
        modelId: 'test',
        tensorName: 'layer0',
        layerIndex: 0,
        chunkIndex: 0,
        totalChunks: 1,
        dtype: 'f32',
        shape: [256],
        offset: 0,
        data: new ArrayBuffer(1024),
        hash: 'abc',
      });

      used = await storage.getStorageUsed();
      expect(used).toBe(1024);
    });

    it('clears all data', async () => {
      // Add various data
      await storage.setModelMeta({
        id: 'test',
        name: 'Test',
        architecture: 'smollm',
        version: '1.0.0',
        vocabSize: 32000,
        hiddenDim: 512,
        numLayers: 12,
        numHeads: 8,
        maxSeqLength: 1024,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      await storage.storeTensorChunk({
        id: 'test:layer0:0',
        modelId: 'test',
        tensorName: 'layer0',
        layerIndex: 0,
        chunkIndex: 0,
        totalChunks: 1,
        dtype: 'f32',
        shape: [256],
        offset: 0,
        data: new ArrayBuffer(1024),
        hash: 'abc',
      });
      await storage.updateSyncProgress({
        modelId: 'test',
        tensorName: 'layer0',
        chunksDownloaded: 1,
        totalChunks: 1,
      });

      // Clear everything
      await storage.clear();

      // Verify all cleared
      expect(await storage.listModels()).toHaveLength(0);
      expect(await storage.getTensorChunks('test', 0)).toHaveLength(0);
      expect(await storage.getSyncProgress('test')).toHaveLength(0);
      expect(await storage.getStorageUsed()).toBe(0);
    });
  });
});
