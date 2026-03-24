/**
 * Buleyean RL Types -- Edge-compatible port
 *
 * All types serve the God Formula: w_i = R - min(v_i, R) + 1.
 * No external dependencies -- pure TypeScript for on-device RL.
 */

/**
 * A single rejection record: a prompt and its rejected responses.
 * No "chosen" column. The complement distribution IS the target.
 */
export interface RejectionRecord {
  prompt: string;
  rejectedResponses: string[];
  rejectionCounts: number[];
  totalRounds: number;
  metadata?: Record<string, unknown>;
}

/**
 * Per-token void boundary at a single sequence position.
 * Sparse representation: only non-zero rejection counts are stored.
 */
export interface TokenVoidBoundary {
  position: number;
  rejections: Map<number, number>;
  totalRejections: number;
}

/**
 * A complete Buleyean training target for one prompt.
 */
export interface BuleyeanTarget {
  prompt: string;
  promptTokenIds: number[];
  positionBoundaries: TokenVoidBoundary[];
  complementDistributions: Map<number, number>[];
  vocabSize: number;
}

export interface BuleyeanTrainingConfig {
  alpha: number;
  contrastWeight: number;
  sftWeight: number;
  temperature: number;
  minRejectionCount: number;
  sparse: boolean;
}

export const DEFAULT_CONFIG: BuleyeanTrainingConfig = {
  alpha: 0.7,
  contrastWeight: 0.3,
  sftWeight: 0.0,
  temperature: 1.0,
  minRejectionCount: 1,
  sparse: true,
};

export interface BuleyeanMetrics {
  buleEntropy: number;
  inverseBule: number;
  rejectionCoverage: number;
  buleyeanKL: number;
  contrastLoss: number;
}

export interface DPORecord {
  prompt: string;
  chosen: string;
  rejected: string;
}

export interface ConversionResult {
  records: RejectionRecord[];
  stats: {
    totalPrompts: number;
    totalRejections: number;
    avgRejectionsPerPrompt: number;
    discardedChosenCount: number;
  };
}
