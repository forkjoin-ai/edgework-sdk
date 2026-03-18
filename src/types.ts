/**
 * Edgework SDK Types
 *
 * Core type definitions for client-side AI inference with D1/Dash storage.
 */

// Model architecture types
export type ModelArchitecture = 'llama' | 'mistral' | 'qwen' | 'smollm' | 'phi';

// Quantization types
export type QuantizationType =
  | 'f32'
  | 'f16'
  | 'q8_0'
  | 'q4_k'
  | 'q4_0'
  | 'q4_1';

/**
 * Model metadata stored in D1
 */
export interface ModelMeta {
  id: string;
  name: string;
  architecture: ModelArchitecture;
  version: string;
  vocabSize: number;
  hiddenDim: number;
  numLayers: number;
  numHeads: number;
  numKvHeads?: number;
  intermediateDim?: number;
  maxSeqLength: number;
  ropeTheta?: number;
  createdAt: string;
}

/**
 * Tensor chunk stored in D1
 */
export interface TensorChunk {
  id: string;
  modelId: string;
  tensorName: string;
  layerIndex: number | null;
  chunkIndex: number;
  totalChunks: number;
  dtype: QuantizationType;
  shape: number[];
  offset: number;
  data: ArrayBuffer;
  hash: string;
}

/**
 * Tokenizer data stored in D1
 */
export interface TokenizerData {
  modelId: string;
  vocab: ArrayBuffer;
  merges?: ArrayBuffer;
  specialTokens: Record<string, number>;
  chatTemplate?: string;
}

/**
 * Download/sync progress
 */
export interface SyncProgress {
  modelId: string;
  tensorName: string;
  chunksDownloaded: number;
  totalChunks: number;
  lastSync?: string;
}

/**
 * User adapter for on-device RLHF
 */
export interface UserAdapter {
  id: string;
  modelId: string;
  userId: string;
  adapterType: 'reward_head' | 'style_adapter' | 'lora';
  weights: ArrayBuffer;
  trainingExamples: number;
  lastUpdated: string;
}

/**
 * Training log entry for RLHF
 */
export interface TrainingLogEntry {
  id: number;
  adapterId: string;
  messageHash: string;
  feedback: number;
  createdAt: string;
}

/**
 * Edgework initialization options
 */
export interface EdgeworkOptions {
  /** Model to load (e.g., 'cyrano-360m', 'cog-360m') */
  model: string;

  /** Sync server URL for model download */
  syncUrl?: string;

  /** Progress callback for model download */
  onProgress?: (progress: DownloadProgress) => void;

  /** Enable on-device RLHF */
  enableRLHF?: boolean;

  /** Enable community aggregation sync (opt-in) */
  communityParticipation?: boolean;

  /** Federated aggregation hub URL (optional) */
  federatedSyncUrl?: string;

  /** Micro-batch size for on-device training (default: 16) */
  trainingBatchSize?: number;

  /** Idle flush timeout in milliseconds (default: 45000) */
  trainingIdleFlushMs?: number;

  /** Local cache directory (Node.js only) */
  cacheDir?: string;

  /** Anonymous user ID for RLHF */
  userId?: string;

  /** Storage backend preference */
  storageBackend?: 'opfs' | 'indexeddb' | 'memory';

  /** Inference backend preference */
  inferenceBackend?: 'webgpu' | 'webnn' | 'wasm' | 'cpu';
}

/**
 * Download progress info
 */
export interface DownloadProgress {
  modelId: string;
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  currentLayer?: string;
  layersComplete: number;
  totalLayers: number;
  status: 'downloading' | 'verifying' | 'ready' | 'error';
  error?: string;
}

/**
 * Generation options
 */
export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  stream?: boolean;
}

/**
 * Generation result
 */
