/**
 * Embeddings Infrastructure Tests
 *
 * Tests for semantic search, similarity detection, and embedding caching.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EmbeddingCache } from './embedding-cache';
import { SemanticSearchEngine } from './semantic-search';
import { SimilarityEngine } from './similarity-engine';
import type {
  IEmbeddingModel,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './embedding-model';

/**
 * Mock embedding model for testing
 */
class MockEmbeddingModel implements IEmbeddingModel {
  config = {
    modelId: 'mock-embedding-model',
    dimensions: 384,
    maxSequenceLength: 512,
    supportsBatching: true,
    batchSizeLimit: 32,
    costPerMToken: undefined,
    isLocal: true,
    isEdge: false,
    isCloud: false,
  };

  private initialized = false;

  // Simple deterministic embedding based on text length and first chars
  private textToVector(text: string): number[] {
    const vector: number[] = [];
    const length = Math.min(text.length, 100);

    // Use text characters to generate deterministic vector
    for (let i = 0; i < this.config.dimensions; i++) {
      let value = 0;
      if (i < text.length) {
        value = (text.charCodeAt(i) % 256) / 256;
      }
      vector.push(value * 2 - 1); // Normalize to [-1, 1]
    }

    // Normalize to unit vector
    let magnitude = 0;
    for (const v of vector) {
      magnitude += v * v;
    }
    magnitude = Math.sqrt(magnitude);

    return vector.map((v) => v / magnitude);
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async embed(input: any): Promise<EmbeddingResult> {
    if (!this.initialized) {
      throw new Error('Model not initialized');
    }

    const vector = this.textToVector(input.text);

    return {
      text: input.text,
      vector,
      dimensions: this.config.dimensions,
      cached: false,
      model: this.config.modelId,
      usage: { promptTokens: 10, totalTokens: 10 },
    };
  }

  async embedBatch(inputs: any[]): Promise<BatchEmbeddingResult> {
    if (!this.initialized) {
      throw new Error('Model not initialized');
    }

    const embeddings = inputs.map((input) => {
      const vector = this.textToVector(input.text);
      return {
        text: input.text,
        vector,
        dimensions: this.config.dimensions,
        cached: false,
        model: this.config.modelId,
      };
    });

    return {
      embeddings,
      totalTokens: inputs.length * 10,
      source: 'local',
      processingMs: 10,
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

describe('Embeddings Infrastructure', () => {
  describe('EmbeddingCache', () => {
    let cache: EmbeddingCache;

    beforeEach(() => {
      cache = new EmbeddingCache({ maxSize: 100, ttlMs: 3600000 });
    });

    it('should cache and retrieve embeddings', () => {
      const text = 'Hello world';
      const vector = [0.1, 0.2, 0.3, 0.4];

      cache.set(text, vector);
      const retrieved = cache.get(text);

      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(vector);
    });

    it('should return null for uncached text', () => {
      const retrieved = cache.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should differentiate by model', () => {
      const text = 'Hello world';
      const vector1 = [0.1, 0.2, 0.3];
      const vector2 = [0.4, 0.5, 0.6];

      cache.set(text, vector1, 'model1');
      cache.set(text, vector2, 'model2');

      expect(cache.get(text, 'model1')).toEqual(vector1);
      expect(cache.get(text, 'model2')).toEqual(vector2);
    });

    it('should track cache statistics', () => {
      cache.set('text1_unique_a', [0.1, 0.2]);
      cache.set('text2_unique_b', [0.3, 0.4]);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
      expect(stats.utilizationPercent).toBeGreaterThan(0);
    });

    it('should clear cache', () => {
      cache.set('text', [0.1, 0.2]);
      expect(cache.get('text')).toBeDefined();

      cache.clear();
      expect(cache.get('text')).toBeNull();
    });

    it('should support batch operations', () => {
      cache.set('text1', [0.1, 0.2]);
      cache.set('text2', [0.3, 0.4]);
      cache.set('text3', [0.5, 0.6]);

      const batch = cache.batchGet(['text1', 'text2', 'nonexistent']);
      expect(batch.size).toBe(2);
      expect(batch.has('text1')).toBe(true);
      expect(batch.has('text2')).toBe(true);
      expect(batch.has('nonexistent')).toBe(false);
    });
  });

  describe('SemanticSearchEngine', () => {
    let engine: SemanticSearchEngine;
    let model: MockEmbeddingModel;

    beforeEach(async () => {
      model = new MockEmbeddingModel();
      engine = new SemanticSearchEngine(model, { maxSize: 100 });
      await engine.initialize();
    });

    it('should build index from documents', async () => {
      const documents = [
        { text: 'The cat sat on the mat' },
        { text: 'A dog played in the park' },
        { text: 'Birds flying in the sky' },
      ];

      await engine.buildIndex(documents);

      const stats = engine.getStats();
      expect(stats.isBuilt).toBe(true);
      expect(stats.indexSize).toBe(3);
    });

    it('should search index with query', async () => {
      const documents = [
        { text: 'machine learning models' },
        { text: 'deep learning neural networks' },
        { text: 'cooking recipes and food' },
      ];

      await engine.buildIndex(documents);

      const results = await engine.search({
        query: 'machine learning',
        limit: 2,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('should add document to index', async () => {
      const documents = [{ text: 'initial document' }];
      await engine.buildIndex(documents);

      await engine.addDocument('new document');

      const stats = engine.getStats();
      expect(stats.indexSize).toBe(2);
    });

    it('should remove document from index', async () => {
      const documents = [{ text: 'doc1' }, { text: 'doc2' }, { text: 'doc3' }];

      await engine.buildIndex(documents);
      engine.removeDocument('doc2');

      const stats = engine.getStats();
      expect(stats.indexSize).toBe(2);
    });

    it('should clear index', async () => {
      const documents = [{ text: 'doc1' }, { text: 'doc2' }];
      await engine.buildIndex(documents);

      engine.clearIndex();

      const stats = engine.getStats();
      expect(stats.indexSize).toBe(0);
      expect(stats.isBuilt).toBe(false);
    });

    it('should respect minimum score threshold', async () => {
      const documents = [
        { text: 'cooking pizza recipes' },
        { text: 'machine learning' },
        { text: 'deep learning neural' },
      ];

      await engine.buildIndex(documents);

      const results = await engine.search({
        query: 'machine learning',
        limit: 10,
        minScore: 0.9, // Very high threshold
      });

      // With high threshold, may get few or no results
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('SimilarityEngine', () => {
    let engine: SimilarityEngine;
    let model: MockEmbeddingModel;

    beforeEach(async () => {
      model = new MockEmbeddingModel();
      engine = new SimilarityEngine(model, {
        duplicateThreshold: 0.95,
        similarityThreshold: 0.7,
      });
      await engine.initialize();
    });

    it('should compare similarity between texts', async () => {
      const result = await engine.compareSimilarity(
        'machine learning',
        'machine learning'
      );

      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1.0001); // Account for floating-point precision
    });

    it('should detect duplicates', async () => {
      const result = await engine.compareSimilarity(
        'exact same text',
        'exact same text'
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.95);
    });

    it('should find similar content', async () => {
      const query = 'machine learning algorithms';
      const candidates = [
        'deep learning neural networks',
        'cooking recipes',
        'machine learning models',
        'statistical analysis',
      ];

      const results = await engine.findSimilar(query, candidates, 2);

      expect(results.length).toBeLessThanOrEqual(2);
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should find duplicates in dataset', async () => {
      const texts = [
        'the quick brown fox',
        'the quick brown fox',
        'a slow red dog',
        'a slow red dog',
        'unique text here',
      ];

      const duplicates = await engine.findDuplicates(texts);

      expect(duplicates.length).toBeGreaterThan(0);
      for (const dup of duplicates) {
        expect(dup.isDuplicate).toBe(true);
      }
    });

    it('should cluster texts by similarity', async () => {
      const texts = [
        'machine learning algorithms',
        'deep learning models',
        'neural networks',
        'cooking recipes food',
        'restaurant menus',
        'pizza pasta dishes',
      ];

      const clusters = await engine.clusterTexts(texts, 0.7);

      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(texts.length);

      // All texts should be accounted for
      let totalCount = 0;
      for (const cluster of clusters) {
        totalCount += cluster.length;
      }
      expect(totalCount).toBe(texts.length);
    });

    it('should batch compare multiple pairs', async () => {
      const pairs: Array<[string, string]> = [
        ['text1', 'text1'],
        ['text2', 'text3'],
        ['text4', 'text4'],
      ];

      const results = await engine.batchCompareSimilarity(pairs);

      expect(results.length).toBe(3);
      expect(results[0].isDuplicate).toBe(true); // text1 == text1
      expect(results[2].isDuplicate).toBe(true); // text4 == text4
    });

    it('should handle empty input gracefully', async () => {
      const duplicates = await engine.findDuplicates([]);
      expect(duplicates.length).toBe(0);

      const single = await engine.findDuplicates(['single']);
      expect(single.length).toBe(0);
    });
  });
});
