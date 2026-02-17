/**
 * Embedding Model Interface
 *
 * Abstracts different embedding providers (OpenAI, local models, etc.)
 * Supports both local and distributed execution with automatic routing.
 */

/**
 * Embedding request
 */
export interface EmbeddingInput {
  /** Text to embed */
  text: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;

  /** Optional ID for caching */
  id?: string;

  /** Model override (if different from default) */
  model?: string;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  /** Text that was embedded */
  text: string;

  /** Dense vector representation */
  vector: number[];

  /** Vector dimensions */
  dimensions: number;

  /** Whether result was cached */
  cached: boolean;

  /** Model used */
  model: string;

  /** Tokens used */
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** Individual embeddings */
  embeddings: EmbeddingResult[];

  /** Total tokens used */
  totalTokens: number;

  /** Execution source */
  source: 'local' | 'edge' | 'cloud';

  /** Processing time in ms */
  processingMs: number;

  /** Cache hit rate */
  cacheHitRate: number;
}

/**
 * Embedding model configuration
 */
export interface EmbeddingModelConfig {
  /** Model identifier */
  modelId: string;

  /** Vector dimensions */
  dimensions: number;

  /** Maximum sequence length */
  maxSequenceLength: number;

  /** Supports batching */
  supportsBatching: boolean;

  /** Batch size limit */
  batchSizeLimit: number;

  /** Cost per million tokens (null = free local) */
  costPerMToken?: number;

  /** Whether model runs locally */
  isLocal: boolean;

  /** Whether model runs on edge */
  isEdge: boolean;

  /** Whether model runs on cloud */
  isCloud: boolean;
}

/**
 * Embedding model interface
 */
export interface IEmbeddingModel {
  /** Model configuration */
  config: EmbeddingModelConfig;

  /** Initialize model */
  initialize(): Promise<void>;

  /** Check if initialized */
  isInitialized(): boolean;

  /** Embed single text */
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;

  /** Embed multiple texts in batch */
  embedBatch(inputs: EmbeddingInput[]): Promise<BatchEmbeddingResult>;

  /** Pre-compute embeddings for a dataset */
  precompute(texts: string[]): Promise<EmbeddingResult[]>;

  /** Get model info */
  getInfo(): {
    modelId: string;
    dimensions: number;
    maxSequenceLength: number;
    supportsBatching: boolean;
  };
}

/**
 * Supported embedding models
 */
export const EMBEDDING_MODELS = {
  // Local models (free)
  'all-minilm-l6-v2': {
    modelId: 'all-minilm-l6-v2',
    dimensions: 384,
    maxSequenceLength: 256,
    supportsBatching: true,
    batchSizeLimit: 32,
    costPerMToken: undefined, // Free
    isLocal: true,
    isEdge: false,
    isCloud: false,
  } as EmbeddingModelConfig,

  'all-mpnet-base-v2': {
    modelId: 'all-mpnet-base-v2',
    dimensions: 768,
    maxSequenceLength: 384,
    supportsBatching: true,
    batchSizeLimit: 32,
    costPerMToken: undefined, // Free
    isLocal: true,
    isEdge: false,
    isCloud: false,
  } as EmbeddingModelConfig,

  'bge-small-en-v1.5': {
    modelId: 'bge-small-en-v1.5',
    dimensions: 384,
    maxSequenceLength: 512,
    supportsBatching: true,
    batchSizeLimit: 32,
    costPerMToken: undefined, // Free
    isLocal: true,
    isEdge: false,
    isCloud: false,
  } as EmbeddingModelConfig,

  // Edge models (cheap)
  'openai-text-embedding-3-small': {
    modelId: 'text-embedding-3-small',
    dimensions: 1536,
    maxSequenceLength: 8191,
    supportsBatching: true,
    batchSizeLimit: 2048,
    costPerMToken: 0.02,
    isLocal: false,
    isEdge: true,
    isCloud: true,
  } as EmbeddingModelConfig,

  'openai-text-embedding-3-large': {
    modelId: 'text-embedding-3-large',
    dimensions: 3072,
    maxSequenceLength: 8191,
    supportsBatching: true,
    batchSizeLimit: 2048,
    costPerMToken: 0.13,
    isLocal: false,
    isEdge: true,
    isCloud: true,
  } as EmbeddingModelConfig,

  'gemini-embedding-001': {
    modelId: 'embedding-001',
    dimensions: 768,
    maxSequenceLength: 2048,
    supportsBatching: true,
    batchSizeLimit: 100,
    costPerMToken: 0.025,
    isLocal: false,
    isEdge: true,
    isCloud: true,
  } as EmbeddingModelConfig,
} as const;

/**
 * Routing decision for embedding execution
 */
export interface EmbeddingRouteDecision {
  /** Preferred model */
  model: EmbeddingModelConfig;

  /** Execution source */
  source: 'local' | 'edge' | 'cloud';

  /** Fallback sources in order */
  fallbacks: Array<'local' | 'edge' | 'cloud'>;

  /** Estimated cost */
  estimatedCost: number;

  /** Reasoning */
  reason: string;

  /** Confidence (0-1) */
  confidence: number;
}
