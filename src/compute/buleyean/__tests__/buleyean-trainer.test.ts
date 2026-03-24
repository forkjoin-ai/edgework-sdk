/**
 * BuleyeanTrainer tests -- on-device rejection-based RL
 */

import { describe, test, expect } from 'bun:test';
import {
  buildTokenVoidBoundaries,
  computeComplementDistribution,
  buildBuleyeanTarget,
  DEFAULT_CONFIG,
  sparseEntropy,
  inverseBuleMetric,
  rejectionCoverage,
  teleportationDeficit,
  federatedConvergenceCheck,
  verifyConvergence,
  convertDPOToRejections,
  parseRejectionJSONL,
  serializeRejectionJSONL,
  measureBules,
  deriveTrainingParams,
  personalityWeightedComplement,
  BALANCED_PROFILE,
  PERSONALITY_PRESETS,
  PHI_INV,
  buleyeanKLLoss,
  contrastLoss,
  createQuarkPersonality,
  settlePersonality,
  isConfined,
  computeBosons,
  systemEnergy,
  toTenPointVector,
  fromTenPointVector,
} from '../index';
import type { Tokenizer, RejectionRecord, TokenVoidBoundary } from '../index';

// Minimal tokenizer for testing
const testTokenizer: Tokenizer = {
  encode(text: string): number[] {
    // Simple byte-level encoding
    return Array.from(new TextEncoder().encode(text));
  },
  vocabSize: 256,
};

describe('God Formula: target computation', () => {
  test('buildTokenVoidBoundaries creates per-position boundaries', () => {
    const record: RejectionRecord = {
      prompt: 'test',
      rejectedResponses: ['bad', 'worse'],
      rejectionCounts: [1, 2],
      totalRounds: 3,
    };

    const boundaries = buildTokenVoidBoundaries(record, testTokenizer);

    expect(boundaries.length).toBeGreaterThan(0);
    expect(boundaries[0].rejections.size).toBeGreaterThan(0);
    expect(boundaries[0].totalRejections).toBeGreaterThan(0);
  });

  test('computeComplementDistribution applies God Formula', () => {
    const boundary: TokenVoidBoundary = {
      position: 0,
      rejections: new Map([
        [10, 5],
        [20, 3],
        [30, 1],
      ]),
      totalRejections: 9,
    };

    const dist = computeComplementDistribution(boundary, 256, {
      temperature: 1.0,
      minRejectionCount: 1,
    });

    // Rejected tokens should have different probabilities
    expect(dist.size).toBeGreaterThan(0);

    // More rejected tokens should have lower weight (Law 2)
    const w10 = dist.get(10)!;
    const w30 = dist.get(30)!;
    expect(w30).toBeGreaterThan(w10); // 30 has fewer rejections
  });

  test('Law 1 (sliver): no token reaches zero probability', () => {
    const boundary: TokenVoidBoundary = {
      position: 0,
      rejections: new Map([[10, 100]]),
      totalRejections: 100,
    };

    const dist = computeComplementDistribution(boundary, 256, {
      temperature: 1.0,
      minRejectionCount: 1,
    });

    // Even the most rejected token has non-zero weight
    const w10 = dist.get(10);
    if (w10 !== undefined) {
      expect(w10).toBeGreaterThan(0);
    }
  });

  test('buildBuleyeanTarget produces complete target', () => {
    const record: RejectionRecord = {
      prompt: 'hello',
      rejectedResponses: ['bad response'],
      rejectionCounts: [1],
      totalRounds: 1,
    };

    const target = buildBuleyeanTarget(record, testTokenizer, DEFAULT_CONFIG);

    expect(target.prompt).toBe('hello');
    expect(target.promptTokenIds.length).toBeGreaterThan(0);
    expect(target.vocabSize).toBe(256);
    expect(target.positionBoundaries.length).toBeGreaterThan(0);
    expect(target.complementDistributions.length).toBe(
      target.positionBoundaries.length
    );
  });
});

