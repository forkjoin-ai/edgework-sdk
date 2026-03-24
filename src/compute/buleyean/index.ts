/**
 * Buleyean RL Module -- On-device rejection-based reinforcement learning
 *
 * Train from the God Formula alone: w_i = R - min(v_i, R) + 1
 * No reward model. No chosen examples. Just rejection counts.
 *
 * Edge-compatible: no external dependencies, runs on any JS runtime.
 */

// Types
export type {
  RejectionRecord,
  TokenVoidBoundary,
  BuleyeanTarget,
  BuleyeanTrainingConfig,
  BuleyeanMetrics,
  DPORecord,
  ConversionResult,
} from './types';
export { DEFAULT_CONFIG } from './types';

// Target computation (God Formula)
export type { Tokenizer } from './target';
export {
  buildTokenVoidBoundaries,
  computeComplementDistribution,
  buildBuleyeanTarget,
} from './target';

// Metrics
export {
  sparseEntropy,
  inverseBuleMetric,
  rejectionCoverage,
  computeMetrics,
  aggregateMetrics,
  teleportationDeficit,
  federatedConvergenceCheck,
  verifyConvergence,
} from './metrics';

// Data pipeline
export {
  convertDPOToRejections,
  parseRejectionJSONL,
  parseDPOJSONL,
  serializeRejectionJSONL,
} from './data-pipeline';

// Personality (Five-Parameter Void Walker Model)
export type {
  PersonalityProfile,
  PersonalityBules,
  PersonalityTrainingParams,
  PersonalityTimescale,
  PersonalityLayer,
  PersonalityStack,
  PersonalityTrainingConfig,
} from './personality';
export {
  PHI,
  PHI_INV,
  BALANCED_PROFILE,
  PERSONALITY_PRESETS,
  DEFAULT_LAYER_CONFIG,
  DEFAULT_PERSONALITY_CONFIG,
  measureBules,
  deriveTrainingParams,
  personalityWeightedComplement,
  createPersonalityStack,
  propagateRejection,
  profileDistance,
  totalBule,
} from './personality';

// Quark Personality (Ten-Point Skyrms Model)
export type {
  QuarkWalkers,
  QuarkWalker,
  BosonChannels,
  QuarkPersonality,
} from './quark-personality';
export {
  createQuarkWalkers,
  computeBosons,
  systemEnergy,
  toTenPointVector,
  fromTenPointVector,
  isConfined,
  personalityStep,
  createQuarkPersonality,
  settlePersonality,
  EXPLORER,
  BUILDER,
  CREATIVE,
  ANXIOUS,
  BALANCED,
} from './quark-personality';

// Training (Loss Functions & Curriculum)
export type {
  BuleyeanLoss,
  BuleyeanLossConfig,
  TrainingStepResult,
  TrainingRunSummary,
  CurriculumStrategy,
  VoidSharingMap,
} from './training';
export {
  buleyeanKLLoss,
  contrastLoss,
  curriculumFromPersonality,
  computeVoidSharing,
  DEFAULT_TRAINING_CONFIG,
} from './training';

// On-device Trainer
export { BuleyeanTrainer } from './trainer';
export type { BuleyeanTrainerConfig } from './trainer';
