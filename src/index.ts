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

// Buleyean RL -- on-device rejection-based training (God Formula)
export { BuleyeanTrainer } from './compute/buleyean';
export type { BuleyeanTrainerConfig } from './compute/buleyean';
export * as Buleyean from './compute/buleyean';

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
import { BuleyeanTrainer as BuleyeanTrainerInternal } from './compute/buleyean/trainer';
import { FederatedSync } from './compute/rlhf/federated-sync';
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
  Modality,
  ModalityInferenceResult,
  InferenceError,
  ModalityTrainingSignal,
  TrainingFlushResult,
} from './types';
import { EdgeworkOptionsSchema } from './schemas';

/**
 * Edgework - Main SDK class
 *
 * Provides a unified interface for client-side AI inference.
 */
export class Edgework {
  private static readonly DEFAULT_TRAINING_BATCH_SIZE = 16;
  private static readonly DEFAULT_TRAINING_IDLE_FLUSH_MS = 45_000;

  private storage: BaseStorage;
  private inference: BaseInference | null = null;
  private sync: ModelSyncType | null = null;
  private rlhfTrainer: RLHFTrainerInternal | null = null;
  private buleyeanTrainer: BuleyeanTrainerInternal | null = null;
  private modalityTrainers = new Map<Modality, RLHFTrainerInternal>();
  private pendingSignals = new Map<Modality, ModalityTrainingSignal[]>();
  private communityParticipation = false;
  private idleFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private trainingBatchSize: number;
  private trainingIdleFlushMs: number;
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
    this.trainingBatchSize =
      options.trainingBatchSize ?? Edgework.DEFAULT_TRAINING_BATCH_SIZE;
    this.trainingIdleFlushMs =
      options.trainingIdleFlushMs ?? Edgework.DEFAULT_TRAINING_IDLE_FLUSH_MS;
    this.communityParticipation = options.communityParticipation ?? false;
    this.systemPrompt = getSystemPromptInternal(modelId);
  }

  /**
   * Initialize Edgework with a model
   */
  static async init(options: EdgeworkOptions): Promise<Edgework> {
    // Validate options
    const parsedOptions = EdgeworkOptionsSchema.parse(options);
    if (!parsedOptions.model) {
      throw new Error('Model is required');
    }
    const validated: EdgeworkOptions = {
      ...parsedOptions,
      model: parsedOptions.model,
    };

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
        const deviceId = validated.userId ?? edgework.generateDeviceId();
        const federatedSync = validated.federatedSyncUrl
          ? new FederatedSync({
              hubUrl: validated.federatedSyncUrl,
              modelId: validated.model,
              deviceId,
            })
          : undefined;

        edgework.rlhfTrainer = new RLHFTrainerInternal({
          storage,
          modelId: validated.model,
          userId: deviceId,
          hiddenDim: config.hiddenDim,
          modality: 'text',
          batchSize: edgework.trainingBatchSize,
          communityParticipation: edgework.communityParticipation,
          federatedSync,
        });
        await edgework.rlhfTrainer.initialize();
        edgework.modalityTrainers.set('text', edgework.rlhfTrainer);
      }
    }

    // Initialize Buleyean RL if enabled (rejection-based, no reward model)
    if (validated.enableBuleyean && !validated.enableRLHF) {
      const config = getModelConfigInternal(validated.model);
      if (config) {
        const deviceId = validated.userId ?? edgework.generateDeviceId();

        const buleyeanTrainer = new BuleyeanTrainerInternal({
          storage,
          modelId: validated.model,
          userId: deviceId,
          vocabSize: config.vocabSize,
          modality: 'text',
          batchSize: edgework.trainingBatchSize,
          communityParticipation: edgework.communityParticipation,
          privateDataDimensions: validated.privateDataDimensions,
        });
        await buleyeanTrainer.initialize();

        // Wrap BuleyeanTrainer to match RLHFTrainer interface for the Edgework class
        const wrappedTrainer = new RLHFTrainerInternal({
          storage,
          modelId: validated.model,
          userId: deviceId,
          hiddenDim: config.hiddenDim,
          modality: 'text',
          batchSize: edgework.trainingBatchSize,
          communityParticipation: edgework.communityParticipation,
        });
        // Store the buleyean trainer on the instance for direct access
        edgework.buleyeanTrainer = buleyeanTrainer;
        edgework.rlhfTrainer = wrappedTrainer;
        await wrappedTrainer.initialize();
        edgework.modalityTrainers.set('text', wrappedTrainer);
      }
    }

    edgework.bindSessionFlushHooks();
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
   * Provide feedback for RLHF (thumbs up/down).
   * Routes through BuleyeanTrainer when Buleyean mode is active.
   */
  async feedback(
    messageHash: string,
    rating: 'positive' | 'negative'
  ): Promise<void> {
    const hiddenState = this.inference?.getLastHiddenState();
    const feedbackValue = rating === 'positive' ? 1.0 : -1.0;
    const feedbackObj: RLHFFeedback = {
      messageHash,
      feedback: feedbackValue,
      hiddenState: hiddenState ?? undefined,
    };

    // Route through Buleyean trainer if active
    if (this.buleyeanTrainer) {
      await this.buleyeanTrainer.recordFeedback(feedbackObj);
      return;
    }

    if (!this.rlhfTrainer) {
      throw new Error('RLHF not enabled');
    }

    await this.rlhfTrainer.recordFeedback(feedbackObj);
  }

  /**
   * Unified modality inference API.
   */
  async infer(
    modality: Modality,
    input: unknown,
    options: GenerateOptions = {}
  ): Promise<ModalityInferenceResult | InferenceError> {
    const startedAt = Date.now();
    try {
      if (!this.inference) {
        return this.createInferenceError(
          modality,
          'MODEL_NOT_READY',
          'Inference engine not initialized',
          5_000
        );
      }

      if (modality === 'text') {
        if (typeof input !== 'string' || input.trim().length === 0) {
          return this.createInferenceError(
            modality,
            'MODEL_UNAVAILABLE',
            'Text modality requires a non-empty string input'
          );
        }

        const result = await this.generate(input, options);
        return {
          modality,
          modelId: this.modelId,
          modelVersion: 'local-v1',
          output: {
            text: result.text,
            tokenCount: result.tokenCount,
            tokensPerSecond: result.tokensPerSecond,
          },
          durationMs: result.durationMs,
        };
      }

      if (modality === 'embeddings') {
        if (typeof input !== 'string' || input.trim().length === 0) {
          return this.createInferenceError(
            modality,
            'MODEL_UNAVAILABLE',
            'Embeddings modality requires a non-empty string input'
          );
        }

        const embedding = await this.embed(input);
        return {
          modality,
          modelId: this.modelId,
          modelVersion: 'local-v1',
          output: Array.from(embedding),
          durationMs: Date.now() - startedAt,
        };
      }

      return this.createInferenceError(
        modality,
        'MODEL_NOT_READY',
        `${modality} modality is not yet available in this SDK build`,
        30_000
      );
    } catch (error) {
      return this.createInferenceError(
        modality,
        'MODEL_UNAVAILABLE',
        error instanceof Error ? error.message : 'Unknown inference error'
      );
    }
  }

  /**
   * Record a modality-specific training signal for micro-batch training.
   */
  async recordSignal(
    modality: Modality,
    signal: ModalityTrainingSignal
  ): Promise<void> {
    const queue = this.pendingSignals.get(modality) ?? [];
    queue.push(signal);
    this.pendingSignals.set(modality, queue);

    if (queue.length >= this.trainingBatchSize) {
      await this.flushTraining(modality);
      return;
    }

    this.scheduleIdleFlush();
  }

  /**
   * Flush pending local training for one modality or all modalities.
   */
  async flushTraining(modality?: Modality): Promise<TrainingFlushResult> {
    const targetModalities: Modality[] = modality
      ? [modality]
      : ([
          'text',
          'stt',
          'tts',
          'translation',
          'embeddings',
          'classification',
          'image',
        ] as Modality[]);
    const startedAt = new Date().toISOString();
    let trainedExamples = 0;
    let pendingExamples = 0;
    let communitySyncAttempted = false;
    let communitySyncApplied = false;

    for (const target of targetModalities) {
      const trainer = this.modalityTrainers.get(target);
      const signals = this.pendingSignals.get(target) ?? [];
      if (!trainer || signals.length === 0) {
        pendingExamples += signals.length;
        continue;
      }

      const before = trainer.getStats().examples;

      for (const signal of signals) {
        const hiddenState =
          signal.hiddenState ??
          this.inference?.getLastHiddenState() ??
          undefined;
        if (!hiddenState) {
          continue;
        }

        const feedbackValue =
          typeof signal.feedback === 'number' ? signal.feedback : 1;
        const feedback: RLHFFeedback = {
          messageHash:
            signal.messageHash ||
            `${target}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 10)}`,
          feedback: Math.max(-1, Math.min(1, feedbackValue)),
          hiddenState,
        };
        await trainer.recordFeedback(feedback);
      }

      await trainer.train();
      this.pendingSignals.set(target, []);

      if (this.communityParticipation) {
        communitySyncAttempted = true;
        await trainer.syncUpdates();
        communitySyncApplied = true;
      }

      const after = trainer.getStats().examples;
      trainedExamples += Math.max(0, after - before);
    }

    this.clearIdleFlushTimer();

    return {
      modality: modality ?? 'all',
      trainedExamples,
      pendingExamples,
      communitySyncAttempted,
      communitySyncApplied,
      flushedAt: startedAt,
    };
  }

  /**
   * Enable or disable community update sharing.
   */
  async setCommunityParticipation(enabled: boolean): Promise<void> {
    this.communityParticipation = enabled;
    for (const trainer of this.modalityTrainers.values()) {
      trainer.setCommunityParticipation(enabled);
    }
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
   * Access the Buleyean trainer for rejection-based RL.
   * Available when initialized with enableBuleyean: true.
   */
  get buleyean(): BuleyeanTrainerInternal | null {
    return this.buleyeanTrainer;
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

  private scheduleIdleFlush(): void {
    if (this.idleFlushTimer) {
      return;
    }
    this.idleFlushTimer = setTimeout(() => {
      this.idleFlushTimer = null;
      void this.flushTraining();
    }, this.trainingIdleFlushMs);
  }

  private clearIdleFlushTimer(): void {
    if (!this.idleFlushTimer) {
      return;
    }
    clearTimeout(this.idleFlushTimer);
    this.idleFlushTimer = null;
  }

  private bindSessionFlushHooks(): void {
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      window.addEventListener('beforeunload', () => {
        void this.flushTraining();
      });
    }

    const runtime = globalThis as {
      process?: { on?: (event: string, cb: () => void) => void };
    };
    if (runtime.process && typeof runtime.process.on === 'function') {
      runtime.process.on('beforeExit', () => {
        void this.flushTraining();
      });
    }
  }

  private createInferenceError(
    modality: Modality,
    code: InferenceError['code'],
    message: string,
    retryAfterMs?: number
  ): InferenceError {
    return {
      code,
      message,
      modality,
      modelId: this.modelId,
      modelVersion: 'local-v1',
      retryAfterMs,
    };
  }
}

// Default export
export default Edgework;
