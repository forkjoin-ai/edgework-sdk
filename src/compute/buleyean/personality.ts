/**
 * Five-Parameter Void Walker Model of Personality -- edge-compatible port
 *
 * Five words. Five primitives. One God Formula.
 *   Try, choose, commit, let go, learn.
 *
 * Pure math -- no external dependencies. Runs on any JS runtime.
 */

export const PHI = (1 + Math.sqrt(5)) / 2;
export const PHI_INV = PHI - 1;

export interface PersonalityProfile {
  readonly try_: number;
  readonly choose: number;
  readonly commit: number;
  readonly letGo: number;
  readonly learn: number;
}

export interface PersonalityBules {
  readonly try_: number;
  readonly choose: number;
  readonly commit: number;
  readonly letGo: number;
  readonly learn: number;
  readonly total: number;
  readonly mean: number;
  readonly max: number;
  readonly spike: keyof PersonalityProfile | null;
}

export interface PersonalityTrainingParams {
  readonly eta: number;
  readonly temperature: number;
  readonly commitGain: number;
  readonly decayRate: number;
  readonly feedbackGain: number;
}

export type PersonalityTimescale =
  | 'generational'
  | 'lifetime'
  | 'years'
  | 'months'
  | 'weeks'
  | 'minutes'
  | 'instant';

export interface PersonalityLayer {
  readonly layer: number;
  readonly name: string;
  readonly timescale: PersonalityTimescale;
  readonly attenuation: number;
  rejections: Map<number, number>;
  totalRejections: number;
}

export interface PersonalityStack {
  readonly profile: PersonalityProfile;
  readonly layers: PersonalityLayer[];
}

