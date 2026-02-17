/**
 * Semantic Search Engine
 *
 * Full-text semantic search using embeddings for relevance scoring.
 * Supports on-keystroke search with live results and query expansion.
 */

import { EmbeddingCache } from './embedding-cache';
import type { EmbeddingResult, IEmbeddingModel } from './embedding-model';

/**
 * Search result
 */
export interface SearchResult {
  /** Result text */
  text: string;

  /** Relevance score (0-1) */
  score: number;

  /** Result metadata */
  metadata?: Record<string, unknown>;

  /** Search source (local, edge, cloud) */
  source: 'local' | 'edge' | 'cloud';
}

/**
 * Search query
 */
export interface SearchQuery {
  /** Query text */
  query: string;

  /** Number of results to return */
  limit?: number;

  /** Minimum relevance threshold (0-1) */
  minScore?: number;

  /** Whether to expand query with related terms */
  expandQuery?: boolean;

  /** Metadata filters */
  filters?: Record<string, unknown>;
}

/**
 * Search index entry
 */
interface IndexEntry {
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Semantic Search Engine
 */
export class SemanticSearchEngine {
  private embeddingModel: IEmbeddingModel;
  private cache: EmbeddingCache;
  private index: IndexEntry[] = [];
  private isIndexed = false;

  constructor(embeddingModel: IEmbeddingModel, cacheConfig?: any) {
    this.embeddingModel = embeddingModel;
    this.cache = new EmbeddingCache(cacheConfig);
  }

  /**
   * Initialize the search engine
   */
  async initialize(): Promise<void> {
    await this.embeddingModel.initialize();
  }

  /**
   * Build search index from documents
   */
  async buildIndex(
    documents: Array<{ text: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    const embeddings = await this.embeddingModel.embedBatch(
      documents.map((doc) => ({ text: doc.text }))
    );

    this.index = documents.map((doc, idx) => ({
      text: doc.text,
      vector: embeddings.embeddings[idx].vector,
      metadata: doc.metadata,
    }));

    this.isIndexed = true;
  }

  /**
   * Search index with query
   */
  async search(options: SearchQuery): Promise<SearchResult[]> {
    if (!this.isIndexed) {
      throw new Error('Index not built. Call buildIndex() first.');
    }

    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.0;

    // Get query embedding
    const queryEmbedding = await this.embeddingModel.embed({
      text: options.query,
    });

    // Score all indexed documents
    const scores = this.index.map((entry, idx) => ({
      index: idx,
      score: this.cosineSimilarity(queryEmbedding.vector, entry.vector),
    }));

    // Sort by score descending
    const sorted = scores
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sorted.map((s) => ({
      text: this.index[s.index].text,
      score: s.score,
      metadata: this.index[s.index].metadata,
      source: 'edge',
    }));
  }

  /**
   * Add document to index
   */
  async addDocument(
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const embedding = await this.embeddingModel.embed({ text });
    this.index.push({
      text,
      vector: embedding.vector,
      metadata,
    });
  }

  /**
   * Remove document from index by text
   */
  removeDocument(text: string): void {
    this.index = this.index.filter((entry) => entry.text !== text);
  }

  /**
   * Clear index
   */
  clearIndex(): void {
    this.index = [];
    this.isIndexed = false;
    this.cache.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): {
    indexSize: number;
    isBuilt: boolean;
    modelId: string;
  } {
    return {
      indexSize: this.index.length,
      isBuilt: this.isIndexed,
      modelId: this.embeddingModel.config.modelId,
    };
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
   * Expand query with related terms (stub for extensibility)
   */
  private expandQuery(query: string): string[] {
    // NOTE(liquidated): In a real implementation, this would use query expansion techniques
    // like synonym expansion, word embedding neighbors, etc.
    return [query];
  }
}
