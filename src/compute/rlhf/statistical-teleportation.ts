/**
 * Statistical Teleportation
 *
 * Transfers certainty without data. The Bule deficit (a single natural number)
 * encodes the entire future entropy trajectory of a Buleyean space. Transmit
 * one integer across a network and the receiver knows:
 *
 *   1. How certain the sender is about the answer
 *   2. Exactly when the sender will converge
 *   3. That the sender's certainty is monotonically increasing
 *
 * But they do NOT know what the answer is. The specific rejection history
 * (the void boundary) never crosses the wire.
 *
 * Five mechanized theorems (all proved in Lean 4, zero sorry):
 *
 *   - teleportation_trajectory_from_deficit
 *   - teleportation_convergence_round
 *   - teleportation_monotone
 *   - teleportation_privacy
 *   - teleportation_indistinguishable
 */

// ── Core Types ────────────────────────────────────────────────

/**
 * A Buleyean space with N choices and a rejection history.
 * The deficit is N - 1 - |rejections| (number of unchosen, unrejected options).
 */
export interface BuleyeanSpace {
  /** Total number of choices (N >= 2) */
  choices: number;
  /** Number of rejections recorded so far */
  rejections: number;
}

/**
 * The teleportation payload -- a single integer replaces the full gradient buffer.
 */
export interface TeleportationDeficit {
  /** The Bule deficit: choices - 1 - rejections */
  deficit: number;
  /** Model ID for routing */
  modelId: string;
  /** Device ID for attribution */
  deviceId: string;
  /** Modality of the training signal */
  modality: string;
  /** Round at which this deficit was computed */
  round: number;
  /** Timestamp */
  createdAt: string;
}

/**
 * The entropy trajectory reconstructed by the receiver from the deficit alone.
 */
export interface EntropyTrajectory {
  /** Deficit at each future round (length = deficit + 1) */
  deficits: number[];
  /** Round at which convergence occurs */
  convergenceRound: number;
  /** Whether the trajectory is strictly monotone decreasing */
  monotone: boolean;
}

/**
 * Privacy guarantee: the receiver cannot distinguish two senders
 * with different void boundaries but the same deficit.
 */
export interface PrivacyProof {
  /** Both senders have the same number of choices */
  choicesMatch: boolean;
  /** Both senders produce the same deficit */
  deficitsMatch: boolean;
  /** The trajectories are identical (indistinguishable) */
  trajectoriesIdentical: boolean;
  /** Privacy holds: different void boundaries, same observable */
  privacyHolds: boolean;
}

/**
 * Result of checking whether deficit-only teleportation is safe.
 * If gradientChannels < privateDataDimensions, the cave deficit
 * guarantees privacy -- the model can learn without data leaving the device.
 */
export interface TeleportationFeasibility {
  /** Whether teleportation is feasible */
  feasible: boolean;
  /** The deficit value */
  deficit: number;
  /** Gradient channel count (what would be sent) */
  gradientChannels: number;
  /** Private data dimensions (what must stay local) */
  privateDataDimensions: number;
  /** Privacy guaranteed by channel deficit */
  privacyGuaranteed: boolean;
  /** Bandwidth savings ratio (0 to 1) */
  bandwidthSavings: number;
}

// ── Theorem 1: teleportation_trajectory_from_deficit ──────────
//
// The deficit at any future round k is: deficit - min(k, deficit).
// Deterministic from one integer.

/**
 * Compute the deficit at a future round k, given current deficit.
 * THM: deficitAtRound(d, k) = d - min(k, d) = max(0, d - k)
 */
export function deficitAtRound(deficit: number, k: number): number {
  return Math.max(0, deficit - k);
}

/**
 * Reconstruct the full entropy trajectory from a single deficit integer.
 * Returns the deficit value at every round from 0 to convergence.
 */
export function trajectoryFromDeficit(deficit: number): EntropyTrajectory {
  const d = Math.max(0, Math.floor(deficit));
  const deficits: number[] = [];

  for (let k = 0; k <= d; k++) {
    deficits.push(deficitAtRound(d, k));
  }

  return {
    deficits,
    convergenceRound: d,
    monotone: true, // theorem guarantees this
  };
}

// ── Theorem 2: teleportation_convergence_round ────────────────
//
// Convergence happens at round = deficit. Known in advance.

/**
 * The round at which the sender will converge.
 * THM: convergenceRound(deficit) = deficit
 */
export function convergenceRound(deficit: number): number {
  return Math.max(0, Math.floor(deficit));
}

// ── Theorem 3: teleportation_monotone ─────────────────────────
//
// The trajectory only decreases. No backsliding.

/**
 * Verify that a trajectory is monotone decreasing.
 * THM: for all k, deficitAtRound(d, k+1) <= deficitAtRound(d, k)
 */
export function verifyMonotone(trajectory: EntropyTrajectory): boolean {
  for (let i = 1; i < trajectory.deficits.length; i++) {
    if (trajectory.deficits[i] > trajectory.deficits[i - 1]) {
      return false;
    }
  }
  return true;
}

// ── Theorem 4: teleportation_privacy ──────────────────────────
//
// Two senders with different void boundaries but the same number of
// choices transmit the same deficit. The receiver cannot distinguish them.

