/**
 * Edgework SDK Zod Schemas
 *
 * Runtime validation schemas for SDK types.
 */

import { z } from 'zod';

// Model architecture enum
export const ModelArchitectureSchema = z.enum([
  'llama',
  'mistral',
  'qwen',
  'smollm',
  'phi',
]);

// Quantization type enum
export const QuantizationTypeSchema = z.enum([
  'f32',
  'f16',
  'q8_0',
  'q4_k',
  'q4_0',
  'q4_1',
]);

// Model metadata
export const ModelMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  architecture: ModelArchitectureSchema,
  version: z.string(),
  vocabSize: z.number().int().positive(),
  hiddenDim: z.number().int().positive(),
  numLayers: z.number().int().positive(),
  numHeads: z.number().int().positive(),
  numKvHeads: z.number().int().positive().optional(),
  intermediateDim: z.number().int().positive().optional(),
  maxSeqLength: z.number().int().positive(),
  ropeTheta: z.number().positive().optional(),
  createdAt: z.string().datetime(),
});

// Tensor chunk
export const TensorChunkSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  tensorName: z.string(),
  layerIndex: z.number().int().nullable(),
  chunkIndex: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
  dtype: QuantizationTypeSchema,
  shape: z.array(z.number().int().positive()),
  offset: z.number().int().nonnegative(),
  data: z.instanceof(ArrayBuffer),
  hash: z.string(),
});

// Tokenizer data
export const TokenizerDataSchema = z.object({
  modelId: z.string(),
  vocab: z.instanceof(ArrayBuffer),
  merges: z.instanceof(ArrayBuffer).optional(),
  specialTokens: z.record(z.string(), z.number()),
  chatTemplate: z.string().optional(),
});

// Sync progress
export const SyncProgressSchema = z.object({
  modelId: z.string(),
  tensorName: z.string(),
  chunksDownloaded: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
  lastSync: z.string().datetime().optional(),
});

// Adapter type enum
export const AdapterTypeSchema = z.enum([
  'reward_head',
  'style_adapter',
  'lora',
]);

// User adapter
export const UserAdapterSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  userId: z.string(),
  adapterType: AdapterTypeSchema,
  weights: z.instanceof(ArrayBuffer),
  trainingExamples: z.number().int().nonnegative(),
  lastUpdated: z.string().datetime(),
});

// Training log entry
export const TrainingLogEntrySchema = z.object({
  id: z.number().int(),
  adapterId: z.string(),
  messageHash: z.string(),
  feedback: z.number().min(-1).max(1),
  createdAt: z.string().datetime(),
});

// Download status enum
export const DownloadStatusSchema = z.enum([
  'downloading',
  'verifying',
  'ready',
  'error',
]);

// Download progress
export const DownloadProgressSchema = z.object({
  modelId: z.string(),
  percent: z.number().min(0).max(100),
  bytesDownloaded: z.number().int().nonnegative(),
  totalBytes: z.number().int().positive(),
  currentLayer: z.string().optional(),
  layersComplete: z.number().int().nonnegative(),
  totalLayers: z.number().int().positive(),
  status: DownloadStatusSchema,
  error: z.string().optional(),
});

// Storage backend enum
export const StorageBackendSchema = z.enum(['opfs', 'indexeddb', 'memory']);

// Inference backend enum
export const InferenceBackendSchema = z.enum([
  'webgpu',
  'webnn',
  'wasm',
  'cpu',
]);

// Edgework options
export const EdgeworkOptionsSchema = z.object({
  model: z.string(),
  syncUrl: z.string().url().optional(),
  onProgress: z
    .function()
    .args(DownloadProgressSchema)
    .returns(z.void())
    .optional(),
  enableRLHF: z.boolean().optional().default(false),
  enableBuleyean: z.boolean().optional().default(false),
  communityParticipation: z.boolean().optional().default(false),
  federatedSyncUrl: z.string().url().optional(),
  trainingBatchSize: z.number().int().positive().optional().default(16),
  trainingIdleFlushMs: z.number().int().positive().optional().default(45000),
  cacheDir: z.string().optional(),
  userId: z.string().optional(),
  storageBackend: StorageBackendSchema.optional(),
  inferenceBackend: InferenceBackendSchema.optional(),
});

// Generation options
export const GenerateOptionsSchema = z.object({
  maxTokens: z.number().int().positive().max(4096).optional().default(256),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  topP: z.number().min(0).max(1).optional().default(0.9),
  topK: z.number().int().positive().optional().default(40),
  stopSequences: z.array(z.string()).optional(),
  stream: z.boolean().optional().default(false),
});

// Generation result
export const GenerateResultSchema = z.object({
  text: z.string(),
  tokens: z.array(z.number().int()),
  tokenCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  tokensPerSecond: z.number().nonnegative(),
});

// Chat message role enum
export const ChatRoleSchema = z.enum(['system', 'user', 'assistant']);

// Chat message
export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
});

// Chat messages array
export const ChatMessagesSchema = z.array(ChatMessageSchema);

// RLHF feedback
export const RLHFFeedbackSchema = z.object({
  messageHash: z.string(),
  feedback: z.number().min(-1).max(1),
  hiddenState: z.instanceof(Float32Array).optional(),
});

