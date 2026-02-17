/**
 * Base Inference Engine
 *
 * Abstract implementation for inference backends.
 */

import type {
  GenerateOptions,
  GenerateResult,
  ChatMessage,
  ModelMeta,
  InferenceBackend,
  ModelStatus,
  EngineInfo,
  StorageBackend,
} from '../../types';
import type { BaseStorage } from '../../data/storage/base-storage';
import { Tokenizer, loadTokenizer } from './tokenizer';

export abstract class BaseInference {
  abstract readonly backend: InferenceBackend;
  protected storage: BaseStorage;
  protected modelId: string;
  protected config: ModelMeta | null = null;
  protected tokenizer: Tokenizer | null = null;
  protected status: ModelStatus = 'not_downloaded';
  protected lastHiddenState: Float32Array<ArrayBufferLike> | null = null;

  constructor(storage: BaseStorage, modelId: string) {
    this.storage = storage;
    this.modelId = modelId;
  }

  /**
   * Initialize the inference engine
   */
  async initialize(): Promise<void> {
    // Load model config
    this.config = await this.storage.getModelMeta(this.modelId);
    if (!this.config) {
      throw new Error(`Model ${this.modelId} not found in storage`);
    }

    // Check if model is complete
    const isComplete = await this.storage.isModelComplete(this.modelId);
    if (!isComplete) {
      this.status = 'downloading';
      throw new Error(`Model ${this.modelId} is not fully downloaded`);
    }

    // Load tokenizer
    this.tokenizer = await loadTokenizer(this.storage, this.modelId);
    if (!this.tokenizer) {
      throw new Error(`Tokenizer for ${this.modelId} not found`);
    }

    // Initialize backend-specific resources
    await this.initializeBackend();

    this.status = 'ready';
  }

  /**
   * Initialize backend-specific resources (WebGPU, WASM, etc.)
   */
  protected abstract initializeBackend(): Promise<void>;

  /**
   * Run forward pass on input tokens
   */
  protected abstract forward(
    inputIds: number[],
    position: number
  ): Promise<Float32Array>;

  /**
   * Generate text from a prompt
   */
  async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    if (this.status !== 'ready' || !this.tokenizer) {
      throw new Error('Engine not ready');
    }

    const {
      maxTokens = 256,
      temperature = 0.7,
      topP = 0.9,
      topK = 40,
      stopSequences = [],
    } = options;

    const startTime = performance.now();
    const inputIds = this.tokenizer.encode(prompt);
    const generatedIds: number[] = [];

    // Autoregressive generation
    for (let i = 0; i < maxTokens; i++) {
      const position = inputIds.length + generatedIds.length - 1;
      const logits = await this.forward(
        [...inputIds, ...generatedIds],
        position
      );

      // Sample next token
      const nextToken = this.sample(logits, temperature, topP, topK);
      generatedIds.push(nextToken);

      // Check for EOS
      if (nextToken === this.tokenizer.eosId) {
        break;
      }

      // Check for stop sequences
      const currentText = this.tokenizer.decode(generatedIds);
      if (stopSequences.some((seq) => currentText.includes(seq))) {
        break;
      }
    }

    const durationMs = performance.now() - startTime;
    const text = this.tokenizer.decode(generatedIds);

