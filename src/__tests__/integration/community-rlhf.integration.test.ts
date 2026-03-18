import { describe, expect, it, mock } from 'bun:test';
import type { FederatedSync } from '../../compute/rlhf/federated-sync';
import { RLHFTrainer } from '../../compute/rlhf/trainer';
import { MemoryStorage } from '../../data/storage/memory-storage';

const hiddenState = (): Float32Array =>
  new Float32Array([0.25, -0.5, 0.75, 0.1]);

describe('Community RLHF Integration', () => {
  it('stores modality-specific adapters', async () => {
    const storage = new MemoryStorage();
    await storage.initialize();

    const trainer = new RLHFTrainer({
      storage,
      modelId: 'community-base',
      userId: 'device-a',
      hiddenDim: 4,
      modality: 'translation',
      batchSize: 1,
    });

    await trainer.initialize();
    await trainer.recordFeedback({
      messageHash: 'msg-1',
      feedback: 1,
      hiddenState: hiddenState(),
    });

    const translationAdapterId = 'community-base:device-a:translation:reward';
    const textAdapterId = 'community-base:device-a:text:reward';

    const translationAdapter = await storage.getUserAdapter(
      'community-base',
      'device-a',
      translationAdapterId
    );
    const textAdapter = await storage.getUserAdapter(
      'community-base',
      'device-a',
      textAdapterId
    );

    expect(translationAdapter).not.toBeNull();
    expect(translationAdapter?.id).toBe(translationAdapterId);
    expect(translationAdapter?.trainingExamples).toBe(1);
    expect(textAdapter).toBeNull();
  });

  it('builds a gradient envelope with modality metadata', async () => {
    const storage = new MemoryStorage();
    await storage.initialize();

    const trainer = new RLHFTrainer({
      storage,
      modelId: 'community-base',
      userId: 'device-b',
      hiddenDim: 4,
      modality: 'stt',
      batchSize: 1,
    });

    await trainer.initialize();
    await trainer.recordFeedback({
      messageHash: 'msg-2',
      feedback: 1,
      hiddenState: hiddenState(),
    });

    const envelope = trainer.toGradientEnvelope('device-proof', 'seed-42');
    expect(envelope.modality).toBe('stt');
    expect(envelope.modelId).toBe('community-base');
    expect(envelope.baseVersion).toBe('local-v1');
    expect(envelope.deviceProof).toBe('device-proof');
    expect(envelope.dpNoiseSeedId).toBe('seed-42');
    expect(envelope.clippedDelta).toBeInstanceOf(ArrayBuffer);
  });

  it('syncs updates only when community participation is enabled', async () => {
    const storage = new MemoryStorage();
    await storage.initialize();

    const syncMock = mock(async (_payload: unknown) => null);
    const federatedSync = {
      sync: syncMock,
    } as unknown as FederatedSync;

    const trainer = new RLHFTrainer({
      storage,
      modelId: 'community-base',
      userId: 'device-c',
      hiddenDim: 4,
      modality: 'text',
      batchSize: 1,
      federatedSync,
      communityParticipation: false,
    });

    await trainer.initialize();
    await trainer.recordFeedback({
      messageHash: 'msg-3',
      feedback: 1,
      hiddenState: hiddenState(),
    });

    await trainer.syncUpdates();
    expect(syncMock).toHaveBeenCalledTimes(0);

    trainer.setCommunityParticipation(true);
    await trainer.syncUpdates();

    expect(syncMock).toHaveBeenCalledTimes(1);
    const payload = syncMock.mock.calls[0]?.[0] as
      | { modality: string; modelId: string }
      | undefined;
    expect(payload).toBeDefined();
    if (!payload) {
      throw new Error('Expected sync payload argument');
    }
    expect(payload.modality).toBe('text');
    expect(payload.modelId).toBe('community-base');
  });
});
