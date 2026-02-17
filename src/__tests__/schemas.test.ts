/**
 * Zod Schema Tests
 */

import { describe, expect, it } from 'bun:test';
import {
  ModelArchitectureSchema,
  QuantizationTypeSchema,
  ModelMetaSchema,
  TensorChunkSchema,
  TokenizerDataSchema,
  SyncProgressSchema,
  AdapterTypeSchema,
  UserAdapterSchema,
  GenerateOptionsSchema,
  GenerateResultSchema,
  ChatMessageSchema,
  ChatMessagesSchema,
  RLHFFeedbackSchema,
  DownloadProgressSchema,
  EdgeworkOptionsSchema,
  validateModelMeta,
  validateGenerateOptions,
  validateChatMessages,
  safeParseModelMeta,
  safeParseGenerateOptions,
} from '../schemas';

describe('Schema Validation', () => {
  describe('ModelArchitectureSchema', () => {
    it('validates valid architectures', () => {
      expect(ModelArchitectureSchema.parse('llama')).toBe('llama');
      expect(ModelArchitectureSchema.parse('mistral')).toBe('mistral');
      expect(ModelArchitectureSchema.parse('qwen')).toBe('qwen');
      expect(ModelArchitectureSchema.parse('smollm')).toBe('smollm');
      expect(ModelArchitectureSchema.parse('phi')).toBe('phi');
    });

    it('rejects invalid architectures', () => {
      expect(() => ModelArchitectureSchema.parse('invalid')).toThrow();
      expect(() => ModelArchitectureSchema.parse('')).toThrow();
      expect(() => ModelArchitectureSchema.parse(123)).toThrow();
    });
  });

  describe('QuantizationTypeSchema', () => {
    it('validates valid quantization types', () => {
      expect(QuantizationTypeSchema.parse('f32')).toBe('f32');
      expect(QuantizationTypeSchema.parse('f16')).toBe('f16');
      expect(QuantizationTypeSchema.parse('q8_0')).toBe('q8_0');
      expect(QuantizationTypeSchema.parse('q4_k')).toBe('q4_k');
      expect(QuantizationTypeSchema.parse('q4_0')).toBe('q4_0');
      expect(QuantizationTypeSchema.parse('q4_1')).toBe('q4_1');
    });

    it('rejects invalid quantization types', () => {
      expect(() => QuantizationTypeSchema.parse('q8_1')).toThrow();
      expect(() => QuantizationTypeSchema.parse('')).toThrow();
    });
  });

  describe('ModelMetaSchema', () => {
    const validModelMeta = {
      id: 'cog-360m',
      name: 'Cog',
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
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    it('validates valid model meta', () => {
      const result = ModelMetaSchema.parse(validModelMeta);
      expect(result.id).toBe('cog-360m');
      expect(result.vocabSize).toBe(49152);
    });

    it('rejects invalid model meta', () => {
      expect(() =>
        ModelMetaSchema.parse({ ...validModelMeta, vocabSize: -1 })
      ).toThrow();
      expect(() =>
        ModelMetaSchema.parse({ ...validModelMeta, numLayers: 0 })
      ).toThrow();
      expect(() =>
        ModelMetaSchema.parse({ ...validModelMeta, architecture: 'invalid' })
      ).toThrow();
    });

    it('allows optional fields', () => {
      const minimal = {
        id: 'test',
        name: 'Test',
        architecture: 'llama',
        version: '1.0.0',
        vocabSize: 32000,
        hiddenDim: 512,
        numLayers: 12,
        numHeads: 8,
        maxSeqLength: 1024,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const result = ModelMetaSchema.parse(minimal);
      expect(result.numKvHeads).toBeUndefined();
      expect(result.intermediateDim).toBeUndefined();
    });
  });

  describe('TensorChunkSchema', () => {
    const validTensorChunk = {
      id: 'cog-360m:layer0:0',
      modelId: 'cog-360m',
      tensorName: 'layer0',
      layerIndex: 0,
      chunkIndex: 0,
      totalChunks: 4,
      dtype: 'q4_k',
      shape: [960, 960],
      offset: 0,
      data: new ArrayBuffer(1024),
      hash: 'abc123',
    };

    it('validates valid tensor chunk', () => {
      const result = TensorChunkSchema.parse(validTensorChunk);
      expect(result.id).toBe('cog-360m:layer0:0');
      expect(result.data).toBeInstanceOf(ArrayBuffer);
    });

    it('allows null layerIndex for embedding tensors', () => {
      const embedChunk = { ...validTensorChunk, layerIndex: null };
      const result = TensorChunkSchema.parse(embedChunk);
      expect(result.layerIndex).toBeNull();
    });

    it('rejects invalid tensor chunk', () => {
      expect(() =>
        TensorChunkSchema.parse({ ...validTensorChunk, chunkIndex: -1 })
      ).toThrow();
      expect(() =>
        TensorChunkSchema.parse({ ...validTensorChunk, totalChunks: 0 })
      ).toThrow();
    });
  });

  describe('TokenizerDataSchema', () => {
    it('validates valid tokenizer data', () => {
      const data = {
        modelId: 'cog-360m',
        vocab: new ArrayBuffer(1024),
        merges: new ArrayBuffer(512),
        specialTokens: { '<s>': 1, '</s>': 2, '<pad>': 0 },
        chatTemplate: 'ChatML',
      };
      const result = TokenizerDataSchema.parse(data);
      expect(result.modelId).toBe('cog-360m');
      expect(result.vocab).toBeInstanceOf(ArrayBuffer);
    });

    it('allows optional fields', () => {
      const minimal = {
        modelId: 'test',
        vocab: new ArrayBuffer(100),
        specialTokens: { '<s>': 1 },
      };
      const result = TokenizerDataSchema.parse(minimal);
      expect(result.merges).toBeUndefined();
      expect(result.chatTemplate).toBeUndefined();
    });
  });

  describe('SyncProgressSchema', () => {
    it('validates valid sync progress', () => {
      const progress = {
        modelId: 'cog-360m',
        tensorName: 'layer0',
        chunksDownloaded: 2,
        totalChunks: 4,
        lastSync: '2024-01-01T00:00:00.000Z',
      };
      const result = SyncProgressSchema.parse(progress);
      expect(result.chunksDownloaded).toBe(2);
    });

    it('rejects invalid sync progress', () => {
      expect(() =>
        SyncProgressSchema.parse({
          modelId: 'test',
          tensorName: 'layer0',
          chunksDownloaded: -1,
          totalChunks: 4,
        })
      ).toThrow();
    });
  });

  describe('AdapterTypeSchema', () => {
    it('validates valid adapter types', () => {
      expect(AdapterTypeSchema.parse('reward_head')).toBe('reward_head');
      expect(AdapterTypeSchema.parse('style_adapter')).toBe('style_adapter');
      expect(AdapterTypeSchema.parse('lora')).toBe('lora');
    });

    it('rejects invalid adapter types', () => {
      expect(() => AdapterTypeSchema.parse('invalid')).toThrow();
    });
  });

  describe('UserAdapterSchema', () => {
    it('validates valid user adapter', () => {
      const adapter = {
        id: 'adapter-123',
        modelId: 'cog-360m',
        userId: 'user-456',
        adapterType: 'reward_head',
        weights: new ArrayBuffer(4096),
        trainingExamples: 100,
        lastUpdated: '2024-01-01T00:00:00.000Z',
      };
      const result = UserAdapterSchema.parse(adapter);
      expect(result.trainingExamples).toBe(100);
    });
  });

  describe('GenerateOptionsSchema', () => {
    it('validates valid generate options', () => {
      const options = {
        maxTokens: 512,
        temperature: 0.8,
        topP: 0.95,
        topK: 50,
        stopSequences: ['</s>'],
        stream: true,
      };
      const result = GenerateOptionsSchema.parse(options);
      expect(result.maxTokens).toBe(512);
    });

    it('applies defaults', () => {
      const result = GenerateOptionsSchema.parse({});
      expect(result.maxTokens).toBe(256);
      expect(result.temperature).toBe(0.7);
      expect(result.topP).toBe(0.9);
      expect(result.topK).toBe(40);
      expect(result.stream).toBe(false);
    });

    it('rejects out-of-range values', () => {
      expect(() => GenerateOptionsSchema.parse({ temperature: 3 })).toThrow();
      expect(() => GenerateOptionsSchema.parse({ topP: 1.5 })).toThrow();
      expect(() => GenerateOptionsSchema.parse({ maxTokens: 5000 })).toThrow();
    });
  });

  describe('GenerateResultSchema', () => {
    it('validates valid generate result', () => {
      const result = GenerateResultSchema.parse({
        text: 'Hello, world!',
        tokens: [1, 2, 3],
        tokenCount: 3,
        durationMs: 150.5,
        tokensPerSecond: 20.0,
      });
      expect(result.text).toBe('Hello, world!');
      expect(result.tokenCount).toBe(3);
    });
  });

  describe('ChatMessageSchema', () => {
    it('validates valid chat messages', () => {
      expect(ChatMessageSchema.parse({ role: 'user', content: 'Hi' })).toEqual({
        role: 'user',
        content: 'Hi',
      });
      expect(
        ChatMessageSchema.parse({ role: 'assistant', content: 'Hello!' })
      ).toEqual({ role: 'assistant', content: 'Hello!' });
      expect(
        ChatMessageSchema.parse({
          role: 'system',
          content: 'You are helpful.',
        })
      ).toEqual({ role: 'system', content: 'You are helpful.' });
    });

    it('rejects invalid roles', () => {
      expect(() =>
        ChatMessageSchema.parse({ role: 'invalid', content: 'Hi' })
      ).toThrow();
    });
  });

  describe('ChatMessagesSchema', () => {
    it('validates array of chat messages', () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ];
      const result = ChatMessagesSchema.parse(messages);
      expect(result).toHaveLength(3);
    });

    it('validates empty array', () => {
      const result = ChatMessagesSchema.parse([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('RLHFFeedbackSchema', () => {
    it('validates valid RLHF feedback', () => {
      const feedback = {
        messageHash: 'hash123',
        feedback: 1,
        hiddenState: new Float32Array([1, 2, 3]),
      };
      const result = RLHFFeedbackSchema.parse(feedback);
      expect(result.feedback).toBe(1);
    });

    it('rejects out-of-range feedback', () => {
      expect(() =>
        RLHFFeedbackSchema.parse({ messageHash: 'hash', feedback: 2 })
      ).toThrow();
      expect(() =>
        RLHFFeedbackSchema.parse({ messageHash: 'hash', feedback: -2 })
      ).toThrow();
    });
  });

  describe('DownloadProgressSchema', () => {
    it('validates valid download progress', () => {
      const progress = {
        modelId: 'cog-360m',
        percent: 50,
        bytesDownloaded: 500000,
        totalBytes: 1000000,
        currentLayer: 'layer0',
        layersComplete: 10,
        totalLayers: 32,
        status: 'downloading',
      };
      const result = DownloadProgressSchema.parse(progress);
      expect(result.percent).toBe(50);
    });

    it('rejects invalid percent', () => {
      expect(() =>
        DownloadProgressSchema.parse({
          modelId: 'test',
          percent: 150,
          bytesDownloaded: 0,
          totalBytes: 100,
          layersComplete: 0,
          totalLayers: 1,
          status: 'downloading',
        })
      ).toThrow();
    });
  });

  describe('EdgeworkOptionsSchema', () => {
    it('validates valid options', () => {
      const options = {
        model: 'cog-360m',
        syncUrl: 'https://example.com/models',
        enableRLHF: true,
        userId: 'user-123',
        storageBackend: 'opfs',
        inferenceBackend: 'webgpu',
      };
      const result = EdgeworkOptionsSchema.parse(options);
      expect(result.model).toBe('cog-360m');
    });

    it('applies defaults', () => {
      const result = EdgeworkOptionsSchema.parse({ model: 'test' });
      expect(result.enableRLHF).toBe(false);
    });

    it('rejects invalid URL', () => {
      expect(() =>
        EdgeworkOptionsSchema.parse({
          model: 'test',
          syncUrl: 'not-a-url',
        })
      ).toThrow();
    });
  });
});

describe('Validation Helpers', () => {
  describe('validateModelMeta', () => {
    it('returns parsed model meta', () => {
      const meta = validateModelMeta({
        id: 'test',
        name: 'Test',
        architecture: 'llama',
        version: '1.0.0',
        vocabSize: 32000,
        hiddenDim: 512,
        numLayers: 12,
        numHeads: 8,
        maxSeqLength: 1024,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(meta.id).toBe('test');
    });

    it('throws on invalid data', () => {
      expect(() => validateModelMeta({ id: 'test' })).toThrow();
    });
  });

  describe('validateGenerateOptions', () => {
    it('returns parsed options with defaults', () => {
      const options = validateGenerateOptions({});
      expect(options.maxTokens).toBe(256);
      expect(options.temperature).toBe(0.7);
    });
  });

  describe('validateChatMessages', () => {
    it('returns parsed chat messages', () => {
      const messages = validateChatMessages([{ role: 'user', content: 'Hi' }]);
      expect(messages).toHaveLength(1);
    });
  });

  describe('safeParseModelMeta', () => {
    it('returns success for valid data', () => {
      const result = safeParseModelMeta({
        id: 'test',
        name: 'Test',
        architecture: 'llama',
        version: '1.0.0',
        vocabSize: 32000,
        hiddenDim: 512,
        numLayers: 12,
        numHeads: 8,
        maxSeqLength: 1024,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('returns unmet expectations for invalid data', () => {
      const result = safeParseModelMeta({ invalid: true });
      expect(result.success).toBe(false);
    });
  });

  describe('safeParseGenerateOptions', () => {
    it('returns success for valid options', () => {
      const result = safeParseGenerateOptions({ temperature: 0.5 });
      expect(result.success).toBe(true);
    });

    it('returns unmet expectations for invalid options', () => {
      const result = safeParseGenerateOptions({ temperature: 5 });
      expect(result.success).toBe(false);
    });
  });
});
