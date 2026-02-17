/**
 * Edgework SDK
 *
 * Client-side AI inference with D1/Dash storage, WebGPU inference, and on-device RLHF.
 *
 * @example
 * ```typescript
 * import { Edgework } from '@affectively/edgework';
 *
 * // Initialize with a model
 * const ai = await Edgework.init({
 *   model: 'cyrano-360m',
 *   onProgress: (p) => console.log(`${p.percent}% downloaded`)
 * });
 *
 * // Generate text
 * const response = await ai.generate('How are you feeling today?');
 *
 * // Stream responses
 * for await (const token of ai.stream('Tell me a story')) {
 *   process.stdout.write(token);
 * }
 *
 * // Chat with context
 * const reply = await ai.chat([
 *   { role: 'user', content: 'I had a rough day' },
 * ]);
 * ```
 */

// Re-export types (from types.ts only, schemas.ts exports its own versions)
export * from './types';

// Re-export schema validators (not the types, which would conflict)
export {
  // Schemas
  ModelArchitectureSchema,
  QuantizationTypeSchema,
  ModelMetaSchema,
  TensorChunkSchema,
  TokenizerDataSchema,
  SyncProgressSchema,
  AdapterTypeSchema,
  UserAdapterSchema,
  TrainingLogEntrySchema,
  DownloadStatusSchema,
  DownloadProgressSchema,
  StorageBackendSchema,
  InferenceBackendSchema,
  EdgeworkOptionsSchema,
  GenerateOptionsSchema,
  GenerateResultSchema,
  ChatRoleSchema,
  ChatMessageSchema,
  ChatMessagesSchema,
  RLHFFeedbackSchema,
  ModelStatusSchema,
  EngineInfoSchema,
  LayerWeightsSchema,
  KVCacheSchema,
  CogModelConfigSchema,
  CyranoModelConfigSchema,
  // Validators
  validateModelMeta,
  validateGenerateOptions,
  validateChatMessages,
  validateEdgeworkOptions,
  validateRLHFFeedback,
  safeParseModelMeta,
  safeParseGenerateOptions,
  safeParseChatMessages,
  safeParseEdgeworkOptions,
  safeParseRLHFFeedback,
} from './schemas';

// Re-export modules
export {
  OPFSStorage,
  IndexedDBStorage,
  MemoryStorage,
  createStorage,
  detectBestBackend as detectBestStorageBackend,
} from './data/storage';
export type { StorageOptions } from './data/storage';

export {
  WebGPUInference,
  WASMInference,
  createInferenceEngine,
  detectBestBackend as detectBestInferenceBackend,
  Tokenizer,
  loadTokenizer,
} from './compute/inference';
export type { InferenceOptions } from './compute/inference';

export { ModelSync, createModelSync, DEFAULT_SYNC_URLS } from './data/sync';
export type { SyncOptions } from './data/sync';

export { RewardModel, RLHFTrainer, FederatedSync } from './compute/rlhf';

export * as Auth from './auth';

// Export Gateway Client
export * as Gateway from './compute/gateway';

// Export Distributed Inference Client
export * as Distributed from './compute/distributed';

// Export WASM loader
export * as Wasm from './wasm';

export {
  COG_CONFIG,
  CYRANO_CONFIG,
  MODELS,
  getModelConfig,
  getSystemPrompt,
  SYSTEM_PROMPTS,
  MODEL_SYNC_URLS,
} from './models';

// Import for main class
import { createStorage as createStorageInternal } from './data/storage/factory';
import { createInferenceEngine as createInferenceEngineInternal } from './compute/inference/factory';
import { createModelSync as createModelSyncInternal } from './data/sync/factory';
import { RLHFTrainer as RLHFTrainerInternal } from './compute/rlhf/trainer';
import {
  getModelConfig as getModelConfigInternal,
  getSystemPrompt as getSystemPromptInternal,
  MODEL_SYNC_URLS as MODEL_SYNC_URLS_INTERNAL,
} from './models';
import type { BaseStorage } from './data/storage/base-storage';
import type { BaseInference } from './compute/inference/base-inference';
import type { ModelSync as ModelSyncType } from './data/sync/model-sync';
import type {
  EdgeworkOptions,
  GenerateOptions,
  GenerateResult,
  ChatMessage,
  DownloadProgress,
  EngineInfo,
  RLHFFeedback,
} from './types';
import { EdgeworkOptionsSchema } from './schemas';

/**
 * Edgework - Main SDK class
 *
 * Provides a unified interface for client-side AI inference.
 */
export class Edgework {
  private storage: BaseStorage;
  private inference: BaseInference | null = null;
  private sync: ModelSyncType | null = null;
  private rlhfTrainer: RLHFTrainerInternal | null = null;
  private modelId: string;
  private systemPrompt: string;
  private options: EdgeworkOptions;

  private constructor(
    storage: BaseStorage,
    modelId: string,
    options: EdgeworkOptions
  ) {
    this.storage = storage;
    this.modelId = modelId;
    this.options = options;
    this.systemPrompt = getSystemPromptInternal(modelId);
  }

