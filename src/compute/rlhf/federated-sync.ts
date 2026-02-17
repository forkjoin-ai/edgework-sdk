/**
 * Federated Sync
 *
 * Privacy-preserving synchronization of adapter updates.
 */

export interface FederatedSyncConfig {
  hubUrl: string;
  modelId: string;
  deviceId: string;
  epsilon?: number; // Differential privacy noise level
}

export interface GradientUpdate {
  gradients: ArrayBuffer;
  feedbackCount: number;
  deviceId: string;
  modelId: string;
}

export class FederatedSync {
  private hubUrl: string;
  private modelId: string;
  private deviceId: string;
  private epsilon: number;

  constructor(config: FederatedSyncConfig) {
    this.hubUrl = config.hubUrl.replace(/\/$/, '');
    this.modelId = config.modelId;
    this.deviceId = config.deviceId;
    this.epsilon = config.epsilon ?? 1.0;
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
        -this.epsilon * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
      noisy[i] = data[i] + noise;
    }

    return noisy.buffer;
  }

  /**
   * Send gradient update to hub
   */
  async sendUpdate(update: GradientUpdate): Promise<void> {
    // Add differential privacy noise
    const noisyGradients = this.addDifferentialPrivacyNoise(update.gradients);

    const response = await fetch(`${this.hubUrl}/updates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Model-Id': this.modelId,
        'X-Device-Id': this.deviceId,
        'X-Feedback-Count': String(update.feedbackCount),
      },
      body: noisyGradients,
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
