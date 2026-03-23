import { describe, expect, it } from 'bun:test';
import {
  computeDeficit,
  deficitAtRound,
  trajectoryFromDeficit,
  convergenceRound,
  verifyMonotone,
  provePrivacy,
  trajectoriesIndistinguishable,
  checkTeleportationFeasibility,
  buildTeleportationDeficit,
  receiveTeleportation,
  causalSymmetry,
} from './statistical-teleportation';
import type { BuleyeanSpace } from './statistical-teleportation';

// ── THM 1: teleportation_trajectory_from_deficit ──────────────

describe('trajectoryFromDeficit', () => {
  it('reconstructs full trajectory from deficit alone', () => {
    const t = trajectoryFromDeficit(5);
    expect(t.deficits).toEqual([5, 4, 3, 2, 1, 0]);
    expect(t.convergenceRound).toBe(5);
    expect(t.monotone).toBe(true);
  });

  it('handles zero deficit (already converged)', () => {
    const t = trajectoryFromDeficit(0);
    expect(t.deficits).toEqual([0]);
    expect(t.convergenceRound).toBe(0);
  });

  it('handles deficit of 1', () => {
    const t = trajectoryFromDeficit(1);
    expect(t.deficits).toEqual([1, 0]);
    expect(t.convergenceRound).toBe(1);
  });
});

describe('deficitAtRound', () => {
  it('computes max(0, deficit - k)', () => {
    expect(deficitAtRound(5, 0)).toBe(5);
    expect(deficitAtRound(5, 3)).toBe(2);
    expect(deficitAtRound(5, 5)).toBe(0);
    expect(deficitAtRound(5, 10)).toBe(0);
  });
});

// ── THM 2: teleportation_convergence_round ────────────────────

describe('convergenceRound', () => {
  it('convergence round equals deficit', () => {
    expect(convergenceRound(0)).toBe(0);
    expect(convergenceRound(7)).toBe(7);
    expect(convergenceRound(100)).toBe(100);
  });
});

// ── THM 3: teleportation_monotone ─────────────────────────────

describe('verifyMonotone', () => {
  it('verifies that all trajectories are monotone decreasing', () => {
    for (let d = 0; d <= 20; d++) {
      const t = trajectoryFromDeficit(d);
      expect(verifyMonotone(t)).toBe(true);
    }
  });

  it('detects non-monotone trajectory', () => {
    const bad = { deficits: [3, 2, 4, 1, 0], convergenceRound: 4, monotone: false };
    expect(verifyMonotone(bad)).toBe(false);
  });
});

// ── THM 4: teleportation_privacy ──────────────────────────────

describe('provePrivacy', () => {
  it('proves two senders with same choices and rejections are indistinguishable', () => {
    // Different void boundaries (different WHICH options rejected),
    // but same count of rejections
    const sender1: BuleyeanSpace = { choices: 10, rejections: 5 };
    const sender2: BuleyeanSpace = { choices: 10, rejections: 5 };

    const proof = provePrivacy(sender1, sender2);
    expect(proof.choicesMatch).toBe(true);
    expect(proof.deficitsMatch).toBe(true);
    expect(proof.trajectoriesIdentical).toBe(true);
    expect(proof.privacyHolds).toBe(true);
  });

  it('detects distinguishable senders when rejection counts differ', () => {
    const sender1: BuleyeanSpace = { choices: 10, rejections: 5 };
    const sender2: BuleyeanSpace = { choices: 10, rejections: 3 };

    const proof = provePrivacy(sender1, sender2);
    expect(proof.deficitsMatch).toBe(false);
    expect(proof.privacyHolds).toBe(false);
  });
});

// ── THM 5: teleportation_indistinguishable ────────────────────

describe('trajectoriesIndistinguishable', () => {
  it('same deficit produces identical trajectories', () => {
    expect(trajectoriesIndistinguishable(7, 7)).toBe(true);
    expect(trajectoriesIndistinguishable(0, 0)).toBe(true);
  });

  it('different deficits produce distinguishable trajectories', () => {
    expect(trajectoriesIndistinguishable(7, 8)).toBe(false);
  });
});

// ── computeDeficit ────────────────────────────────────────────

describe('computeDeficit', () => {
  it('computes choices - 1 - rejections', () => {
    expect(computeDeficit({ choices: 10, rejections: 3 })).toBe(6);
    expect(computeDeficit({ choices: 2, rejections: 0 })).toBe(1);
    expect(computeDeficit({ choices: 2, rejections: 1 })).toBe(0);
  });

  it('clamps to zero', () => {
    expect(computeDeficit({ choices: 5, rejections: 10 })).toBe(0);
  });
});

// ── Federated Learning Application ───────────────────────────

describe('checkTeleportationFeasibility', () => {
  it('feasible when deficit > 0 and privacy guaranteed', () => {
    const result = checkTeleportationFeasibility(
      { choices: 1000, rejections: 100 },
      500,
      1000
    );
    expect(result.feasible).toBe(true);
    expect(result.privacyGuaranteed).toBe(true);
    expect(result.deficit).toBe(899);
    expect(result.bandwidthSavings).toBeGreaterThan(0.99);
  });

  it('not feasible when gradient channels >= private data dimensions', () => {
    const result = checkTeleportationFeasibility(
      { choices: 1000, rejections: 100 },
      1000,
      500
    );
    expect(result.feasible).toBe(false);
    expect(result.privacyGuaranteed).toBe(false);
  });

  it('not feasible when deficit is zero', () => {
    const result = checkTeleportationFeasibility(
      { choices: 10, rejections: 9 },
      5,
      10
    );
    expect(result.feasible).toBe(false);
    expect(result.deficit).toBe(0);
  });
});

describe('buildTeleportationDeficit', () => {
  it('builds a deficit payload', () => {
    const payload = buildTeleportationDeficit(
      { choices: 100, rejections: 30 },
      'model-1',
      'device-abc',
      'text',
      5
    );
    expect(payload.deficit).toBe(69);
    expect(payload.modelId).toBe('model-1');
    expect(payload.deviceId).toBe('device-abc');
    expect(payload.modality).toBe('text');
    expect(payload.round).toBe(5);
    expect(payload.createdAt).toBeTruthy();
  });
});

describe('receiveTeleportation', () => {
  it('reconstructs trajectory from received deficit', () => {
    const payload = buildTeleportationDeficit(
      { choices: 10, rejections: 5 },
      'model-1',
      'device-abc',
      'text',
      1
    );
    const trajectory = receiveTeleportation(payload);
    expect(trajectory.deficits).toEqual([4, 3, 2, 1, 0]);
    expect(trajectory.convergenceRound).toBe(4);
    expect(trajectory.monotone).toBe(true);
  });
});

// ── Causal Symmetry ──────────────────────────────────────────

describe('causalSymmetry', () => {
  it('both walkers decrease simultaneously', () => {
    const result = causalSymmetry(10, 3);
    expect(result.deficitBefore).toBe(6);
    expect(result.deficitAfter).toBe(5);
    expect(result.simultaneousDecrease).toBe(true);
  });

  it('no decrease when already converged', () => {
    const result = causalSymmetry(10, 9);
    expect(result.deficitBefore).toBe(0);
    expect(result.deficitAfter).toBe(0);
    expect(result.simultaneousDecrease).toBe(false);
  });
});
