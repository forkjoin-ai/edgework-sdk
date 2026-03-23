/**
 * Federated Sync
 *
 * Privacy-preserving synchronization of adapter updates.
 *
 * Supports two modes:
 *   1. Full gradient sync (default) -- clips, noises, and sends gradients
 *   2. Statistical teleportation -- sends only the Bule deficit integer
 *      when privacy conditions are met (gradientChannels < privateDataDimensions).
 *      The deficit encodes the full entropy trajectory without revealing data.
 */

import type { GradientEnvelope, Modality } from '../../types';
import type { TeleportationDeficit, BuleyeanSpace, TeleportationFeasibility } from './statistical-teleportation';
import {
  computeDeficit,
  buildTeleportationDeficit,
  checkTeleportationFeasibility,
  receiveTeleportation,
} from './statistical-teleportation';

export interface FederatedSyncConfig {
  hubUrl: string;
  modelId: string;
  deviceId: string;
  epsilon?: number; // Differential privacy epsilon
  clipNorm?: number; // L2 clipping norm
  noiseMultiplier?: number; // Laplace noise multiplier
  minCohort?: number; // Minimum aggregation cohort
  /** Enable statistical teleportation (deficit-only sync) */
  enableTeleportation?: boolean;
  /** Number of private data dimensions (features the device holds) */
  privateDataDimensions?: number;
}

export interface GradientUpdate {
  gradients: ArrayBuffer;
  feedbackCount: number;
  deviceId: string;
  modelId: string;
  modality: Modality;
  baseVersion: string;
  adapterBaseVersion: string;
}

export class FederatedSync {
  private hubUrl: string;
  private modelId: string;
  private deviceId: string;
  private epsilon: number;
  private clipNorm: number;
  private noiseMultiplier: number;
  private minCohort: number;
  private enableTeleportation: boolean;
  private privateDataDimensions: number;
  private teleportationRound = 0;

  /**
   * Buleyean space tracking for teleportation.
   * choices = gradient dimensions (one "choice" per parameter).
   * rejections = training rounds where the gradient was near-zero
   *              (the void boundary grows with each uninformative update).
   */
  private buleyeanSpace: BuleyeanSpace = { choices: 2, rejections: 0 };

  constructor(config: FederatedSyncConfig) {
    this.hubUrl = config.hubUrl.replace(/\/$/, '');
    this.modelId = config.modelId;
    this.deviceId = config.deviceId;
    this.epsilon = config.epsilon ?? 1.0;
    this.clipNorm = config.clipNorm ?? 1.0;
    this.noiseMultiplier = config.noiseMultiplier ?? 0.6;
    this.minCohort = config.minCohort ?? 128;
    this.enableTeleportation = config.enableTeleportation ?? false;
    this.privateDataDimensions = config.privateDataDimensions ?? 0;
  }

