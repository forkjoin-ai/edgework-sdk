/**
 * BuleyeanTrainer -- On-device rejection-based RL
 *
 * Replaces the reward model approach with the God Formula:
 *   w_i = R - min(v_i, R) + 1
 *
 * No reward model. No chosen examples. Negative feedback records rejections.
 * The complement distribution IS the training target.
 *
 * Integrates with edgework storage for persistence and statistical
 * teleportation for privacy-preserving federated sync.
 */

import type { BaseStorage } from '../../data/storage/base-storage';
import type {
  RLHFFeedback,
  UserAdapter,
  Modality,
} from '../../types';
import {
  computeDeficit,
  buildTeleportationDeficit,
  checkTeleportationFeasibility,
  type BuleyeanSpace,
} from '../rlhf/statistical-teleportation';
import type {
  RejectionRecord,
  TokenVoidBoundary,
  BuleyeanTrainingConfig,
  BuleyeanMetrics,
} from './types';
import { DEFAULT_CONFIG } from './types';
import { buildTokenVoidBoundaries, computeComplementDistribution } from './target';
import type { Tokenizer } from './target';
import {
  sparseEntropy,
  inverseBuleMetric,
  rejectionCoverage,
  teleportationDeficit,
  aggregateMetrics,
} from './metrics';
import { buleyeanKLLoss, contrastLoss } from './training';
import type { PersonalityProfile } from './personality';
import {
  deriveTrainingParams,
  personalityWeightedComplement,
  createPersonalityStack,
  propagateRejection,
  BALANCED_PROFILE,
} from './personality';

export interface BuleyeanTrainerConfig {
  storage: BaseStorage;
  modelId: string;
  userId: string;
  vocabSize: number;
  modality?: Modality;
  batchSize?: number;
  communityParticipation?: boolean;
  trainingConfig?: Partial<BuleyeanTrainingConfig>;
  personality?: PersonalityProfile;
  federatedSyncUrl?: string;
  privateDataDimensions?: number;
}

/**
 * Serializable rejection state for persistence.
 */
interface RejectionState {
  /** Per-token rejection counts (serialized as [tokenId, count] pairs) */
  rejections: [number, number][];
  /** Total rejection rounds */
  totalRounds: number;
  /** Per-position void boundaries (serialized) */
  positionBoundaries: Array<{
    position: number;
    rejections: [number, number][];
    totalRejections: number;
  }>;
}

/**
 * BuleyeanTrainer -- on-device RL from rejection alone.
 *
 * Usage:
 *   const trainer = new BuleyeanTrainer({ storage, modelId, userId, vocabSize });
 *   await trainer.initialize();
 *
 *   // Record negative feedback as rejection
 *   await trainer.recordFeedback({ messageHash: '...', feedback: -1.0, hiddenState });
 *
 *   // Get complement distribution for inference modulation
 *   const complement = trainer.getComplementDistribution(position);
 *
 *   // Federated sync via statistical teleportation
 *   const deficit = trainer.getBuleDeficit();
 */
export class BuleyeanTrainer {
  private storage: BaseStorage;
  private modelId: string;
  private userId: string;
  private modality: Modality;
  private vocabSize: number;
  private batchSize: number;
  private adapterId: string;
  private communityParticipation: boolean;
  private config: BuleyeanTrainingConfig;
  private personality: PersonalityProfile;
  private privateDataDimensions: number;

  // Rejection state (the void boundary)
  private globalRejections = new Map<number, number>();
  private totalRounds = 0;
  private positionBoundaries: TokenVoidBoundary[] = [];

  // Pending feedback queue
  private pendingFeedback: RLHFFeedback[] = [];
  private trainingExamples = 0;
  private lastTrained?: string;

  // Personality stack (optional seven-layer temporal model)
  private personalityStack;

  constructor(cfg: BuleyeanTrainerConfig) {
    this.storage = cfg.storage;
    this.modelId = cfg.modelId;
    this.userId = cfg.userId;
    this.modality = cfg.modality ?? 'text';
    this.vocabSize = cfg.vocabSize;
    this.batchSize = cfg.batchSize ?? 8;
    this.communityParticipation = cfg.communityParticipation ?? false;
    this.config = { ...DEFAULT_CONFIG, ...cfg.trainingConfig };
    this.personality = cfg.personality ?? BALANCED_PROFILE;
    this.privateDataDimensions = cfg.privateDataDimensions ?? this.vocabSize;
    this.adapterId = `${cfg.modelId}:${cfg.userId}:${this.modality}:buleyean`;
    this.personalityStack = createPersonalityStack(this.personality);
  }

  /**
   * Initialize -- load existing rejection state from storage.
   */
  async initialize(): Promise<void> {
    const adapter = await this.storage.getUserAdapter(
      this.modelId,
      this.userId,
      this.adapterId
    );
    if (adapter) {
      this.deserializeState(adapter.weights);
      this.trainingExamples = adapter.trainingExamples;
      this.lastTrained = adapter.lastUpdated;
    }
  }

