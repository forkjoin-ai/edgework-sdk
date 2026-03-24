/**
 * The God Formula as training target -- edge-compatible port
 *
 *   w_i = R - min(v_i, R) + 1
 *
 * No external dependencies. Pure math for on-device RL.
 */

import type {
  RejectionRecord,
  BuleyeanTarget,
  TokenVoidBoundary,
  BuleyeanTrainingConfig,
} from './types';

export interface Tokenizer {
  encode(text: string): number[];
  vocabSize: number;
}

/**
 * Build per-position token void boundaries from a rejection record.
 */
export function buildTokenVoidBoundaries(
  record: RejectionRecord,
  tokenizer: Tokenizer
): TokenVoidBoundary[] {
  const tokenizedRejections: { tokenIds: number[]; count: number }[] = [];
  for (let i = 0; i < record.rejectedResponses.length; i++) {
    tokenizedRejections.push({
      tokenIds: tokenizer.encode(record.rejectedResponses[i]),
      count: record.rejectionCounts[i],
    });
  }

  const maxLen = Math.max(
    ...tokenizedRejections.map((r) => r.tokenIds.length)
  );
  if (maxLen === 0) return [];

  const boundaries: TokenVoidBoundary[] = [];
  for (let pos = 0; pos < maxLen; pos++) {
    const rejections = new Map<number, number>();
    let totalRejections = 0;

    for (const { tokenIds, count } of tokenizedRejections) {
      if (pos < tokenIds.length) {
        const tokenId = tokenIds[pos];
        const prev = rejections.get(tokenId) ?? 0;
        rejections.set(tokenId, prev + count);
        totalRejections += count;
      }
    }

    boundaries.push({ position: pos, rejections, totalRejections });
  }

  return boundaries;
}

/**
 * Compute the Buleyean complement distribution at a single position.
 *
 * Rejected tokens: weight = T - v_i + 1
 * Never-rejected tokens: weight = T + 1 (maximum -- the sliver)
 */
export function computeComplementDistribution(
  boundary: TokenVoidBoundary,
  vocabSize: number,
  config: Pick<BuleyeanTrainingConfig, 'temperature' | 'minRejectionCount'>
): Map<number, number> {
  const T = boundary.totalRejections;
  if (T === 0) return new Map();

  const dist = new Map<number, number>();

  let rejectedTokenCount = 0;
  for (const [, count] of boundary.rejections) {
    if (count >= config.minRejectionCount) {
      rejectedTokenCount++;
    }
  }

  if (rejectedTokenCount === 0) return new Map();

  const neverRejectedWeight = T + 1;
  const neverRejectedCount = vocabSize - rejectedTokenCount;

  let totalWeight = neverRejectedCount * neverRejectedWeight;
  const rejectedWeights = new Map<number, number>();

  for (const [tokenId, count] of boundary.rejections) {
    if (count >= config.minRejectionCount) {
      const w = T - Math.min(count, T) + 1;
      rejectedWeights.set(tokenId, w);
      totalWeight += w;
    } else {
      totalWeight += neverRejectedWeight;
    }
  }

  if (totalWeight === 0) return new Map();

  const temp = config.temperature;

  for (const [tokenId, w] of rejectedWeights) {
    const rawProb = w / totalWeight;
    const uniformProb = 1 / vocabSize;
    const prob = temp === 1.0 ? rawProb : Math.pow(rawProb, 1 / temp);
    if (Math.abs(prob - uniformProb) > 1e-12) {
      dist.set(tokenId, prob);
    }
  }

  return dist;
}

/**
 * Build a complete BuleyeanTarget from a rejection record.
 */
export function buildBuleyeanTarget(
  record: RejectionRecord,
  tokenizer: Tokenizer,
  config: BuleyeanTrainingConfig
): BuleyeanTarget {
  const promptTokenIds = tokenizer.encode(record.prompt);
  const positionBoundaries = buildTokenVoidBoundaries(record, tokenizer);
  const complementDistributions = positionBoundaries.map((boundary) =>
    computeComplementDistribution(boundary, tokenizer.vocabSize, config)
  );

  return {
    prompt: record.prompt,
    promptTokenIds,
    positionBoundaries,
    complementDistributions,
    vocabSize: tokenizer.vocabSize,
  };
}
