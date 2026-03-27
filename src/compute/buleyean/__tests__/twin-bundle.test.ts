import { describe, expect, test } from 'bun:test';
import {
  buildTwinBundleWritePlan,
  materializeTwinBundleAdapter,
  materializeTwinBundleTrainerState,
} from '../index';

const bundle = {
  subject: {
    id: 'marcus-aurelius',
  },
  echolocation: {
    rejectionRecords: [
      {
        prompt: 'Assess whether this claim fits Marcus Aurelius.',
        rejectedResponses: ['Marcus Aurelius would tweet this as a startup hack.'],
        rejectionCounts: [9],
        totalRounds: 9,
      },
      {
        prompt: 'Assess whether this quote fits Marcus Aurelius.',
        rejectedResponses: ['"viral growth" is the authentic Roman phrasing.'],
        rejectionCounts: [7],
        totalRounds: 7,
      },
    ],
    globalBoundary: {
      position: 0,
      rejections: [
        [11, 9],
        [42, 7],
      ] as Array<[number, number]>,
      totalRejections: 16,
    },
    positionBoundaries: [
      {
        position: 0,
        rejections: [
          [11, 9],
          [42, 7],
        ] as Array<[number, number]>,
        totalRejections: 16,
      },
    ],
  },
};

describe('twin bundle materialization', () => {
  test('materializeTwinBundleTrainerState preserves sparse boundaries', () => {
    const trainerState = materializeTwinBundleTrainerState(bundle);

    expect(trainerState.rejections).toEqual(bundle.echolocation.globalBoundary.rejections);
    expect(trainerState.totalRounds).toBe(16);
    expect(trainerState.positionBoundaries[0]?.position).toBe(0);
  });

  test('materializeTwinBundleAdapter emits reward-head compatible adapter plus canonical target', async () => {
    const snapshot = await materializeTwinBundleAdapter(bundle, {
      modelId: 'dash-d1-test',
      privateDataDimensions: 32,
    });

    expect(snapshot.adapterId).toBe('dash-d1-test:marcus-aurelius:text:buleyean');
    expect(snapshot.adapterType).toBe('reward_head');
    expect(snapshot.canonicalTrainingTarget).toBe('buleyean-void');
    expect(snapshot.trainingExamples).toBe(2);
    expect(snapshot.trainingLogSeeds.length).toBe(2);
    expect(snapshot.userAdapter.trainingExamples).toBe(2);
  });

  test('buildTwinBundleWritePlan returns storage-facing payloads without performing writes', async () => {
    const plan = await buildTwinBundleWritePlan(bundle, {
      modelId: 'dash-d1-test',
      privateDataDimensions: 32,
    });

    expect(plan.adapter.id).toBe('dash-d1-test:marcus-aurelius:text:buleyean');
    expect(plan.trainingLogs.length).toBe(2);
    expect(plan.artifactPayloads.rejectionRecordsJson).toContain('startup hack');
    expect(plan.artifactPayloads.trainerStateJson).toContain('"totalRounds":16');
  });
});