    return {
      text,
      tokens: generatedIds,
      tokenCount: generatedIds.length,
      durationMs,
      tokensPerSecond: (generatedIds.length / durationMs) * 1000,
    };
  }

  /**
   * Stream tokens from a prompt
   */
  async *stream(
    prompt: string,
    options: GenerateOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (this.status !== 'ready' || !this.tokenizer) {
      throw new Error('Engine not ready');
    }

    const {
      maxTokens = 256,
      temperature = 0.7,
      topP = 0.9,
      topK = 40,
      stopSequences = [],
    } = options;

    const inputIds = this.tokenizer.encode(prompt);
    const generatedIds: number[] = [];
    let previousText = '';

    for (let i = 0; i < maxTokens; i++) {
      const position = inputIds.length + generatedIds.length - 1;
      const logits = await this.forward(
        [...inputIds, ...generatedIds],
        position
      );

      const nextToken = this.sample(logits, temperature, topP, topK);
      generatedIds.push(nextToken);

      // Decode and yield new text
      const currentText = this.tokenizer.decode(generatedIds);
      const newText = currentText.slice(previousText.length);
      previousText = currentText;

      if (newText) {
        yield newText;
      }

      // Check for EOS
      if (nextToken === this.tokenizer.eosId) {
        break;
      }

      // Check for stop sequences
      if (stopSequences.some((seq) => currentText.includes(seq))) {
        break;
      }
    }
  }

  /**
   * Chat with conversation history
   */
  async chat(
    messages: ChatMessage[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    if (!this.tokenizer) {
      throw new Error('Tokenizer not loaded');
    }
    const prompt = this.tokenizer.formatChat(messages, true);
    return this.generate(prompt, options);
  }

  /**
   * Get embeddings for text
   */
  async embed(text: string): Promise<Float32Array> {
    if (this.status !== 'ready' || !this.tokenizer) {
      throw new Error('Engine not ready');
    }

    const inputIds = this.tokenizer.encode(text);
    const hiddenState = await this.forward(inputIds, inputIds.length - 1);

    // Return mean pooled embeddings
    const numElements = hiddenState.length;
    const embedding = new Float32Array(numElements);
    for (let i = 0; i < numElements; i++) {
      embedding[i] = hiddenState[i];
    }

    return embedding;
  }

  /**
   * Get last hidden state (for RLHF)
   */
  getLastHiddenState(): Float32Array<ArrayBufferLike> | null {
    return this.lastHiddenState;
  }

  /**
   * Get engine info
   */
  getInfo(): EngineInfo {
    return {
      modelId: this.modelId,
      status: this.status,
      backend: this.backend,
      storageBackend: this.storage.backend,
      config: this.config!,
    };
  }

  /**
   * Sample from logits
   */
  protected sample(
    logits: Float32Array,
    temperature: number,
    topP: number,
    topK: number
  ): number {
    // Apply temperature
    if (temperature !== 1.0) {
      for (let i = 0; i < logits.length; i++) {
        logits[i] /= temperature;
      }
    }

    // Convert to probabilities
    const maxLogit = Math.max(...logits);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      logits[i] = Math.exp(logits[i] - maxLogit);
      sum += logits[i];
    }
    for (let i = 0; i < logits.length; i++) {
      logits[i] /= sum;
    }

    // Top-K filtering
    const indices = Array.from({ length: logits.length }, (_, i) => i);
    indices.sort((a, b) => logits[b] - logits[a]);

    const topKIndices = indices.slice(0, topK);
    const topKProbs = new Float32Array(topK);
    for (let i = 0; i < topK; i++) {
      topKProbs[i] = logits[topKIndices[i]];
    }

    // Top-P filtering
    let cumSum = 0;
    let cutoff = topK;
    for (let i = 0; i < topK; i++) {
      cumSum += topKProbs[i];
      if (cumSum >= topP) {
        cutoff = i + 1;
        break;
      }
    }

    // Renormalize
    const finalIndices = topKIndices.slice(0, cutoff);
    const finalProbs = new Float32Array(cutoff);
    let finalSum = 0;
    for (let i = 0; i < cutoff; i++) {
      finalProbs[i] = logits[finalIndices[i]];
      finalSum += finalProbs[i];
    }
    for (let i = 0; i < cutoff; i++) {
      finalProbs[i] /= finalSum;
    }

    // Sample
    const r = Math.random();
    cumSum = 0;
    for (let i = 0; i < cutoff; i++) {
      cumSum += finalProbs[i];
      if (r <= cumSum) {
        return finalIndices[i];
      }
    }

    return finalIndices[0];
  }
}
