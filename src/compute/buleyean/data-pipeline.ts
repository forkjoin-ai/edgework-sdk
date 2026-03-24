/**
 * Data Pipeline -- edge-compatible port
 *
 * Convert existing datasets to God Formula input.
 * DPO pairs -> rejection records. Discard "chosen" entirely.
 */

import type { RejectionRecord, DPORecord, ConversionResult } from './types';

/**
 * Convert DPO preference pairs to Buleyean rejection records.
 * Discards "chosen" -- the complement distribution IS the target.
 */
export function convertDPOToRejections(
  dpoRecords: DPORecord[]
): ConversionResult {
  const promptMap = new Map<string, string[]>();
  let discardedChosenCount = 0;

  for (const record of dpoRecords) {
    const existing = promptMap.get(record.prompt) ?? [];
    existing.push(record.rejected);
    promptMap.set(record.prompt, existing);
    discardedChosenCount++;
  }

  const records: RejectionRecord[] = [];
  let totalRejections = 0;

  for (const [prompt, rejections] of promptMap) {
    const countMap = new Map<string, number>();
    for (const r of rejections) {
      countMap.set(r, (countMap.get(r) ?? 0) + 1);
    }

    const rejectedResponses = [...countMap.keys()];
    const rejectionCounts = rejectedResponses.map(
      (r) => countMap.get(r) ?? 1
    );
    const totalRounds = rejectionCounts.reduce((a, b) => a + b, 0);

    records.push({ prompt, rejectedResponses, rejectionCounts, totalRounds });
    totalRejections += totalRounds;
  }

  return {
    records,
    stats: {
      totalPrompts: records.length,
      totalRejections,
      avgRejectionsPerPrompt:
        records.length > 0 ? totalRejections / records.length : 0,
      discardedChosenCount,
    },
  };
}

/**
 * Parse a JSONL string of rejection records.
 */
export function parseRejectionJSONL(jsonlContent: string): RejectionRecord[] {
  const records: RejectionRecord[] = [];
  const lines = jsonlContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = JSON.parse(trimmed);
    records.push({
      prompt: parsed.prompt,
      rejectedResponses:
        parsed.rejectedResponses ?? parsed.rejected_responses ?? [],
      rejectionCounts:
        parsed.rejectionCounts ?? parsed.rejection_counts ?? [],
      totalRounds: parsed.totalRounds ?? parsed.total_rounds ?? 0,
      metadata: parsed.metadata,
    });
  }

  return records;
}

/**
 * Parse a JSONL string of DPO preference pairs.
 */
export function parseDPOJSONL(jsonlContent: string): DPORecord[] {
  const records: DPORecord[] = [];
  const lines = jsonlContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = JSON.parse(trimmed);
    const prompt =
      parsed.prompt ?? parsed.instruction ?? parsed.question ?? '';
    const chosen =
      parsed.chosen ?? parsed.chosen_response ?? parsed.preferred ?? '';
    const rejected =
      parsed.rejected ?? parsed.rejected_response ?? parsed.dispreferred ?? '';

    if (prompt && rejected) {
      records.push({ prompt, chosen, rejected });
    }
  }

  return records;
}

/**
 * Serialize rejection records to JSONL format.
 */
export function serializeRejectionJSONL(records: RejectionRecord[]): string {
  return records
    .map((r) =>
      JSON.stringify({
        prompt: r.prompt,
        rejected_responses: r.rejectedResponses,
        rejection_counts: r.rejectionCounts,
        total_rounds: r.totalRounds,
        ...(r.metadata ? { metadata: r.metadata } : {}),
      })
    )
    .join('\n');
}