  /**
   * Clip gradients to a fixed L2 norm bound.
   */
  private clipGradients(gradients: ArrayBuffer): ArrayBuffer {
    const data = new Float32Array(gradients);
    let squaredNorm = 0;
    for (let i = 0; i < data.length; i++) {
      squaredNorm += data[i] * data[i];
    }
    const norm = Math.sqrt(squaredNorm);
    if (norm === 0 || norm <= this.clipNorm) {
      return gradients;
    }

    const scale = this.clipNorm / norm;
    const clipped = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      clipped[i] = data[i] * scale;
    }
    return clipped.buffer;
  }

  /**
   * Add differential privacy noise to gradients
   */
  private addDifferentialPrivacyNoise(gradients: ArrayBuffer): ArrayBuffer {
    const data = new Float32Array(gradients);
    const noisy = new Float32Array(data.length);

    // Laplace noise for differential privacy
    for (let i = 0; i < data.length; i++) {
      const u = Math.random() - 0.5;
      const noise =
        -(this.noiseMultiplier / Math.max(this.epsilon, 1e-6)) *
        Math.sign(u) *
        Math.log(1 - 2 * Math.abs(u));
      noisy[i] = data[i] + noise;
    }

    return noisy.buffer;
  }

  /**
   * Build a gradient envelope compatible with D1/Dash sync metadata.
   */
  buildEnvelope(update: GradientUpdate, deviceProof: string): GradientEnvelope {
    const clipped = this.clipGradients(update.gradients);
    const noised = this.addDifferentialPrivacyNoise(clipped);
    return {
      modality: update.modality,
      modelId: update.modelId,
      baseVersion: update.baseVersion,
      adapterBaseVersion: update.adapterBaseVersion,
      clippedDelta: noised,
      dpNoiseSeedId: crypto.randomUUID(),
      deviceProof,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Send gradient update to hub
   */
  async sendUpdate(update: GradientUpdate): Promise<void> {
    const envelope = this.buildEnvelope(update, update.deviceId);
    const cohortHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Model-Id': this.modelId,
      'X-Device-Id': this.deviceId,
      'X-Feedback-Count': String(update.feedbackCount),
      'X-Modality': update.modality,
      'X-Base-Version': update.baseVersion,
      'X-Adapter-Base-Version': update.adapterBaseVersion,
      'X-Min-Cohort': String(this.minCohort),
      'X-DP-Noise-Seed-Id': envelope.dpNoiseSeedId,
      'X-Device-Proof': envelope.deviceProof,
    };

    const response = await fetch(`${this.hubUrl}/updates`, {
      method: 'POST',
      headers: cohortHeaders,
      body: envelope.clippedDelta,
    });

    if (!response.ok) {
      throw new Error(`Failed to send update: ${response.statusText}`);
    }
  }

  /**
   * Fetch aggregated update from hub
   */
  async fetchAggregatedUpdate(): Promise<ArrayBuffer | null> {
    const response = await fetch(`${this.hubUrl}/aggregated/${this.modelId}`, {
      headers: {
        'X-Device-Id': this.deviceId,
        'X-Min-Cohort': String(this.minCohort),
      },
    });

    if (response.status === 304) {
      // No new updates
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch update: ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Full sync cycle: send local update, receive aggregated.
   *
   * When teleportation is enabled and feasible, sends only the Bule deficit
   * instead of the full gradient buffer. The deficit alone encodes the
   * certainty trajectory -- the receiver knows how certain this device is
   * and when it will converge, without seeing the data.
   */
  async sync(localUpdate: GradientUpdate): Promise<ArrayBuffer | null> {
    this.teleportationRound++;

    // Check if teleportation mode is active and feasible
    if (this.enableTeleportation) {
      const gradientChannels = new Float32Array(localUpdate.gradients).length;
      this.updateBuleyeanSpace(localUpdate.gradients, gradientChannels);

      const feasibility = checkTeleportationFeasibility(
        this.buleyeanSpace,
        gradientChannels,
        this.privateDataDimensions
      );

      if (feasibility.feasible) {
        // Teleport: send deficit only (one integer, not the full buffer)
        await this.sendTeleportationDeficit(localUpdate.modality);
        return this.fetchAggregatedUpdate();
      }
    }

    // Fall back to full gradient sync
    await this.sendUpdate(localUpdate);
    return this.fetchAggregatedUpdate();
  }

  // ── Statistical Teleportation ────────────────────────────────

  /**
   * Update the Buleyean space from observed gradients.
   * A gradient dimension counts as a "rejection" when its magnitude
   * is below a threshold (near-zero = uninformative = rejected).
   */
  private updateBuleyeanSpace(
    gradients: ArrayBuffer,
    gradientChannels: number
  ): void {
    this.buleyeanSpace.choices = Math.max(2, gradientChannels);

    // Count near-zero gradient dimensions as rejections
    const data = new Float32Array(gradients);
    let nearZeroCount = 0;
    const threshold = 1e-6;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) < threshold) {
        nearZeroCount++;
      }
    }
    // Rejections accumulate: void boundary only grows
    this.buleyeanSpace.rejections = Math.min(
      this.buleyeanSpace.rejections + nearZeroCount,
      this.buleyeanSpace.choices - 1
    );
  }

  /**
   * Send only the Bule deficit to the hub.
   * Replaces the full gradient payload -- one integer crosses the wire.
   */
  private async sendTeleportationDeficit(modality: Modality): Promise<void> {
    const deficit = buildTeleportationDeficit(
      this.buleyeanSpace,
      this.modelId,
      this.deviceId,
      modality,
      this.teleportationRound
    );

    const response = await fetch(`${this.hubUrl}/teleportation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Model-Id': this.modelId,
        'X-Device-Id': this.deviceId,
        'X-Min-Cohort': String(this.minCohort),
        'X-Teleportation': 'true',
        'X-Deficit': String(deficit.deficit),
      },
      body: JSON.stringify(deficit),
    });

    if (!response.ok) {
      throw new Error(`Teleportation failed: ${response.statusText}`);
    }
  }

  /**
   * Check whether teleportation is currently feasible.
   */
  getTeleportationFeasibility(
    gradientChannels: number
  ): TeleportationFeasibility {
    return checkTeleportationFeasibility(
      this.buleyeanSpace,
      gradientChannels,
      this.privateDataDimensions
    );
  }

  /**
   * Get the current Bule deficit for this device.
   */
  getCurrentDeficit(): number {
    return computeDeficit(this.buleyeanSpace);
  }

  /**
   * Get the current Buleyean space state (for diagnostics).
   */
  getBuleyeanSpace(): BuleyeanSpace {
    return { ...this.buleyeanSpace };
  }

  /**
   * Get the current teleportation round.
   */
  getTeleportationRound(): number {
    return this.teleportationRound;
  }
}

/**
 * Federated averaging for the hub
 */
export function federatedAverage(
  updates: Array<{ weights: Float32Array; count: number }>
): Float32Array {
  if (updates.length === 0) {
    throw new Error('No updates to average');
  }

  const totalCount = updates.reduce((sum, u) => sum + u.count, 0);
  const length = updates[0].weights.length;
  const result = new Float32Array(length);

  for (const update of updates) {
    const weight = update.count / totalCount;
    for (let i = 0; i < length; i++) {
      result[i] += update.weights[i] * weight;
    }
  }

  return result;
}