  /**
   * Initialize Edgework with a model
   */
  static async init(options: EdgeworkOptions): Promise<Edgework> {
    // Validate options
    const validated = EdgeworkOptionsSchema.parse(options);

    // Create storage
    const storage = await createStorageInternal({
      backend: validated.storageBackend,
    });

    const edgework = new Edgework(storage, validated.model, validated);

    // Check if model needs to be downloaded
    const isComplete = await storage.isModelComplete(validated.model);

    if (!isComplete) {
      // Start sync
      const syncUrl =
        validated.syncUrl ??
        MODEL_SYNC_URLS_INTERNAL[
          validated.model as keyof typeof MODEL_SYNC_URLS_INTERNAL
        ] ??
        'https://models.affectively.ai';

      edgework.sync = createModelSyncInternal(storage, {
        syncUrl,
        onProgress: validated.onProgress,
      });

      // Register model metadata if not present
      const meta = await storage.getModelMeta(validated.model);
      if (!meta) {
        const config = getModelConfigInternal(validated.model);
        if (config) {
          await storage.setModelMeta(config);
        }
      }

      // Start download
      await edgework.sync.startSync(validated.model);
    }

    // Initialize inference engine
    edgework.inference = await createInferenceEngineInternal(
      storage,
      validated.model,
      {
        backend: validated.inferenceBackend,
      }
    );

    // Initialize RLHF if enabled
    if (validated.enableRLHF) {
      const config = getModelConfigInternal(validated.model);
      if (config) {
        edgework.rlhfTrainer = new RLHFTrainerInternal({
          storage,
          modelId: validated.model,
          userId: validated.userId ?? edgework.generateDeviceId(),
          hiddenDim: config.hiddenDim,
        });
        await edgework.rlhfTrainer.initialize();
      }
    }

    return edgework;
  }

  /**
   * Get an existing Edgework instance (assumes model is already downloaded)
   */
  static async get(modelId: string): Promise<Edgework> {
    const storage = await createStorageInternal();
    const edgework = new Edgework(storage, modelId, { model: modelId });

    // Initialize inference engine
    edgework.inference = await createInferenceEngineInternal(storage, modelId);

    return edgework;
  }

  /**
   * Generate text from a prompt
   */
  async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    if (!this.inference) {
      throw new Error('Inference engine not initialized');
    }

    // Prepend system prompt
    const fullPrompt = this.systemPrompt
      ? `${this.systemPrompt}\n\nUser: ${prompt}\nAssistant:`
      : prompt;

    return this.inference.generate(fullPrompt, options);
  }

  /**
   * Stream tokens from a prompt
   */
  async *stream(
    prompt: string,
    options: GenerateOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.inference) {
      throw new Error('Inference engine not initialized');
    }

    const fullPrompt = this.systemPrompt
      ? `${this.systemPrompt}\n\nUser: ${prompt}\nAssistant:`
      : prompt;

    yield* this.inference.stream(fullPrompt, options);
  }

  /**
   * Chat with conversation history
   */
  async chat(
    messages: ChatMessage[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    if (!this.inference) {
      throw new Error('Inference engine not initialized');
    }

    // Add system message if not present
    const fullMessages: ChatMessage[] =
      messages[0]?.role === 'system'
        ? messages
        : [{ role: 'system', content: this.systemPrompt }, ...messages];

    return this.inference.chat(fullMessages, options);
  }

  /**
   * Get embeddings for text
   */
  async embed(text: string): Promise<Float32Array> {
    if (!this.inference) {
      throw new Error('Inference engine not initialized');
    }
    return this.inference.embed(text);
  }

  /**
   * Provide feedback for RLHF (thumbs up/down)
   */
  async feedback(
    messageHash: string,
    rating: 'positive' | 'negative'
  ): Promise<void> {
    if (!this.rlhfTrainer) {
      throw new Error('RLHF not enabled');
    }

    const hiddenState = this.inference?.getLastHiddenState();
    const feedback: RLHFFeedback = {
      messageHash,
      feedback: rating === 'positive' ? 1.0 : -1.0,
      hiddenState: hiddenState ?? undefined,
    };

    await this.rlhfTrainer.recordFeedback(feedback);
  }

  /**
   * Get model status and info
   */
  get status(): EngineInfo | null {
    return this.inference?.getInfo() ?? null;
  }

  /**
   * Get download progress
   */
  get progress(): DownloadProgress | null {
    return this.sync?.getProgress() ?? null;
  }

  /**
   * Check if model is ready for inference
   */
  get isReady(): boolean {
    return this.inference?.getInfo().status === 'ready';
  }

  /**
   * Get RLHF training stats
   */
  get rlhfStats(): { examples: number; lastTrained?: string } | null {
    return this.rlhfTrainer?.getStats() ?? null;
  }

  /**
   * Generate a unique device ID for RLHF
   */
  private generateDeviceId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// Default export
export default Edgework;
