/**
 * Similarity Engine
 *
 * Computes semantic similarity between texts, finds related content,
 * and detects duplicates using embeddings.
 */

import type { IEmbeddingModel } from './embedding-model';

/**
 * Similarity pair
 */
export interface SimilarityPair {
  /** First text */
  text1: string;

  /** Second text */
  text2: string;

  /** Similarity score (0-1) */
  similarity: number;

  /** Whether texts are considered duplicates */
  isDuplicate: boolean;
}

/**
 * Similarity search result
 */
export interface SimilarContentResult {
  /** Similar text */
  text: string;

  /** Similarity score (0-1) */
  similarity: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Similarity Engine
 */
export class SimilarityEngine {
  private embeddingModel: IEmbeddingModel;
  private duplicateThreshold: number;
  private similarityThreshold: number;

  constructor(
    embeddingModel: IEmbeddingModel,
    options?: { duplicateThreshold?: number; similarityThreshold?: number }
  ) {
    this.embeddingModel = embeddingModel;
    this.duplicateThreshold = options?.duplicateThreshold ?? 0.95;
    this.similarityThreshold = options?.similarityThreshold ?? 0.7;
  }

  /**
   * Initialize engine
   */
  async initialize(): Promise<void> {
    await this.embeddingModel.initialize();
  }

  /**
   * Compare two texts for similarity
   */
  async compareSimilarity(
    text1: string,
    text2: string
  ): Promise<SimilarityPair> {
    const [emb1, emb2] = await Promise.all([
      this.embeddingModel.embed({ text: text1 }),
      this.embeddingModel.embed({ text: text2 }),
    ]);

    const similarity = this.cosineSimilarity(emb1.vector, emb2.vector);

    return {
      text1,
      text2,
      similarity,
      isDuplicate: similarity >= this.duplicateThreshold,
    };
  }

  /**
   * Find similar content from candidates
   */
  async findSimilar(
    query: string,
    candidates: string[],
    limit?: number
  ): Promise<SimilarContentResult[]> {
    const queryEmbedding = await this.embeddingModel.embed({ text: query });

    const candidateEmbeddings = await this.embeddingModel.embedBatch(
      candidates.map((text) => ({ text }))
    );

    const similarities = candidateEmbeddings.embeddings.map((emb, idx) => ({
      text: candidates[idx],
      similarity: this.cosineSimilarity(queryEmbedding.vector, emb.vector),
    }));

    return similarities
      .filter((s) => s.similarity >= this.similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit ?? 10);
  }

  /**
   * Find duplicates in a dataset
   */
  async findDuplicates(texts: string[]): Promise<SimilarityPair[]> {
    if (texts.length < 2) {
      return [];
    }

    const embeddings = await this.embeddingModel.embedBatch(
      texts.map((text) => ({ text }))
    );

    const duplicates: SimilarityPair[] = [];

    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = this.cosineSimilarity(
          embeddings.embeddings[i].vector,
          embeddings.embeddings[j].vector
        );

        if (similarity >= this.duplicateThreshold) {
          duplicates.push({
            text1: texts[i],
            text2: texts[j],
            similarity,
            isDuplicate: true,
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Cluster texts by similarity
   */
  async clusterTexts(
    texts: string[],
    clusterThreshold?: number
  ): Promise<string[][]> {
    const threshold = clusterThreshold ?? 0.8;

    if (texts.length === 0) {
      return [];
    }

    const embeddings = await this.embeddingModel.embedBatch(
      texts.map((text) => ({ text }))
    );

    // Simple clustering: group texts with high similarity
    const clusters: number[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < texts.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [i];
      assigned.add(i);

      for (let j = i + 1; j < texts.length; j++) {
        if (assigned.has(j)) continue;

        const similarity = this.cosineSimilarity(
          embeddings.embeddings[i].vector,
          embeddings.embeddings[j].vector
        );

        if (similarity >= threshold) {
          cluster.push(j);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters.map((cluster) => cluster.map((idx) => texts[idx]));
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dotProduct / (magA * magB);
  }

  /**
   * Batch compare multiple pairs
   */
  async batchCompareSimilarity(
    pairs: Array<[string, string]>
  ): Promise<SimilarityPair[]> {
    const allTexts = [...new Set(pairs.flat())];
    const embeddings = await this.embeddingModel.embedBatch(
      allTexts.map((text) => ({ text }))
    );

    const textToVector = new Map(
      allTexts.map((text, idx) => [text, embeddings.embeddings[idx].vector])
    );

    return pairs.map(([text1, text2]) => ({
      text1,
      text2,
      similarity: this.cosineSimilarity(
        textToVector.get(text1)!,
        textToVector.get(text2)!
      ),
      isDuplicate:
        this.cosineSimilarity(
          textToVector.get(text1)!,
          textToVector.get(text2)!
        ) >= this.duplicateThreshold,
    }));
  }
}
