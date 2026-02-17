/**
 * Tier 2 Embeddings Infrastructure Tests
 *
 * Validates semantic search and similarity workflows using the core
 * embedding primitives that ship with the SDK.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { EmbeddingCache } from '../compute/embeddings/embedding-cache';
import type {
  BatchEmbeddingResult,
  EmbeddingResult,
  IEmbeddingModel,
} from '../compute/embeddings/embedding-model';
import { SemanticSearchEngine } from '../compute/embeddings/semantic-search';
import { SimilarityEngine } from '../compute/embeddings/similarity-engine';

class MockEmbeddingModel implements IEmbeddingModel {
  config = {
    modelId: 'mock-embedding-model',
    dimensions: 64,
    maxSequenceLength: 128,
    supportsBatching: true,
    batchSizeLimit: 16,
    costPerMToken: undefined,
    isLocal: true,
    isEdge: false,
    isCloud: false,
  };

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async embed(input: { text: string }): Promise<EmbeddingResult> {
    if (!this.initialized) {
      throw new Error('Model not initialized');
    }

    const vector = Array.from(
      { length: this.config.dimensions },
      (_, index) => {
        const value =
          input.text.charCodeAt(index % input.text.length || 0) || 0;
        return (value % 255) / 255;
      }
    );

    return {
      text: input.text,
      vector,
      dimensions: this.config.dimensions,
      cached: false,
      model: this.config.modelId,
      usage: { promptTokens: 5, totalTokens: 5 },
    };
  }

  async embedBatch(
    inputs: Array<{ text: string }>
  ): Promise<BatchEmbeddingResult> {
    if (!this.initialized) {
      throw new Error('Model not initialized');
    }

    const embeddings = await Promise.all(
      inputs.map((input) => this.embed(input))
    );

    return {
      embeddings,
      totalTokens: inputs.length * 5,
      source: 'local',
      processingMs: 5,
      cacheHitRate: 0,
    };
  }

  async precompute(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((text) => this.embed({ text })));
  }

  getInfo() {
    return {
      modelId: this.config.modelId,
      dimensions: this.config.dimensions,
      maxSequenceLength: this.config.maxSequenceLength,
      supportsBatching: this.config.supportsBatching,
    };
  }
}

describe('Tier 2: Embeddings Infrastructure', () => {
  let model: MockEmbeddingModel;

  beforeEach(async () => {
    model = new MockEmbeddingModel();
    await model.initialize();
  });

  describe('Single embeddings', () => {
    it('generates embeddings for input text', async () => {
      const result = await model.embed({ text: 'I felt anxious today' });

      expect(result.vector.length).toBe(model.config.dimensions);
      expect(result.dimensions).toBe(model.config.dimensions);
      expect(result.cached).toBe(false);
      expect(result.model).toBe(model.config.modelId);
    });

    it('supports batch embeddings', async () => {
      const result = await model.embedBatch([
        { text: 'I felt anxious' },
        { text: 'I felt joyful' },
        { text: 'I felt calm' },
      ]);

      expect(result.embeddings).toHaveLength(3);
      expect(result.totalTokens).toBe(15);
      expect(result.processingMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Semantic search engine', () => {
    let searchEngine: SemanticSearchEngine;

    beforeEach(async () => {
      searchEngine = new SemanticSearchEngine(model, { maxSize: 100 });
      await searchEngine.initialize();
      await searchEngine.buildIndex([
        { text: 'I felt calm after meditation' },
        { text: 'Work stress made me anxious' },
        { text: 'A joyful reunion with friends' },
      ]);
    });

    it('returns ranked results for a query', async () => {
      const results = await searchEngine.search({
        query: 'anxious feelings',
        limit: 2,
      });

      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('respects minimum score thresholds', async () => {
      const results = await searchEngine.search({
        query: 'meditation',
        minScore: 0.2,
      });

      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.2);
      }
    });
  });

  describe('Similarity engine', () => {
    let similarityEngine: SimilarityEngine;

    beforeEach(async () => {
      similarityEngine = new SimilarityEngine(model);
      await similarityEngine.initialize();
    });

    it('compares similarity between two texts', async () => {
      const result = await similarityEngine.compareSimilarity(
        'Calm breathing helped',
        'Breathing exercises helped'
      );

      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1);
    });

    it('finds similar content from a candidate list', async () => {
      const results = await similarityEngine.findSimilar(
        'feeling anxious',
        ['feeling anxious', 'happy news', 'deep focus'],
        2
      );

      expect(results.length).toBeLessThanOrEqual(2);
      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Embedding cache usage', () => {
    it('records cache statistics for stored embeddings', () => {
      const cache = new EmbeddingCache({ maxSize: 10, ttlMs: 60000 });
      cache.set('text-1', [0.1, 0.2, 0.3]);
      cache.set('text-2', [0.2, 0.3, 0.4]);

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
      expect(stats.utilizationPercent).toBeGreaterThan(0);
    });
  });
});