export interface GenerateResult {
  text: string;
  tokens: number[];
  tokenCount: number;
  durationMs: number;
  tokensPerSecond: number;
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * RLHF feedback
 */
export interface RLHFFeedback {
  messageHash: string;
  feedback: number; // -1.0 to 1.0
  hiddenState?: Float32Array;
}

/**
 * Supported multimodal inference domains
 */
export type Modality =
  | 'text'
  | 'stt'
  | 'tts'
  | 'translation'
  | 'embeddings'
  | 'classification'
  | 'image';

/**
 * Structured inference error codes
 */
export type InferenceErrorCode =
  | 'MODEL_NOT_READY'
  | 'MODEL_UNAVAILABLE'
  | 'QUALITY_GATE_FAILED'
  | 'LOCAL_TRAINING_REQUIRED';

/**
 * Structured multimodal inference error payload
 */
export interface InferenceError {
  code: InferenceErrorCode;
  message: string;
  modality: Modality;
  modelId?: string;
  modelVersion?: string;
  retryAfterMs?: number;
}

/**
 * Generic multimodal inference result
 */
export interface ModalityInferenceResult {
  modality: Modality;
  modelId: string;
  modelVersion?: string;
  output: unknown;
  durationMs: number;
}

/**
 * On-device training signal captured per modality
 */
export interface ModalityTrainingSignal {
  messageHash?: string;
  feedback?: number;
  hiddenState?: Float32Array;
  metadata?: Record<string, unknown>;
}

/**
 * Result from flushing accumulated local training signals
 */
export interface TrainingFlushResult {
  modality: Modality | 'all';
  trainedExamples: number;
  pendingExamples: number;
  communitySyncAttempted: boolean;
  communitySyncApplied: boolean;
  flushedAt: string;
}

/**
 * Distributed model manifest for sync
 */
export interface ModelManifest {
  modelId: string;
  modality: Modality;
  baseVersion: string;
  adapterVersion: string;
  sha256: string;
  chunkRefs: string[];
  minSdkVersion: string;
}

/**
 * Differentially-private gradient envelope
 */
export interface GradientEnvelope {
  modality: Modality;
  modelId: string;
  baseVersion: string;
  adapterBaseVersion: string;
  clippedDelta: ArrayBuffer;
  dpNoiseSeedId: string;
  deviceProof: string;
  createdAt: string;
}

/**
 * Model status
 */
export type ModelStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'ready'
  | 'offline'
  | 'error';

/**
 * Inference backend
 */
export type InferenceBackend = 'webgpu' | 'webnn' | 'wasm' | 'cpu';

/**
 * Storage backend
 */
export type StorageBackend = 'opfs' | 'indexeddb' | 'memory';

/**
 * Engine info
 */
export interface EngineInfo {
  modelId: string;
  status: ModelStatus;
  backend: InferenceBackend;
  storageBackend: StorageBackend;
  progress?: DownloadProgress;
  config: ModelMeta;
}

/**
 * Layer weights for streaming inference
 */
export interface LayerWeights {
  layerIndex: number;
  attnQ: Float32Array;
  attnK: Float32Array;
  attnV: Float32Array;
  attnOut: Float32Array;
  attnNorm: Float32Array;
  ffnGate: Float32Array;
  ffnUp: Float32Array;
  ffnDown: Float32Array;
  ffnNorm: Float32Array;
}

/**
 * KV cache for autoregressive generation
 */
export interface KVCache {
  keys: Float32Array[];
  values: Float32Array[];
  position: number;
  maxLength: number;
}

/**
 * Storage interface for model weights
 */
export interface ModelStorage {
  /** Get model metadata */
  getModelMeta(modelId: string): Promise<ModelMeta | null>;

  /** Get tensor chunks for a layer */
  getTensorChunks(modelId: string, layerIndex: number): Promise<TensorChunk[]>;

  /** Get tokenizer data */
  getTokenizer(modelId: string): Promise<TokenizerData | null>;

  /** Get sync progress */
  getSyncProgress(modelId: string): Promise<SyncProgress[]>;

  /** Store tensor chunk */
  storeTensorChunk(chunk: TensorChunk): Promise<void>;

  /** Update sync progress */
  updateSyncProgress(progress: SyncProgress): Promise<void>;

  /** Check if model is fully downloaded */
  isModelComplete(modelId: string): Promise<boolean>;

  /** Get total storage used */
  getStorageUsed(): Promise<number>;
}

/**
 * Sync service interface
 */
export interface SyncService {
  /** Start syncing a model */
  startSync(modelId: string): Promise<void>;

  /** Pause syncing */
  pauseSync(): Promise<void>;

  /** Resume syncing */
  resumeSync(): Promise<void>;

  /** Cancel sync and clean up */
  cancelSync(): Promise<void>;

  /** Get current sync progress */
  getProgress(): DownloadProgress | null;

  /** Check if syncing */
  isSyncing(): boolean;
}

/**
 * Inference engine interface
 */
export interface InferenceEngine {
  /** Initialize the engine */
  initialize(): Promise<void>;

  /** Generate text from prompt */
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;

  /** Stream tokens from prompt */
  stream(
    prompt: string,
    options?: GenerateOptions
  ): AsyncGenerator<string, void, unknown>;

  /** Chat with conversation history */
  chat(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): Promise<GenerateResult>;

  /** Get embeddings for text */
  embed(text: string): Promise<Float32Array>;

  /** Get last hidden state (for RLHF) */
  getLastHiddenState(): Float32Array<ArrayBufferLike> | null;

  /** Get engine info */
  getInfo(): EngineInfo;
}

/**
 * RLHF trainer interface
 */
export interface RLHFTrainer {
  /** Initialize trainer */
  initialize(): Promise<void>;

  /** Record feedback for a response */
  recordFeedback(feedback: RLHFFeedback): Promise<void>;

  /** Train on accumulated feedback */
  train(batchSize?: number): Promise<void>;

  /** Get adapter weights */
  getAdapterWeights(): Promise<ArrayBuffer>;

  /** Load adapter weights */
  loadAdapterWeights(weights: ArrayBuffer): Promise<void>;

  /** Sync adapter updates (federated learning) */
  syncUpdates(): Promise<void>;

  /** Enable/disable participation in community aggregation */
  setCommunityParticipation(enabled: boolean): void;

  /** Get training stats */
  getStats(): { examples: number; lastTrained?: string };
}
