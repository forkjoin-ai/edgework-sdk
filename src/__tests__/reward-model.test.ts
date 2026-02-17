/**
 * Reward Model Tests
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { RewardModel } from '../compute/rlhf/reward-model';

describe('RewardModel', () => {
  let model: RewardModel;

  beforeEach(() => {
    model = new RewardModel({
      inputDim: 64,
      hiddenDim: 16,
      learningRate: 0.01,
    });
  });

  describe('initialization', () => {
    it('creates model with default config', () => {
      const defaultModel = new RewardModel({ inputDim: 128 });
      expect(defaultModel).toBeDefined();
    });

    it('creates model with custom config', () => {
      const customModel = new RewardModel({
        inputDim: 256,
        hiddenDim: 32,
        learningRate: 0.001,
      });
      expect(customModel).toBeDefined();
    });
  });

  describe('forward pass', () => {
    it('produces bounded output in [-1, 1]', () => {
      const input = new Float32Array(64);
      // Fill with random values
      for (let i = 0; i < input.length; i++) {
        input[i] = (Math.random() - 0.5) * 2;
      }

      const reward = model.forward(input);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });

    it('produces consistent output for same input', () => {
      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = i / 64;
      }

      const reward1 = model.forward(input);
      const reward2 = model.forward(input);
      expect(reward1).toBe(reward2);
    });

    it('produces different outputs for different inputs', () => {
      const input1 = new Float32Array(64).fill(0.5);
      const input2 = new Float32Array(64).fill(-0.5);

      const reward1 = model.forward(input1);
      const reward2 = model.forward(input2);
      expect(reward1).not.toBe(reward2);
    });

    it('handles zero input', () => {
      const zeroInput = new Float32Array(64).fill(0);
      const reward = model.forward(zeroInput);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });

    it('handles extreme values', () => {
      const extremeInput = new Float32Array(64);
      for (let i = 0; i < extremeInput.length; i++) {
        extremeInput[i] = i % 2 === 0 ? 1000 : -1000;
      }

      const reward = model.forward(extremeInput);
      // Output should still be bounded due to tanh
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });
  });

  describe('backward pass', () => {
    it('accumulates gradients', () => {
      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.random();
      }

      // Before backward, weights should not change
      const weightsBefore = model.getWeights();

      // Backward pass
      model.backward(input, 1);

      // Apply gradients
      model.applyGradients();

      // Weights should have changed
      const weightsAfter = model.getWeights();
      expect(weightsAfter).not.toEqual(weightsBefore);
    });

    it('trains toward positive feedback', () => {
      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = 0.1 * i;
      }

      const rewardBefore = model.forward(input);

      // Train with positive feedback
      for (let i = 0; i < 100; i++) {
        model.backward(input, 1);
      }
      model.applyGradients();

      const rewardAfter = model.forward(input);

      // Reward should increase (move toward 1)
      expect(rewardAfter).toBeGreaterThan(rewardBefore);
    });

    it('trains toward negative feedback', () => {
      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = 0.1 * i;
      }

      const rewardBefore = model.forward(input);

      // Train with negative feedback
      for (let i = 0; i < 100; i++) {
        model.backward(input, -1);
      }
      model.applyGradients();

      const rewardAfter = model.forward(input);

      // Reward should decrease (move toward -1)
      expect(rewardAfter).toBeLessThan(rewardBefore);
    });

    it('handles batch training', () => {
      const inputs = Array.from({ length: 5 }, () => {
        const input = new Float32Array(64);
        for (let i = 0; i < input.length; i++) {
          input[i] = Math.random();
        }
        return input;
      });

      // Accumulate gradients from multiple examples
      for (const input of inputs) {
        model.backward(input, Math.random() > 0.5 ? 1 : -1);
      }

      // Apply averaged gradients
      model.applyGradients();

      // Model should still work
      const reward = model.forward(inputs[0]);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });
  });

  describe('gradient update', () => {
    it('exports gradient update', () => {
      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.random();
      }

      model.backward(input, 1);
      const update = model.getGradientUpdate();

      expect(update).toBeInstanceOf(ArrayBuffer);
      expect(update.byteLength).toBeGreaterThan(0);
    });

    it('applies gradient update from another model', () => {
      const model1 = new RewardModel({ inputDim: 64, hiddenDim: 16 });
      const model2 = new RewardModel({ inputDim: 64, hiddenDim: 16 });

      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = 0.5;
      }

      // Train model1
      model1.backward(input, 1);
      const update = model1.getGradientUpdate();

      // Get reward before applying update
      const rewardBefore = model2.forward(input);

      // Apply update to model2
      model2.applyGradientUpdate(update);

      // Reward should change
      const rewardAfter = model2.forward(input);
      expect(rewardAfter).not.toBe(rewardBefore);
    });
  });

  describe('weights serialization', () => {
    it('exports weights as ArrayBuffer', () => {
      const weights = model.getWeights();
      expect(weights).toBeInstanceOf(ArrayBuffer);
      expect(weights.byteLength).toBeGreaterThan(0);
    });

    it('imports weights correctly', () => {
      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.random();
      }

      // Get initial reward and weights
      const reward1 = model.forward(input);
      const weights = model.getWeights();

      // Train the model to change weights
      for (let i = 0; i < 50; i++) {
        model.backward(input, 1);
      }
      model.applyGradients();

      // Verify weights changed
      const reward2 = model.forward(input);
      expect(reward2).not.toBe(reward1);

      // Restore original weights
      model.loadWeights(weights);

      // Reward should match original
      const reward3 = model.forward(input);
      expect(Math.abs(reward3 - reward1)).toBeLessThan(1e-6);
    });

    it('transfers weights between models', () => {
      const model1 = new RewardModel({ inputDim: 64, hiddenDim: 16 });
      const model2 = new RewardModel({ inputDim: 64, hiddenDim: 16 });

      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.random();
      }

      // Models have different random weights
      const reward1_initial = model1.forward(input);
      const reward2_initial = model2.forward(input);
      expect(reward1_initial).not.toBe(reward2_initial);

      // Transfer weights
      const weights = model1.getWeights();
      model2.loadWeights(weights);

      // Now they should produce same output
      const reward1 = model1.forward(input);
      const reward2 = model2.forward(input);
      expect(reward1).toBe(reward2);
    });
  });

  describe('learning rate', () => {
    it('higher learning rate causes faster convergence', () => {
      const slowModel = new RewardModel({
        inputDim: 64,
        hiddenDim: 16,
        learningRate: 0.001,
      });
      const fastModel = new RewardModel({
        inputDim: 64,
        hiddenDim: 16,
        learningRate: 0.1,
      });

      // Use same initial weights
      const weights = slowModel.getWeights();
      fastModel.loadWeights(weights);

      const input = new Float32Array(64);
      for (let i = 0; i < input.length; i++) {
        input[i] = 0.5;
      }

      const initialReward = slowModel.forward(input);

      // Train both with same data
      for (let i = 0; i < 10; i++) {
        slowModel.backward(input, 1);
        fastModel.backward(input, 1);
      }
      slowModel.applyGradients();
      fastModel.applyGradients();

      const slowChange = Math.abs(slowModel.forward(input) - initialReward);
      const fastChange = Math.abs(fastModel.forward(input) - initialReward);

      // Fast model should change more
      expect(fastChange).toBeGreaterThan(slowChange);
    });
  });

  describe('edge cases', () => {
    it('handles applyGradients with no accumulated gradients', () => {
      const weightsBefore = model.getWeights();
      model.applyGradients();
      const weightsAfter = model.getWeights();

      // Weights should be unchanged
      expect(weightsAfter).toEqual(weightsBefore);
    });

    it('handles repeated applyGradients calls', () => {
      const input = new Float32Array(64).fill(0.5);

      model.backward(input, 1);
      model.applyGradients();
      const weightsFirst = model.getWeights();

      // Second apply should do nothing (gradients cleared)
      model.applyGradients();
      const weightsSecond = model.getWeights();

      expect(weightsSecond).toEqual(weightsFirst);
    });

    it('handles very small input dimension', () => {
      const smallModel = new RewardModel({ inputDim: 1 });
      const input = new Float32Array([0.5]);
      const reward = smallModel.forward(input);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });

    it('handles large input dimension', () => {
      const largeModel = new RewardModel({ inputDim: 960 }); // Cyrano hidden dim
      const input = new Float32Array(960);
      for (let i = 0; i < input.length; i++) {
        input[i] = Math.random();
      }
      const reward = largeModel.forward(input);
      expect(reward).toBeGreaterThanOrEqual(-1);
      expect(reward).toBeLessThanOrEqual(1);
    });
  });
});