  /**
   * Record feedback. Negative feedback (-1) records a rejection.
   * Positive feedback (+1) is a no-op (the absence of rejection IS the signal).
   */
  async recordFeedback(feedback: RLHFFeedback): Promise<void> {
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
   * Process accumulated feedback into rejection records.
   *
   * Negative feedback: the hidden state tokens become rejection records.
   * The God Formula derives the complement distribution from rejections alone.
   */
  async train(batchSize?: number): Promise<void> {
    const batch = this.pendingFeedback.splice(
      0,
      batchSize ?? this.pendingFeedback.length
    );
    if (batch.length === 0) return;

    for (const feedback of batch) {
      if (feedback.feedback >= 0) continue; // Only rejections matter

      if (feedback.hiddenState) {
        // Record rejection: the hidden state encodes which tokens were generated.
        // We treat the top activations as the rejected token candidates.
        const rejectedTokens = this.extractTopTokens(feedback.hiddenState);
        const rejectionStrength = Math.abs(feedback.feedback);

        for (const tokenId of rejectedTokens) {
          const count = Math.ceil(rejectionStrength * 10); // Scale to integer
          const prev = this.globalRejections.get(tokenId) ?? 0;
          this.globalRejections.set(tokenId, prev + count);
          this.totalRounds += count;

          // Propagate through personality stack
          propagateRejection(this.personalityStack, tokenId, count);
        }
      }
    }

    this.trainingExamples += batch.length;
    this.lastTrained = new Date().toISOString();

    // Recompute complement distributions
    this.recomputeComplement();

    // Persist
    await this.saveAdapter();
  }

  /**
   * Get the complement distribution at a given position.
   * This is the training target -- what the model should move toward.
   */
  getComplementDistribution(position?: number): Map<number, number> {
    if (
      position !== undefined &&
      position < this.positionBoundaries.length
    ) {
      const params = deriveTrainingParams(this.personality);
      return personalityWeightedComplement(
        this.positionBoundaries[position].rejections,
        this.positionBoundaries[position].totalRejections,
        this.vocabSize,
        params
      );
    }

    // Global complement distribution
    return computeComplementDistribution(
      {
        position: 0,
        rejections: this.globalRejections,
        totalRejections: this.totalRounds,
      },
      this.vocabSize,
      this.config
    );
  }

  /**
   * Get the Bule deficit -- a single integer for statistical teleportation.
   * Encodes the entire future convergence trajectory.
   */
  getBuleDeficit(): number {
    return teleportationDeficit({
      position: 0,
      rejections: this.globalRejections,
      totalRejections: this.totalRounds,
    });
  }

  /**
   * Get current metrics.
   */
  getMetrics(): BuleyeanMetrics {
    const dist = this.getComplementDistribution();
    const boundary: TokenVoidBoundary = {
      position: 0,
      rejections: this.globalRejections,
      totalRejections: this.totalRounds,
    };

    return {
      buleEntropy: sparseEntropy(dist, this.vocabSize),
      inverseBule: inverseBuleMetric(dist, this.vocabSize, this.totalRounds),
      rejectionCoverage: rejectionCoverage(boundary, this.vocabSize),
      buleyeanKL: 0,
      contrastLoss: 0,
    };
  }

  /**
   * Build a teleportation deficit payload for federated sync.
   * Sends one integer instead of full gradient buffers.
   */
  buildTeleportationPayload() {
    const space: BuleyeanSpace = {
      choices: this.vocabSize,
      rejections: this.globalRejections.size,
    };

    return buildTeleportationDeficit(
      space,
      this.modelId,
      this.userId,
      this.modality,
      this.totalRounds
    );
  }

  /**
   * Check if teleportation is feasible (privacy-preserving).
   */
  checkTeleportationFeasibility() {
    const space: BuleyeanSpace = {
      choices: this.vocabSize,
      rejections: this.globalRejections.size,
    };

    // Gradient channels: number of non-zero rejection entries
    const gradientChannels = this.globalRejections.size;

    return checkTeleportationFeasibility(
      space,
      gradientChannels,
      this.privateDataDimensions
    );
  }

  /**
   * Predict reward for a hidden state using complement distribution.
   * Returns [-1, 1]: negative = rejected tokens dominate,
   * positive = unexplored/accepted tokens dominate.
   */
  predict(hiddenState: Float32Array): number {
    const topTokens = this.extractTopTokens(hiddenState);
    if (topTokens.length === 0) return 0;

    let rejectedCount = 0;
    for (const tokenId of topTokens) {
      if (this.globalRejections.has(tokenId)) {
        rejectedCount++;
      }
    }

    // Ratio of rejected tokens in the output
    const rejectionRatio = rejectedCount / topTokens.length;
    // Map to [-1, 1]: 0 rejections = +1, all rejected = -1
    return 1 - 2 * rejectionRatio;
  }

  /**
   * Get adapter weights (serialized rejection state).
   */
  async getAdapterWeights(): Promise<ArrayBuffer> {
    return this.serializeState();
  }

  /**
   * Load adapter weights (rejection state from another device).
   */
  async loadAdapterWeights(weights: ArrayBuffer): Promise<void> {
    this.deserializeState(weights);
    this.recomputeComplement();
    await this.saveAdapter();
  }

  /**
   * Get training statistics.
   */
  getStats(): { examples: number; lastTrained?: string } {
    return {
      examples: this.trainingExamples,
      lastTrained: this.lastTrained,
    };
  }

  /**
   * Enable/disable community participation.
   */
  setCommunityParticipation(enabled: boolean): void {
    this.communityParticipation = enabled;
  }

  /**
   * Sync updates via statistical teleportation if eligible.
   */
  async syncUpdates(): Promise<void> {
    await this.saveAdapter();
    if (!this.communityParticipation) return;

    const feasibility = this.checkTeleportationFeasibility();
    if (feasibility.feasible) {
      // Teleportation mode: send only the deficit integer
      const _payload = this.buildTeleportationPayload();
      // In a real deployment, this would be sent to the federated hub.
      // The hub reconstructs the convergence trajectory from the deficit alone.
    }
  }

  /**
   * Get the rejection record for a specific prompt (for data pipeline use).
   */
  getRejectionRecord(prompt: string): RejectionRecord {
    const rejectedResponses: string[] = [];
    const rejectionCounts: number[] = [];

    // Global rejections are token-level, not response-level.
    // We expose them as a synthetic rejection record.
    return {
      prompt,
      rejectedResponses,
      rejectionCounts,
      totalRounds: this.totalRounds,
    };
  }

  /**
   * Ingest a pre-built rejection record (e.g., from DPO conversion).
   */
  async ingestRejectionRecord(
    record: RejectionRecord,
    tokenizer: Tokenizer
  ): Promise<void> {
    const boundaries = buildTokenVoidBoundaries(record, tokenizer);

    for (const boundary of boundaries) {
      for (const [tokenId, count] of boundary.rejections) {
        const prev = this.globalRejections.get(tokenId) ?? 0;
        this.globalRejections.set(tokenId, prev + count);
        this.totalRounds += count;

        propagateRejection(this.personalityStack, tokenId, count);
      }
    }

    // Merge position boundaries
    for (const boundary of boundaries) {
      const existing = this.positionBoundaries[boundary.position];
      if (existing) {
        for (const [tokenId, count] of boundary.rejections) {
          const prev = existing.rejections.get(tokenId) ?? 0;
          existing.rejections.set(tokenId, prev + count);
          existing.totalRejections += count;
        }
      } else {
        this.positionBoundaries[boundary.position] = boundary;
      }
    }

    this.trainingExamples++;
    this.lastTrained = new Date().toISOString();
    this.recomputeComplement();
    await this.saveAdapter();
  }

  // --- Private ---

  /**
   * Extract top-K token IDs from a hidden state vector.
   * Uses the highest activation values as proxy for generated tokens.
   */
  private extractTopTokens(
    hiddenState: Float32Array,
    topK: number = 10
  ): number[] {
    const indexed: [number, number][] = [];
    const len = Math.min(hiddenState.length, this.vocabSize);
    for (let i = 0; i < len; i++) {
      indexed.push([i, Math.abs(hiddenState[i])]);
    }

    indexed.sort((a, b) => b[1] - a[1]);
    return indexed.slice(0, topK).map(([idx]) => idx);
  }

  /**
   * Recompute complement distributions from current rejection state.
   */
  private recomputeComplement(): void {
    // Global complement is computed on-demand via getComplementDistribution()
    // Position-level complements are also computed on-demand
  }

  /**
   * Serialize rejection state to ArrayBuffer for storage.
   */
  private serializeState(): ArrayBuffer {
    const state: RejectionState = {
      rejections: [...this.globalRejections.entries()],
      totalRounds: this.totalRounds,
      positionBoundaries: this.positionBoundaries.map((b) => ({
        position: b.position,
        rejections: [...b.rejections.entries()],
        totalRejections: b.totalRejections,
      })),
    };

    const json = JSON.stringify(state);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  /**
   * Deserialize rejection state from ArrayBuffer.
   */
  private deserializeState(buffer: ArrayBuffer): void {
    try {
      const decoder = new TextDecoder();
      const json = decoder.decode(buffer);
      const state: RejectionState = JSON.parse(json);

      this.globalRejections = new Map(state.rejections);
      this.totalRounds = state.totalRounds;
      this.positionBoundaries = (state.positionBoundaries ?? []).map((b) => ({
        position: b.position,
        rejections: new Map(b.rejections),
        totalRejections: b.totalRejections,
      }));
    } catch {
      // Invalid state -- start fresh
      this.globalRejections = new Map();
      this.totalRounds = 0;
      this.positionBoundaries = [];
    }
  }

  /**
   * Persist rejection state to storage.
   */
  private async saveAdapter(): Promise<void> {
    const adapter: UserAdapter = {
      id: this.adapterId,
      modelId: this.modelId,
      userId: this.userId,
      adapterType: 'reward_head', // Reuse existing adapter type for compatibility
      weights: this.serializeState(),
      trainingExamples: this.trainingExamples,
      lastUpdated: new Date().toISOString(),
    };
    await this.storage.setUserAdapter(adapter);
  }
}
