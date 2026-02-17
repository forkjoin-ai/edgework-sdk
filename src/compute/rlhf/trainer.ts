/**
 * RLHF Trainer
 *
 * Manages on-device training from user feedback.
 */

import type { BaseStorage } from '../../data/storage/base-storage';
import type { RLHFFeedback, UserAdapter, TrainingLogEntry } from '../../types';
import { RewardModel } from './reward-model';

export interface RLHFTrainerConfig {
  storage: BaseStorage;
  modelId: string;
  userId: string;
  hiddenDim: number;
  learningRate?: number;
  batchSize?: number;
}

export class RLHFTrainer {
  private storage: BaseStorage;
  private modelId: string;
  private userId: string;
  private rewardModel: RewardModel;
  private batchSize: number;
  private adapterId: string;
  private pendingFeedback: RLHFFeedback[] = [];
  private trainingExamples = 0;
  private lastTrained?: string;

  constructor(config: RLHFTrainerConfig) {
    this.storage = config.storage;
    this.modelId = config.modelId;
    this.userId = config.userId;
    this.batchSize = config.batchSize ?? 8;
    this.adapterId = `${config.modelId}:${config.userId}:reward`;

    this.rewardModel = new RewardModel({
      inputDim: config.hiddenDim,
      learningRate: config.learningRate ?? 0.001,
    });
  }

  /**
   * Initialize trainer and load existing adapter if available
   */
  async initialize(): Promise<void> {
    const adapter = await this.storage.getUserAdapter(
      this.modelId,
      this.userId
    );
    if (adapter) {
      this.rewardModel.loadWeights(adapter.weights);
      this.trainingExamples = adapter.trainingExamples;
      this.lastTrained = adapter.lastUpdated;
    }
  }

  /**
   * Record feedback for a response
   */
  async recordFeedback(feedback: RLHFFeedback): Promise<void> {
    if (!feedback.hiddenState) {
      throw new Error('Hidden state required for RLHF feedback');
    }

    // Add to pending feedback
    this.pendingFeedback.push(feedback);

    // Log the feedback
    await this.storage.addTrainingLogEntry({
      adapterId: this.adapterId,
      messageHash: feedback.messageHash,
      feedback: feedback.feedback,
      createdAt: new Date().toISOString(),
    });

    // Auto-train when batch is full
    if (this.pendingFeedback.length >= this.batchSize) {
      await this.train();
    }
  }

  /**
   * Train on accumulated feedback
   */
  async train(batchSize?: number): Promise<void> {
    const batch = this.pendingFeedback.splice(
      0,
      batchSize ?? this.pendingFeedback.length
    );
    if (batch.length === 0) return;

    // Backward pass for each example
    for (const feedback of batch) {
      if (feedback.hiddenState) {
        this.rewardModel.backward(feedback.hiddenState, feedback.feedback);
      }
    }

    // Apply gradients
    this.rewardModel.applyGradients();
    this.trainingExamples += batch.length;
    this.lastTrained = new Date().toISOString();

    // Save updated adapter
    await this.saveAdapter();
  }

  /**
   * Predict reward for a hidden state
   */
  predict(hiddenState: Float32Array): number {
    return this.rewardModel.forward(hiddenState);
  }

  /**
   * Get adapter weights for sync
   */
  async getAdapterWeights(): Promise<ArrayBuffer> {
    return this.rewardModel.getWeights();
  }

  /**
   * Load adapter weights
   */
  async loadAdapterWeights(weights: ArrayBuffer): Promise<void> {
    this.rewardModel.loadWeights(weights);
    await this.saveAdapter();
  }

  /**
   * Get gradient update for federated learning
   */
  getGradientUpdate(): ArrayBuffer {
    return this.rewardModel.getGradientUpdate();
  }

  /**
   * Apply gradient update from federated learning
   */
  async applyGradientUpdate(update: ArrayBuffer): Promise<void> {
    this.rewardModel.applyGradientUpdate(update);
    await this.saveAdapter();
  }

  /**
   * Get training statistics
   */
  getStats(): { examples: number; lastTrained?: string } {
    return {
      examples: this.trainingExamples,
      lastTrained: this.lastTrained,
    };
  }

  /**
   * Save adapter to storage
   */
  private async saveAdapter(): Promise<void> {
    const adapter: UserAdapter = {
      id: this.adapterId,
      modelId: this.modelId,
      userId: this.userId,
      adapterType: 'reward_head',
      weights: this.rewardModel.getWeights(),
      trainingExamples: this.trainingExamples,
      lastUpdated: new Date().toISOString(),
    };
    await this.storage.setUserAdapter(adapter);
  }

  /**
   * Sync adapter updates with server (federated learning)
   */
  async syncUpdates(): Promise<void> {
    // This would connect to a federated learning hub
    // NOTE(liquidated): For now, just save locally
    await this.saveAdapter();
  }
}