describe('metrics', () => {
  test('sparseEntropy returns max entropy for empty distribution', () => {
    const h = sparseEntropy(new Map(), 256);
    expect(h).toBeCloseTo(Math.log(256), 5);
  });

  test('inverseBuleMetric is zero with no rounds', () => {
    expect(inverseBuleMetric(new Map(), 256, 0)).toBe(0);
  });

  test('rejectionCoverage measures exploration', () => {
    const boundary: TokenVoidBoundary = {
      position: 0,
      rejections: new Map([
        [1, 1],
        [2, 1],
        [3, 1],
      ]),
      totalRejections: 3,
    };

    const coverage = rejectionCoverage(boundary, 100);
    expect(coverage).toBe(0.03); // 3/100
  });

  test('teleportationDeficit encodes convergence trajectory', () => {
    const boundary: TokenVoidBoundary = {
      position: 0,
      rejections: new Map([
        [1, 5],
        [2, 3],
        [3, 1],
      ]),
      totalRejections: 9,
    };

    const deficit = teleportationDeficit(boundary);
    expect(deficit).toBe(4); // max(5) - min(1) = 4
  });

  test('federatedConvergenceCheck detects fleet convergence', () => {
    const result = federatedConvergenceCheck([0, 0, 0]);
    expect(result.fleetConverged).toBe(true);
    expect(result.roundsRemaining).toBe(0);

    const result2 = federatedConvergenceCheck([3, 1, 5]);
    expect(result2.fleetConverged).toBe(false);
    expect(result2.roundsRemaining).toBe(5);
  });

  test('verifyConvergence checks Buleyean invariants', () => {
    const converged: TokenVoidBoundary = {
      position: 0,
      rejections: new Map([
        [1, 5],
        [2, 5],
        [3, 5],
      ]),
      totalRejections: 15,
    };

    const result = verifyConvergence(converged, 15);
    expect(result.status).toBe('verified');
    expect(result.deficit).toBe(0);
  });
});

describe('data pipeline', () => {
  test('convertDPOToRejections discards chosen', () => {
    const dpo = [
      { prompt: 'q1', chosen: 'good', rejected: 'bad' },
      { prompt: 'q1', chosen: 'also good', rejected: 'also bad' },
      { prompt: 'q2', chosen: 'ok', rejected: 'not ok' },
    ];

    const result = convertDPOToRejections(dpo);

    expect(result.records.length).toBe(2); // 2 unique prompts
    expect(result.stats.discardedChosenCount).toBe(3);
    expect(result.stats.totalRejections).toBe(3);

    const q1 = result.records.find((r) => r.prompt === 'q1')!;
    expect(q1.rejectedResponses).toContain('bad');
    expect(q1.rejectedResponses).toContain('also bad');
  });

  test('roundtrip JSONL serialization', () => {
    const records: RejectionRecord[] = [
      {
        prompt: 'test',
        rejectedResponses: ['bad1', 'bad2'],
        rejectionCounts: [1, 2],
        totalRounds: 3,
      },
    ];

    const jsonl = serializeRejectionJSONL(records);
    const parsed = parseRejectionJSONL(jsonl);

    expect(parsed.length).toBe(1);
    expect(parsed[0].prompt).toBe('test');
    expect(parsed[0].rejectedResponses).toEqual(['bad1', 'bad2']);
    expect(parsed[0].rejectionCounts).toEqual([1, 2]);
    expect(parsed[0].totalRounds).toBe(3);
  });
});