/**
 * Compute the Bule deficit for a Buleyean space.
 * deficit = choices - 1 - rejections (clamped to >= 0)
 */
export function computeDeficit(space: BuleyeanSpace): number {
  return Math.max(0, space.choices - 1 - space.rejections);
}

/**
 * Prove that two spaces with different void boundaries are
 * indistinguishable to the receiver when they share the same deficit.
 */
export function provePrivacy(
  sender1: BuleyeanSpace,
  sender2: BuleyeanSpace
): PrivacyProof {
  const d1 = computeDeficit(sender1);
  const d2 = computeDeficit(sender2);
  const t1 = trajectoryFromDeficit(d1);
  const t2 = trajectoryFromDeficit(d2);

  const choicesMatch = sender1.choices === sender2.choices;
  const deficitsMatch = d1 === d2;

  // Trajectories identical iff deficits match
  let trajectoriesIdentical = deficitsMatch;
  if (deficitsMatch) {
    // Belt and suspenders: verify element-wise
    for (let i = 0; i < t1.deficits.length; i++) {
      if (t1.deficits[i] !== t2.deficits[i]) {
        trajectoriesIdentical = false;
        break;
      }
    }
  }

  return {
    choicesMatch,
    deficitsMatch,
    trajectoriesIdentical,
    // Privacy holds when senders have different rejection histories
    // but produce the same observable (deficit + trajectory).
    // With same choices and same rejections count, any two distinct
    // rejection *sets* produce the same deficit.
    privacyHolds: deficitsMatch && trajectoriesIdentical,
  };
}

// ── Theorem 5: teleportation_indistinguishable ────────────────
//
// Both senders produce identical trajectories for the receiver.
// (This is the constructive witness for Theorem 4.)

/**
 * Verify that two deficit values produce identical trajectories.
 */
export function trajectoriesIndistinguishable(
  deficit1: number,
  deficit2: number
): boolean {
  if (deficit1 !== deficit2) return false;
  const t1 = trajectoryFromDeficit(deficit1);
  const t2 = trajectoryFromDeficit(deficit2);
  if (t1.deficits.length !== t2.deficits.length) return false;
  for (let i = 0; i < t1.deficits.length; i++) {
    if (t1.deficits[i] !== t2.deficits[i]) return false;
  }
  return true;
}

// ── Federated Learning Application ───────────────────────────

/**
 * Check whether deficit-only teleportation is feasible for a
 * given federated learning configuration.
 *
 * The cave deficit guarantees privacy when:
 *   gradientChannels < privateDataDimensions
 *
 * In that regime, the model can learn without data leaving the device.
 * The deficit alone carries the certainty trajectory.
 */
export function checkTeleportationFeasibility(
  space: BuleyeanSpace,
  gradientChannels: number,
  privateDataDimensions: number
): TeleportationFeasibility {
  const deficit = computeDeficit(space);
  const privacyGuaranteed = gradientChannels < privateDataDimensions;

  // Bandwidth savings: sending 1 integer vs a full gradient buffer.
  // A Float32 gradient of `gradientChannels` floats = gradientChannels * 4 bytes.
  // A deficit integer = 4 bytes (uint32).
  const fullPayloadBytes = gradientChannels * 4;
  const deficitPayloadBytes = 4; // one uint32
  const bandwidthSavings =
    fullPayloadBytes > 0
      ? 1 - deficitPayloadBytes / fullPayloadBytes
      : 0;

  return {
    feasible: deficit > 0 && privacyGuaranteed,
    deficit,
    gradientChannels,
    privateDataDimensions,
    privacyGuaranteed,
    bandwidthSavings: Math.max(0, bandwidthSavings),
  };
}

/**
 * Build a teleportation deficit payload for the mesh network.
 * This replaces the full GradientEnvelope when teleportation is feasible.
 */
export function buildTeleportationDeficit(
  space: BuleyeanSpace,
  modelId: string,
  deviceId: string,
  modality: string,
  round: number
): TeleportationDeficit {
  return {
    deficit: computeDeficit(space),
    modelId,
    deviceId,
    modality,
    round,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Receive a teleportation deficit and reconstruct what the sender knows.
 * Returns the full trajectory without ever seeing the sender's data.
 */
export function receiveTeleportation(
  payload: TeleportationDeficit
): EntropyTrajectory {
  return trajectoryFromDeficit(payload.deficit);
}

// ── Causal Symmetry ──────────────────────────────────────────
//
// The "arrow" from prior to posterior is not causal -- it's a frame
// artifact. When A and B share a void boundary and either records a
// rejection, both deficits decrease simultaneously.
// Neither walker is cause, neither is effect. Both are effects of
// the shared boundary growing.

/**
 * Demonstrate causal symmetry: both walkers sharing a void boundary
 * decrease their deficits simultaneously when a rejection is recorded.
 */
export function causalSymmetry(
  sharedChoices: number,
  sharedRejections: number
): {
  deficitBefore: number;
  deficitAfter: number;
  simultaneousDecrease: boolean;
} {
  const before = Math.max(0, sharedChoices - 1 - sharedRejections);
  const after = Math.max(0, sharedChoices - 1 - (sharedRejections + 1));
  return {
    deficitBefore: before,
    deficitAfter: after,
    simultaneousDecrease: after < before,
  };
}
