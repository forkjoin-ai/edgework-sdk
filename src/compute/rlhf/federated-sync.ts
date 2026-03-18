/**
 * Federated Sync
 *
 * Privacy-preserving synchronization of adapter updates.
 */

import type { GradientEnvelope, Modality } from '../../types';

export interface FederatedSyncConfig {
  hubUrl: string;
  modelId: string;
  deviceId: string;
  epsilon?: number; // Differential privacy epsilon
  clipNorm?: number; // L2 clipping norm
  noiseMultiplier?: number; // Laplace noise multiplier
  minCohort?: number; // Minimum aggregation cohort
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

  constructor(config: FederatedSyncConfig) {
    this.hubUrl = config.hubUrl.replace(/\/$/, '');
    this.modelId = config.modelId;
    this.deviceId = config.deviceId;
    this.epsilon = config.epsilon ?? 1.0;
    this.clipNorm = config.clipNorm ?? 1.0;
    this.noiseMultiplier = config.noiseMultiplier ?? 0.6;
    this.minCohort = config.minCohort ?? 128;
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
   * Full sync cycle: send local update, receive aggregated
   */
  async sync(localUpdate: GradientUpdate): Promise<ArrayBuffer | null> {
    // Send our update
    await this.sendUpdate(localUpdate);

    // Fetch aggregated update
    return this.fetchAggregatedUpdate();
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