describe('personality', () => {
  test('balanced profile has zero total Bule', () => {
    const bules = measureBules(BALANCED_PROFILE);
    expect(bules.total).toBeCloseTo(0, 10);
    expect(bules.spike).toBeNull();
  });

  test('anxious profile has spike on letGo', () => {
    const bules = measureBules(PERSONALITY_PRESETS.anxious);
    expect(bules.spike).toBe('letGo');
    expect(bules.total).toBeGreaterThan(0);
  });

  test('deriveTrainingParams produces bounded parameters', () => {
    const params = deriveTrainingParams(PERSONALITY_PRESETS.explorer);
    expect(params.eta).toBeGreaterThanOrEqual(1.0);
    expect(params.eta).toBeLessThanOrEqual(10.0);
    expect(params.temperature).toBeGreaterThanOrEqual(0.1);
    expect(params.temperature).toBeLessThanOrEqual(3.0);
    expect(params.commitGain).toBeGreaterThanOrEqual(0.1);
    expect(params.commitGain).toBeLessThanOrEqual(3.0);
    expect(params.decayRate).toBeGreaterThanOrEqual(0.0);
    expect(params.decayRate).toBeLessThanOrEqual(0.5);
    expect(params.feedbackGain).toBeGreaterThanOrEqual(0.1);
    expect(params.feedbackGain).toBeLessThanOrEqual(2.0);
  });

  test('personalityWeightedComplement respects the sliver', () => {
    const rejections = new Map([
      [10, 5],
      [20, 10],
    ]);
    const params = deriveTrainingParams(BALANCED_PROFILE);
    const dist = personalityWeightedComplement(rejections, 15, 256, params);

    // All listed tokens should be > 0 (Law 1)
    for (const [, prob] of dist) {
      expect(prob).toBeGreaterThan(0);
    }
  });
});

describe('quark personality', () => {
  test('createQuarkPersonality initializes confined system', () => {
    const qp = createQuarkPersonality({
      try_: 0.5,
      choose: 0.5,
      commit: 0.5,
      letGo: 0.5,
      learn: 0.5,
    });

    expect(qp.confined).toBe(true);
    expect(qp.round).toBe(0);
    expect(qp.vector.length).toBe(10);
  });

  test('settlePersonality converges to equilibrium', () => {
    const initial = createQuarkPersonality({
      try_: 0.9,
      choose: 0.1,
      commit: 0.5,
      letGo: 0.8,
      learn: 0.3,
    });

    const settled = settlePersonality(initial, 50);
    expect(settled.round).toBeGreaterThan(0);
    // Energy should decrease or stay the same
    expect(settled.energy).toBeLessThanOrEqual(initial.energy + 0.01);
  });

  test('ten-point vector roundtrip preserves structure', () => {
    const qp = createQuarkPersonality({
      try_: 0.7,
      choose: 0.3,
      commit: 0.9,
      letGo: 0.2,
      learn: 0.6,
    });

    const vector = toTenPointVector(qp.bosons);
    const recovered = fromTenPointVector(vector);

    // Recovered values should be close to originals
    // (up to the gradient descent reconstruction error)
    expect(recovered.try_).toBeGreaterThan(0);
    expect(recovered.try_).toBeLessThan(1);
  });
});

describe('training loss functions', () => {
  test('buleyeanKLLoss is non-negative', () => {
    const modelLogProbs = new Float32Array(10).fill(-2.3); // ~uniform
    const complementProbs = new Float32Array(10).fill(0.1);

    const loss = buleyeanKLLoss(modelLogProbs, complementProbs);
    expect(loss).toBeGreaterThanOrEqual(0);
  });

  test('contrastLoss is zero with no rejections', () => {
    const modelLogProbs = new Float32Array(10).fill(-2.3);
    const loss = contrastLoss(modelLogProbs, new Map(), 0);
    expect(loss).toBe(0);
  });

  test('contrastLoss penalizes rejected tokens', () => {
    const modelLogProbs = new Float32Array(10).fill(-2.3);
    modelLogProbs[5] = -0.1; // High probability on token 5

    const rejections = new Map([[5, 10]]); // Token 5 heavily rejected
    const loss = contrastLoss(modelLogProbs, rejections, 10);

    expect(loss).toBeGreaterThan(0);
  });
});
