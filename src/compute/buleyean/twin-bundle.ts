import { z } from 'zod';
import { teleportationDeficit } from './metrics';
import type { Modality, TrainingLogEntry, UserAdapter } from '../../types';

const SparseTokenCountsSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().positive(),
]);

const BoundarySnapshotSchema = z
  .object({
    position: z.number().int().nonnegative(),
    rejections: z.array(SparseTokenCountsSchema),
    totalRejections: z.number().int().nonnegative(),
  })
  .strict();

const RejectionRecordSchema = z
  .object({
    prompt: z.string().min(1),
    rejectedResponses: z.array(z.string().min(1)),
    rejectionCounts: z.array(z.number().int().positive()),
    totalRounds: z.number().int().positive(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.rejectedResponses.length !== record.rejectionCounts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`rejectedResponses` and `rejectionCounts` must stay parallel.',
        path: ['rejectionCounts'],
      });
    }
  });

export const TwinBundleLikeSchema = z
  .object({
    subject: z
      .object({
        id: z.string().min(1),
      })
      .strict(),
    echolocation: z
      .object({
        rejectionRecords: z.array(RejectionRecordSchema),
        globalBoundary: BoundarySnapshotSchema,
        positionBoundaries: z.array(BoundarySnapshotSchema),
      })
      .strict(),
  })
  .strict();

export type TwinBundleLike = z.infer<typeof TwinBundleLikeSchema>;

export interface TwinBundleTrainerState {
  rejections: Array<[number, number]>;
  totalRounds: number;
  positionBoundaries: Array<{
    position: number;
    rejections: Array<[number, number]>;
    totalRejections: number;
  }>;
}

export interface TwinBundleAdapterSnapshot {
  adapterId: string;
  modelId: string;
  userId: string;
  modality: Modality;
  adapterType: 'reward_head';
  canonicalTrainingTarget: 'buleyean-void';
  trainerState: TwinBundleTrainerState;
  weights: ArrayBuffer;
  trainingExamples: number;
  trainingLogSeeds: Array<Pick<TrainingLogEntry, 'adapterId' | 'messageHash' | 'feedback' | 'createdAt'>>;
  teleportation: {
    totalRejections: number;
    estimatedDeficit: number;
    feasible: boolean;
    privateDimensions: number;
  };
  userAdapter: UserAdapter;
}

export interface TwinBundleMaterializationOptions {
  modelId?: string;
  modality?: Modality;
  privateDataDimensions?: number;
  createdAt?: string;
}

export interface TwinBundleWritePlan {
  adapter: UserAdapter;
  trainingLogs: Array<Pick<TrainingLogEntry, 'adapterId' | 'messageHash' | 'feedback' | 'createdAt'>>;
  artifactPayloads: {
    rejectionRecordsJson: string;
    trainerStateJson: string;
  };
  snapshot: TwinBundleAdapterSnapshot;
}

const DEFAULT_MODEL_ID = 'dash-d1-void';
const DEFAULT_PRIVATE_DIMENSIONS = 512;
const DEFAULT_CREATED_AT = '1970-01-01T00:00:00.000Z';

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function encodeTrainerState(trainerState: TwinBundleTrainerState): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(trainerState));
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  );
}

export function materializeTwinBundleTrainerState(
  bundleInput: TwinBundleLike
): TwinBundleTrainerState {
  const bundle = TwinBundleLikeSchema.parse(bundleInput);

  return {
    rejections: bundle.echolocation.globalBoundary.rejections,
    totalRounds: bundle.echolocation.globalBoundary.totalRejections,
    positionBoundaries: bundle.echolocation.positionBoundaries.map((boundary) => ({
      position: boundary.position,
      rejections: boundary.rejections,
      totalRejections: boundary.totalRejections,
    })),
  };
}

export async function materializeTwinBundleAdapter(
  bundleInput: TwinBundleLike,
  options: TwinBundleMaterializationOptions = {}
): Promise<TwinBundleAdapterSnapshot> {
  const bundle = TwinBundleLikeSchema.parse(bundleInput);
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const modality = options.modality ?? 'text';
  const privateDataDimensions =
    options.privateDataDimensions ?? DEFAULT_PRIVATE_DIMENSIONS;
  const createdAt = options.createdAt ?? DEFAULT_CREATED_AT;
  const trainerState = materializeTwinBundleTrainerState(bundle);
  const adapterId = `${modelId}:${bundle.subject.id}:${modality}:buleyean`;
  const trainingLogSeeds = await Promise.all(
    bundle.echolocation.rejectionRecords.flatMap((record) =>
      record.rejectedResponses.map(async (response, index) => ({
        adapterId,
        messageHash: await sha256Hex(
          `${record.prompt}:${response}:${record.rejectionCounts[index] ?? 1}`
        ),
        feedback: -1,
        createdAt,
      }))
    )
  );
  const estimatedDeficit = teleportationDeficit({
    position: 0,
    rejections: new Map(trainerState.rejections),
    totalRejections: trainerState.totalRounds,
  });
  const weights = encodeTrainerState(trainerState);
  const userAdapter: UserAdapter = {
    id: adapterId,
    modelId,
    userId: bundle.subject.id,
    adapterType: 'reward_head',
    weights,
    trainingExamples: bundle.echolocation.rejectionRecords.length,
    lastUpdated: createdAt,
  };

  return {
    adapterId,
    modelId,
    userId: bundle.subject.id,
    modality,
    adapterType: 'reward_head',
    canonicalTrainingTarget: 'buleyean-void',
    trainerState,
    weights,
    trainingExamples: bundle.echolocation.rejectionRecords.length,
    trainingLogSeeds,
    teleportation: {
      totalRejections: trainerState.totalRounds,
      estimatedDeficit,
      feasible:
        trainerState.totalRounds > 0 &&
        estimatedDeficit <= privateDataDimensions / 2,
      privateDimensions: privateDataDimensions,
    },
    userAdapter,
  };
}

export async function buildTwinBundleWritePlan(
  bundleInput: TwinBundleLike,
  options: TwinBundleMaterializationOptions = {}
): Promise<TwinBundleWritePlan> {
  const bundle = TwinBundleLikeSchema.parse(bundleInput);
  const snapshot = await materializeTwinBundleAdapter(bundle, options);

  return {
    adapter: snapshot.userAdapter,
    trainingLogs: snapshot.trainingLogSeeds,
    artifactPayloads: {
      rejectionRecordsJson: JSON.stringify(bundle.echolocation.rejectionRecords),
      trainerStateJson: JSON.stringify(snapshot.trainerState),
    },
    snapshot,
  };
}