export interface PersonalityTrainingConfig {
  profile: PersonalityProfile;
  useStack: boolean;
  applyToComplement: boolean;
  applyToCurriculum: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function measureBules(profile: PersonalityProfile): PersonalityBules {
  const bules = {
    try_: Math.abs(profile.try_ - PHI_INV),
    choose: Math.abs(profile.choose - PHI_INV),
    commit: Math.abs(profile.commit - PHI_INV),
    letGo: Math.abs(profile.letGo - PHI_INV),
    learn: Math.abs(profile.learn - PHI_INV),
  };

  const values = [
    bules.try_,
    bules.choose,
    bules.commit,
    bules.letGo,
    bules.learn,
  ];
  const keys: (keyof PersonalityProfile)[] = [
    'try_',
    'choose',
    'commit',
    'letGo',
    'learn',
  ];
  const total = values.reduce((a, b) => a + b, 0);
  const maxVal = Math.max(...values);
  const maxIdx = values.indexOf(maxVal);

  return {
    ...bules,
    total,
    mean: total / 5,
    max: maxVal,
    spike: maxVal > 0.1 ? keys[maxIdx] : null,
  };
}

export function deriveTrainingParams(
  profile: PersonalityProfile
): PersonalityTrainingParams {
  const etaBase = 5.0;
  const eta = clamp(
    etaBase * (1 - (profile.try_ - PHI_INV) * 1.5),
    1.0,
    10.0
  );
  const temperature = clamp(1.0 / Math.max(profile.choose, 0.01), 0.1, 3.0);
  const commitGain = clamp(profile.commit * (1 / PHI_INV), 0.1, 3.0);
  const decayRate = clamp(profile.letGo * 0.5, 0.0, 0.5);
  const feedbackGain = clamp(profile.learn * (1 / PHI_INV), 0.1, 2.0);

  return { eta, temperature, commitGain, decayRate, feedbackGain };
}

/**
 * Apply personality parameters to a complement distribution.
 */
export function personalityWeightedComplement(
  rejectionCounts: Map<number, number>,
  totalRejections: number,
  vocabSize: number,
  params: PersonalityTrainingParams
): Map<number, number> {
  if (totalRejections === 0) return new Map();

  const T = totalRejections;
  const dist = new Map<number, number>();

  const effectiveCounts = new Map<number, number>();
  for (const [tokenId, count] of rejectionCounts) {
    const effective = count * params.commitGain * (1 - params.decayRate);
    if (effective > 0) {
      effectiveCounts.set(tokenId, effective);
    }
  }

  const weights = new Map<number, number>();
  let totalWeight = 0;

  const nRejected = effectiveCounts.size;
  const nUnrejected = vocabSize - nRejected;
  totalWeight += nUnrejected; // unrejected weight = 1.0

  for (const [tokenId, effectiveCount] of effectiveCounts) {
    const normalizedCount = effectiveCount / Math.max(T, 1);
    const w = Math.exp(-params.eta * normalizedCount);
    weights.set(tokenId, w);
    totalWeight += w;
  }

  if (totalWeight === 0) return new Map();

  const uniformProb = 1 / vocabSize;
  for (const [tokenId, w] of weights) {
    const rawProb = w / totalWeight;
    const prob = uniformProb + (rawProb - uniformProb) * params.feedbackGain;
    if (Math.abs(prob - uniformProb) > 1e-12) {
      dist.set(tokenId, Math.max(prob, 1e-15));
    }
  }

  return dist;
}

export const DEFAULT_LAYER_CONFIG: Omit<
  PersonalityLayer,
  'rejections' | 'totalRejections'
>[] = [
  { layer: 1, name: 'Temperament', timescale: 'lifetime', attenuation: 0.01 },
  { layer: 2, name: 'Attachment', timescale: 'lifetime', attenuation: 0.01 },
  { layer: 3, name: 'Traits', timescale: 'years', attenuation: 0.1 },
  { layer: 4, name: 'Behaviors', timescale: 'months', attenuation: 0.8 },
  {
    layer: 5,
    name: 'Mental Health',
    timescale: 'weeks',
    attenuation: 1.5,
  },
  { layer: 6, name: 'History', timescale: 'years', attenuation: 0.1 },
  {
    layer: 7,
    name: 'Culture',
    timescale: 'generational',
    attenuation: 0.01,
  },
];

export function createPersonalityStack(
  profile: PersonalityProfile
): PersonalityStack {
  const layers: PersonalityLayer[] = DEFAULT_LAYER_CONFIG.map((config) => ({
    ...config,
    rejections: new Map(),
    totalRejections: 0,
  }));

  return { profile, layers };
}

export function propagateRejection(
  stack: PersonalityStack,
  tokenId: number,
  rejectionCount: number
): void {
  for (const layer of stack.layers) {
    const attenuated = Math.round(rejectionCount * layer.attenuation);
    if (attenuated > 0) {
      const prev = layer.rejections.get(tokenId) ?? 0;
      layer.rejections.set(tokenId, prev + attenuated);
      layer.totalRejections += attenuated;
    }
  }
}

export const BALANCED_PROFILE: PersonalityProfile = {
  try_: PHI_INV,
  choose: PHI_INV,
  commit: PHI_INV,
  letGo: PHI_INV,
  learn: PHI_INV,
};

export const PERSONALITY_PRESETS = {
  explorer: {
    try_: 0.9,
    choose: PHI_INV,
    commit: 0.4,
    letGo: 0.7,
    learn: 0.85,
  } satisfies PersonalityProfile,
  builder: {
    try_: 0.5,
    choose: 0.8,
    commit: 0.9,
    letGo: 0.4,
    learn: PHI_INV,
  } satisfies PersonalityProfile,
  resilient: {
    try_: PHI_INV,
    choose: PHI_INV,
    commit: PHI_INV,
    letGo: 0.85,
    learn: 0.7,
  } satisfies PersonalityProfile,
  creative: {
    try_: 0.95,
    choose: 0.4,
    commit: 0.3,
    letGo: 0.8,
    learn: 0.9,
  } satisfies PersonalityProfile,
  anxious: {
    try_: 0.3,
    choose: 0.5,
    commit: 0.7,
    letGo: 0.15,
    learn: 0.4,
  } satisfies PersonalityProfile,
} as const;

export const DEFAULT_PERSONALITY_CONFIG: PersonalityTrainingConfig = {
  profile: BALANCED_PROFILE,
  useStack: false,
  applyToComplement: true,
  applyToCurriculum: true,
};

export function profileDistance(
  a: PersonalityProfile,
  b: PersonalityProfile
): number {
  return Math.sqrt(
    (a.try_ - b.try_) ** 2 +
      (a.choose - b.choose) ** 2 +
      (a.commit - b.commit) ** 2 +
      (a.letGo - b.letGo) ** 2 +
      (a.learn - b.learn) ** 2
  );
}

export function totalBule(profile: PersonalityProfile): number {
  return profileDistance(profile, BALANCED_PROFILE);
}
