/**
 * Buleyean Training -- edge-compatible loss functions and curriculum
 *
 * Three loss functions, all derived from the God Formula:
 *   L_buleyean: KL divergence to complement distribution
 *   L_contrast: rejection-weighted negative cross-entropy
 *   L_sft:      optional supervised fine-tuning
 *
 * No reward model needed. Pure math on Float32Arrays.
 */

import type { BuleyeanMetrics } from './types';

export interface BuleyeanLoss {
  buleyeanLoss: number;
  contrastLoss: number;
  sftLoss: number;
  totalLoss: number;
  perTokenLoss: number[];
}

export interface BuleyeanLossConfig {
  buleyeanWeight: number;
  contrastWeight: number;
  sftWeight: number;
  learningRate: number;
  temperature: number;
  minRejectionCount: number;
  maxGradNorm: number;
}

export interface TrainingStepResult {
  step: number;
  loss: BuleyeanLoss;
  metrics: BuleyeanMetrics;
  effectiveLR: number;
  gradNorm: number;
  clipped: boolean;
}

export interface TrainingRunSummary {
  totalSteps: number;
  finalLoss: number;
  initialLoss: number;
  lossReduction: number;
  averageLoss: number;
  stepsPerSecond: number;
  totalTimeMs: number;
  steps: TrainingStepResult[];
}

/**
 * L_buleyean: KL divergence from model distribution to complement distribution.
 * Pushes the model toward tokens that were less rejected.
 */
export function buleyeanKLLoss(
  modelLogProbs: Float32Array,
  complementProbs: Float32Array
): number {
  let kl = 0;
  for (let i = 0; i < modelLogProbs.length; i++) {
    const modelProb = Math.exp(modelLogProbs[i]);
    const targetProb = complementProbs[i];
    if (modelProb > 1e-10 && targetProb > 1e-10) {
      kl += modelProb * (modelLogProbs[i] - Math.log(targetProb));
    }
  }
  return Math.max(0, kl);
}

/**
 * L_contrast: rejection-weighted negative cross-entropy.
 * Penalizes the model proportionally to rejection counts.
 */
export function contrastLoss(
  modelLogProbs: Float32Array,
  rejectionCounts: Map<number, number>,
  totalRejections: number
): number {
  if (totalRejections === 0) return 0;

  let loss = 0;
  for (const [tokenId, count] of rejectionCounts) {
    if (tokenId >= modelLogProbs.length) continue;
    const modelProb = Math.exp(modelLogProbs[tokenId]);
    const weight = count / totalRejections;
    const antiProb = Math.max(1e-10, 1 - modelProb);
    loss -= weight * Math.log(antiProb);
  }
  return loss;
}

export type CurriculumStrategy =
  | 'inverse_bule'
  | 'kurtosis'
  | 'rejection_density'
  | 'random';

/**
 * Select curriculum strategy from personality profile.
 */
export function curriculumFromPersonality(profile: {
  try_: number;
  choose: number;
  commit: number;
  letGo: number;
  learn: number;
}): CurriculumStrategy {
  if (profile.commit > 0.7) return 'inverse_bule';
  if (profile.try_ > 0.7 && profile.learn > 0.7) return 'kurtosis';
  if (profile.choose < 0.3) return 'rejection_density';
  return 'rejection_density';
}

/**
 * Void sharing analysis between two agents.
 */
export interface VoidSharingMap {
  shared: number;
  hiddenA: number;
  hiddenB: number;
  unexplored: number;
  empathyDeficit: number;
  convergenceRate: number;
}

/**
 * Compute the void sharing map between two profiles.
 */
export function computeVoidSharing(
  profileA: number[],
  profileB: number[],
  threshold: number = 0.1
): VoidSharingMap {
  const n = Math.max(profileA.length, profileB.length);
  let shared = 0;
  let hiddenA = 0;
  let hiddenB = 0;
  let unexplored = 0;

  for (let i = 0; i < n; i++) {
    const aExplored = (profileA[i] ?? 0) > threshold;
    const bExplored = (profileB[i] ?? 0) > threshold;

    if (aExplored && bExplored) shared++;
    else if (aExplored) hiddenA++;
    else if (bExplored) hiddenB++;
    else unexplored++;
  }

  const union = shared + hiddenA + hiddenB;
  const bIsolated = shared + hiddenA + (shared + hiddenB);
  const bMerged = union;
  const empathyDeficit = bIsolated - bMerged;
  const convergenceRate = Math.max(0, union - 1);

  return { shared, hiddenA, hiddenB, unexplored, empathyDeficit, convergenceRate };
}

export const DEFAULT_TRAINING_CONFIG: BuleyeanLossConfig = {
  buleyeanWeight: 1.0,
  contrastWeight: 0.5,
  sftWeight: 0.0,
  learningRate: 1e-5,
  temperature: 1.0,
  minRejectionCount: 1,
  maxGradNorm: 1.0,
};
