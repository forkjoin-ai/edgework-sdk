/**
 * Embeddings Module Exports
 *
 * Semantic embedding infrastructure for similarity search, clustering,
 * and content recommendation.
 */

export type {
  EmbeddingInput,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingModelConfig,
  IEmbeddingModel,
  EmbeddingRouteDecision,
} from './embedding-model';

export { EMBEDDING_MODELS } from './embedding-model';

export type { EmbeddingCacheConfig } from './embedding-cache';
export { EmbeddingCache } from './embedding-cache';

export type { SearchResult, SearchQuery } from './semantic-search';
export { SemanticSearchEngine } from './semantic-search';

export type { SimilarityPair, SimilarContentResult } from './similarity-engine';
export { SimilarityEngine } from './similarity-engine';
