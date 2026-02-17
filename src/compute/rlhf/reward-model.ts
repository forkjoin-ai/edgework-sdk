/**
 * Reward Model
 *
 * Lightweight neural network that predicts reward from hidden states.
 * Trained on-device using user feedback.
 */

export interface RewardModelConfig {
  inputDim: number; // Model hidden dimension
  hiddenDim?: number; // Reward head hidden dimension
  learningRate?: number;
}

export class RewardModel {
  private inputDim: number;
  private hiddenDim: number;
  private learningRate: number;

  // Weights
  private w1: Float32Array;
  private b1: Float32Array;
  private w2: Float32Array;
  private b2: number;

  // Gradient accumulators for batch training
  private dw1: Float32Array;
  private db1: Float32Array;
  private dw2: Float32Array;
  private db2 = 0;
  private gradCount = 0;

  constructor(config: RewardModelConfig) {
    this.inputDim = config.inputDim;
    this.hiddenDim = config.hiddenDim ?? 64;
    this.learningRate = config.learningRate ?? 0.001;

    // Initialize weights with Xavier/He initialization
    const scale1 = Math.sqrt(2 / this.inputDim);
    const scale2 = Math.sqrt(2 / this.hiddenDim);

    this.w1 = new Float32Array(this.inputDim * this.hiddenDim);
    this.b1 = new Float32Array(this.hiddenDim);
    this.w2 = new Float32Array(this.hiddenDim);
    this.b2 = 0;

    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] = (Math.random() * 2 - 1) * scale1;
    }
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] = (Math.random() * 2 - 1) * scale2;
    }

    // Initialize gradient accumulators
    this.dw1 = new Float32Array(this.inputDim * this.hiddenDim);
    this.db1 = new Float32Array(this.hiddenDim);
    this.dw2 = new Float32Array(this.hiddenDim);
  }

  /**
   * Forward pass: hidden state -> reward prediction
   */
  forward(hiddenState: Float32Array): number {
    // Linear layer 1 + ReLU
    const h1 = new Float32Array(this.hiddenDim);
    for (let i = 0; i < this.hiddenDim; i++) {
      let sum = this.b1[i];
      for (let j = 0; j < this.inputDim; j++) {
        sum += hiddenState[j] * this.w1[j * this.hiddenDim + i];
      }
      h1[i] = Math.max(0, sum); // ReLU
    }

    // Linear layer 2 -> scalar
    let reward = this.b2;
    for (let i = 0; i < this.hiddenDim; i++) {
      reward += h1[i] * this.w2[i];
    }

    // Tanh to bound to [-1, 1]
    return Math.tanh(reward);
  }

  /**
   * Backward pass: compute gradients from feedback
   */
  backward(hiddenState: Float32Array, targetReward: number): void {
    // Forward pass with saved activations
    const h1 = new Float32Array(this.hiddenDim);
    const preRelu = new Float32Array(this.hiddenDim);

    for (let i = 0; i < this.hiddenDim; i++) {
      let sum = this.b1[i];
      for (let j = 0; j < this.inputDim; j++) {
        sum += hiddenState[j] * this.w1[j * this.hiddenDim + i];
      }
      preRelu[i] = sum;
      h1[i] = Math.max(0, sum);
    }

    let preOutput = this.b2;
    for (let i = 0; i < this.hiddenDim; i++) {
      preOutput += h1[i] * this.w2[i];
    }
    const output = Math.tanh(preOutput);

    // MSE loss gradient
    const dLoss = 2 * (output - targetReward);

    // Tanh gradient
    const dTanh = 1 - output * output;
    const dPreOutput = dLoss * dTanh;

    // Layer 2 gradients
    this.db2 += dPreOutput;
    for (let i = 0; i < this.hiddenDim; i++) {
      this.dw2[i] += dPreOutput * h1[i];
    }

    // Layer 1 gradients (through ReLU)
    const dh1 = new Float32Array(this.hiddenDim);
    for (let i = 0; i < this.hiddenDim; i++) {
      dh1[i] = dPreOutput * this.w2[i] * (preRelu[i] > 0 ? 1 : 0);
    }

    for (let i = 0; i < this.hiddenDim; i++) {
      this.db1[i] += dh1[i];
      for (let j = 0; j < this.inputDim; j++) {
        this.dw1[j * this.hiddenDim + i] += dh1[i] * hiddenState[j];
      }
    }

    this.gradCount++;
  }

  /**
   * Apply accumulated gradients
   */
  applyGradients(): void {
    if (this.gradCount === 0) return;

    const scale = this.learningRate / this.gradCount;

    // Update weights
    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] -= scale * this.dw1[i];
    }
    for (let i = 0; i < this.b1.length; i++) {
      this.b1[i] -= scale * this.db1[i];
    }
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] -= scale * this.dw2[i];
    }
    this.b2 -= scale * this.db2;

    // Reset accumulators
    this.dw1.fill(0);
    this.db1.fill(0);
    this.dw2.fill(0);
    this.db2 = 0;
    this.gradCount = 0;
  }

  /**
   * Get gradient update for federated learning
   */
  getGradientUpdate(): ArrayBuffer {
    const data = new Float32Array(
      this.w1.length + this.b1.length + this.w2.length + 2
    );
    let offset = 0;

    // Pack gradients
    for (let i = 0; i < this.dw1.length; i++) {
      data[offset++] = this.dw1[i];
    }
    for (let i = 0; i < this.db1.length; i++) {
      data[offset++] = this.db1[i];
    }
    for (let i = 0; i < this.dw2.length; i++) {
      data[offset++] = this.dw2[i];
    }
    data[offset++] = this.db2;
    data[offset++] = this.gradCount;

    return data.buffer;
  }

  /**
   * Apply gradient update from federated learning
   */
  applyGradientUpdate(update: ArrayBuffer): void {
    const data = new Float32Array(update);
    let offset = 0;

    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] -= this.learningRate * data[offset++];
    }
    for (let i = 0; i < this.b1.length; i++) {
      this.b1[i] -= this.learningRate * data[offset++];
    }
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] -= this.learningRate * data[offset++];
    }
    this.b2 -= this.learningRate * data[offset++];
  }

  /**
   * Save weights to ArrayBuffer
   */
  getWeights(): ArrayBuffer {
    const data = new Float32Array(
      this.w1.length + this.b1.length + this.w2.length + 1
    );
    let offset = 0;

    for (let i = 0; i < this.w1.length; i++) {
      data[offset++] = this.w1[i];
    }
    for (let i = 0; i < this.b1.length; i++) {
      data[offset++] = this.b1[i];
    }
    for (let i = 0; i < this.w2.length; i++) {
      data[offset++] = this.w2[i];
    }
    data[offset++] = this.b2;

    return data.buffer;
  }

  /**
   * Load weights from ArrayBuffer
   */
  loadWeights(weights: ArrayBuffer): void {
    const data = new Float32Array(weights);
    let offset = 0;

    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] = data[offset++];
    }
    for (let i = 0; i < this.b1.length; i++) {
      this.b1[i] = data[offset++];
    }
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] = data[offset++];
    }
    this.b2 = data[offset++];
  }
}
