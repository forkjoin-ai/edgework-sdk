/**
 * Buleyean Metrics -- edge-compatible port
 *
 * No clockwork dependency -- verification is self-contained.
 */

import type { TokenVoidBoundary, BuleyeanMetrics } from './types';

/**
 * Shannon entropy of a sparse distribution.
 */
export function sparseEntropy(
  dist: Map<number, number>,
  vocabSize: number
): number {
  if (dist.size === 0) return Math.log(vocabSize);

  let listedTotal = 0;
  for (const p of dist.values()) {
    listedTotal += p;
  }

  const remainingCount = vocabSize - dist.size;
  const remainingProb =
    remainingCount > 0 ? (1 - listedTotal) / remainingCount : 0;

  const total = listedTotal + remainingCount * remainingProb;

  let h = 0;
  for (const p of dist.values()) {
    const pNorm = p / total;
    if (pNorm > 0) h -= pNorm * Math.log(pNorm);
  }
  if (remainingProb > 0 && remainingCount > 0) {
    const pNorm = remainingProb / total;
    h -= remainingCount * pNorm * Math.log(pNorm);
  }

  return h;
}

/**
 * Inverse Bule metric: B^{-1} = (H_max - H(complement)) / T
 */
export function inverseBuleMetric(
  dist: Map<number, number>,
  vocabSize: number,
  rounds: number
): number {
  if (rounds <= 0) return 0;
  const hMax = Math.log(vocabSize);
  const h = sparseEntropy(dist, vocabSize);
  return (hMax - h) / rounds;
}

/**
 * Rejection coverage: fraction of vocabulary that has been rejected.
 */
export function rejectionCoverage(
  boundary: TokenVoidBoundary,
  vocabSize: number
): number {
  if (vocabSize === 0) return 0;
  return boundary.rejections.size / vocabSize;
}

/**
 * Compute all Buleyean metrics for a single position.
 */
export function computeMetrics(
  boundary: TokenVoidBoundary,
  dist: Map<number, number>,
  vocabSize: number,
  modelKL: number = 0,
  contrastLoss: number = 0
): BuleyeanMetrics {
  return {
    buleEntropy: sparseEntropy(dist, vocabSize),
    inverseBule: inverseBuleMetric(dist, vocabSize, boundary.totalRejections),
    rejectionCoverage: rejectionCoverage(boundary, vocabSize),
    buleyeanKL: modelKL,
    contrastLoss,
  };
}

/**
 * Teleportation metric: the Bule deficit for statistical teleportation.
 * This single integer encodes the entire future convergence trajectory.
 */
export function teleportationDeficit(boundary: TokenVoidBoundary): number {
  if (boundary.rejections.size === 0) return 0;
  let minRej = Infinity;
  let maxRej = 0;
  for (const count of boundary.rejections.values()) {
    if (count < minRej) minRej = count;
    if (count > maxRej) maxRej = count;
  }
  return maxRej - minRej;
}

/**
 * Federated convergence check from Bule deficits alone.
 */
export function federatedConvergenceCheck(
  workerDeficits: number[]
): { maxDeficit: number; fleetConverged: boolean; roundsRemaining: number } {
  const maxDeficit = Math.max(0, ...workerDeficits);
  return {
    maxDeficit,
    fleetConverged: maxDeficit === 0,
    roundsRemaining: maxDeficit,
  };
}

/**
 * Self-contained convergence verification (no clockwork dependency).
 * Checks the three core Buleyean invariants directly.
 */
export function verifyConvergence(
  boundary: TokenVoidBoundary,
  rounds: number
): {
  status: 'verified' | 'open' | 'violated';
  deficit: number;
  roundsRemaining: number;
} {
  const deficit = teleportationDeficit(boundary);

  // Check positivity (Law 1): all rejection counts must be non-negative
  for (const count of boundary.rejections.values()) {
    if (count < 0) {
      return { status: 'violated', deficit, roundsRemaining: deficit };
    }
  }

  // Check convergence (Law 7): deficit = 0 means converged
  if (deficit === 0 && boundary.rejections.size > 0) {
    return { status: 'verified', deficit: 0, roundsRemaining: 0 };
  }

  return { status: 'open', deficit, roundsRemaining: deficit };
}

/**
 * Aggregate metrics across all positions in a sequence.
 */
export function aggregateMetrics(metrics: BuleyeanMetrics[]): BuleyeanMetrics {
  if (metrics.length === 0) {
    return {
      buleEntropy: 0,
      inverseBule: 0,
      rejectionCoverage: 0,
      buleyeanKL: 0,
      contrastLoss: 0,
    };
  }

  const n = metrics.length;
  return {
    buleEntropy: metrics.reduce((s, m) => s + m.buleEntropy, 0) / n,
    inverseBule: metrics.reduce((s, m) => s + m.inverseBule, 0) / n,
    rejectionCoverage:
      metrics.reduce((s, m) => s + m.rejectionCoverage, 0) / n,
    buleyeanKL: metrics.reduce((s, m) => s + m.buleyeanKL, 0) / n,
    contrastLoss: metrics.reduce((s, m) => s + m.contrastLoss, 0) / n,
  };
}