// Model status enum
export const ModelStatusSchema = z.enum([
  'not_downloaded',
  'downloading',
  'ready',
  'offline',
  'error',
]);

// Engine info
export const EngineInfoSchema = z.object({
  modelId: z.string(),
  status: ModelStatusSchema,
  backend: InferenceBackendSchema,
  storageBackend: StorageBackendSchema,
  progress: DownloadProgressSchema.optional(),
  config: ModelMetaSchema,
});

// Layer weights
export const LayerWeightsSchema = z.object({
  layerIndex: z.number().int().nonnegative(),
  attnQ: z.instanceof(Float32Array),
  attnK: z.instanceof(Float32Array),
  attnV: z.instanceof(Float32Array),
  attnOut: z.instanceof(Float32Array),
  attnNorm: z.instanceof(Float32Array),
  ffnGate: z.instanceof(Float32Array),
  ffnUp: z.instanceof(Float32Array),
  ffnDown: z.instanceof(Float32Array),
  ffnNorm: z.instanceof(Float32Array),
});

// KV cache
export const KVCacheSchema = z.object({
  keys: z.array(z.instanceof(Float32Array)),
  values: z.array(z.instanceof(Float32Array)),
  position: z.number().int().nonnegative(),
  maxLength: z.number().int().positive(),
});

// Model config for known models
export const CogModelConfigSchema = z.object({
  id: z.literal('cog-360m'),
  name: z.literal('Cog'),
  architecture: z.literal('smollm'),
  version: z.string(),
  vocabSize: z.literal(49152),
  hiddenDim: z.literal(960),
  numLayers: z.literal(32),
  numHeads: z.literal(15),
  numKvHeads: z.literal(5),
  intermediateDim: z.literal(2560),
  maxSeqLength: z.literal(2048),
  ropeTheta: z.literal(10000),
});

export const CyranoModelConfigSchema = z.object({
  id: z.literal('cyrano-360m'),
  name: z.literal('Cyrano'),
  architecture: z.literal('smollm'),
  version: z.string(),
  vocabSize: z.literal(49152),
  hiddenDim: z.literal(960),
  numLayers: z.literal(32),
  numHeads: z.literal(15),
  numKvHeads: z.literal(5),
  intermediateDim: z.literal(2560),
  maxSeqLength: z.literal(2048),
  ropeTheta: z.literal(10000),
});

// Type exports inferred from schemas
export type ModelArchitecture = z.infer<typeof ModelArchitectureSchema>;
export type QuantizationType = z.infer<typeof QuantizationTypeSchema>;
export type ModelMeta = z.infer<typeof ModelMetaSchema>;
export type TensorChunk = z.infer<typeof TensorChunkSchema>;
export type TokenizerData = z.infer<typeof TokenizerDataSchema>;
export type SyncProgress = z.infer<typeof SyncProgressSchema>;
export type AdapterType = z.infer<typeof AdapterTypeSchema>;
export type UserAdapter = z.infer<typeof UserAdapterSchema>;
export type TrainingLogEntry = z.infer<typeof TrainingLogEntrySchema>;
export type DownloadStatus = z.infer<typeof DownloadStatusSchema>;
export type DownloadProgress = z.infer<typeof DownloadProgressSchema>;
export type StorageBackend = z.infer<typeof StorageBackendSchema>;
export type InferenceBackend = z.infer<typeof InferenceBackendSchema>;
export type EdgeworkOptions = z.infer<typeof EdgeworkOptionsSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;
export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type RLHFFeedback = z.infer<typeof RLHFFeedbackSchema>;
export type ModelStatus = z.infer<typeof ModelStatusSchema>;
export type EngineInfo = z.infer<typeof EngineInfoSchema>;
export type LayerWeights = z.infer<typeof LayerWeightsSchema>;
export type KVCache = z.infer<typeof KVCacheSchema>;

// Validation helpers
export function validateModelMeta(data: unknown): ModelMeta {
  return ModelMetaSchema.parse(data);
}

export function validateGenerateOptions(data: unknown): GenerateOptions {
  return GenerateOptionsSchema.parse(data);
}

export function validateChatMessages(data: unknown): ChatMessage[] {
  return ChatMessagesSchema.parse(data);
}

export function validateEdgeworkOptions(data: unknown): EdgeworkOptions {
  return EdgeworkOptionsSchema.parse(data);
}

export function validateRLHFFeedback(data: unknown): RLHFFeedback {
  return RLHFFeedbackSchema.parse(data);
}

// Safe parse variants that don't throw
export function safeParseModelMeta(data: unknown) {
  return ModelMetaSchema.safeParse(data);
}

export function safeParseGenerateOptions(data: unknown) {
  return GenerateOptionsSchema.safeParse(data);
}

export function safeParseChatMessages(data: unknown) {
  return ChatMessagesSchema.safeParse(data);
}

export function safeParseEdgeworkOptions(data: unknown) {
  return EdgeworkOptionsSchema.safeParse(data);
}

export function safeParseRLHFFeedback(data: unknown) {
  return RLHFFeedbackSchema.safeParse(data);
}
