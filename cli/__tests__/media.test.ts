import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test';

// Mock ora spinner (unresolvable in test environment)
mock.module('@emotions-app/shared-utils/cli/spinner', () => {
  const spinner = {
    start: () => spinner,
    stop: () => spinner,
    succeed: () => spinner,
    fail: () => spinner,
    warn: () => spinner,
    info: () => spinner,
    text: '',
  };
  return { default: () => spinner };
});

// Mock edgework API key resolver (may have unresolvable transitive deps)
mock.module('../src/edgework-api-key', () => ({
  resolveEdgeworkApiKey: () => 'mock-api-key',
}));

const {
  evaluateModelReadiness,
  extractFirstGenerationItem,
  getImageModelCandidates,
  getVideoModelCandidates,
  isLikelyStaticNoiseMetrics,
  isProceduralVideoPayload,
  resolveCliUserId,
  resolveEdgeBaseUrl,
  resolveGenerationBytes,
  stripDataUriPrefix,
} = await import('../media');

describe('media CLI helpers', () => {
  const originalEdgeUrl = process.env.EDGE_URL;
  const originalUserId = process.env.USER_ID;
  const originalUser = process.env.USER;

  beforeEach(() => {
    delete process.env.EDGE_URL;
    delete process.env.USER_ID;
    delete process.env.USER;
  });

  afterEach(() => {
    if (typeof originalEdgeUrl === 'string') {
      process.env.EDGE_URL = originalEdgeUrl;
    } else {
      delete process.env.EDGE_URL;
    }

    if (typeof originalUserId === 'string') {
      process.env.USER_ID = originalUserId;
    } else {
      delete process.env.USER_ID;
    }

    if (typeof originalUser === 'string') {
      process.env.USER = originalUser;
    } else {
      delete process.env.USER;
    }
  });

  test('resolveEdgeBaseUrl uses explicit value first', () => {
    process.env.EDGE_URL = 'https://from-env.example';
    expect(resolveEdgeBaseUrl('https://explicit.example/')).toBe(
      'https://explicit.example'
    );
  });

  test('resolveEdgeBaseUrl falls back to EDGE_URL env', () => {
    process.env.EDGE_URL = 'https://edge-env.example/';
    expect(resolveEdgeBaseUrl()).toBe('https://edge-env.example');
  });

  test('resolveCliUserId uses explicit value then env then shell user', () => {
    expect(resolveCliUserId('abc')).toBe('abc');

    process.env.USER_ID = 'env-user-id';
    expect(resolveCliUserId()).toBe('env-user-id');

    delete process.env.USER_ID;
    process.env.USER = 'shell-user';
    expect(resolveCliUserId()).toBe('shell-user-cli');
  });

  test('stripDataUriPrefix trims data URI wrapper', () => {
    expect(stripDataUriPrefix('data:image/png;base64,QUJD')).toBe('QUJD');
    expect(stripDataUriPrefix('QUJD')).toBe('QUJD');
  });

  test('extractFirstGenerationItem finds b64_json payload', () => {
    const item = extractFirstGenerationItem({
      data: [{ b64_json: 'QUJD', revised_prompt: 'test prompt' }],
    });

    expect(item).toEqual({
      b64Json: 'QUJD',
      revisedPrompt: 'test prompt',
      url: undefined,
    });
  });

  test('resolveGenerationBytes decodes base64 content', async () => {
    const bytes = await resolveGenerationBytes({
      b64Json: 'QUJD',
    });

    expect(bytes.toString('utf-8')).toBe('ABC');
  });

  test('resolveGenerationBytes decodes data URI urls', async () => {
    const bytes = await resolveGenerationBytes({
      url: 'data:video/mp4;base64,QUJD',
    });

    expect(bytes.toString('utf-8')).toBe('ABC');
  });

  test('getImageModelCandidates preserves requested model id', () => {
    expect(getImageModelCandidates('stable-diffusion-xl-base-1.0')).toEqual([
      'stable-diffusion-xl-base-1.0',
    ]);
    expect(
      getImageModelCandidates('@cf/stabilityai/stable-diffusion-xl-base-1.0')
    ).toEqual(['@cf/stabilityai/stable-diffusion-xl-base-1.0']);
  });

  test('getImageModelCandidates returns single model for non-coordinator ids', () => {
    expect(getImageModelCandidates('ltx-2.3')).toEqual(['ltx-2.3']);
  });

  test('getImageModelCandidates normalizes whitespace', () => {
    expect(getImageModelCandidates('  stable-diffusion-xl-base-1.0  ')).toEqual(
      ['stable-diffusion-xl-base-1.0']
    );
    expect(getImageModelCandidates('  ssd-1b-lcm-int8  ')).toEqual([
      'ssd-1b-lcm-int8',
      'flux-4b',
    ]);
  });

  test('getImageModelCandidates auto mode probes canonical image lanes', () => {
    expect(getImageModelCandidates('auto')).toEqual([
      'ssd-1b-lcm-int8',
      'flux-4b',
    ]);
  });

  test('getVideoModelCandidates auto mode probes canonical video lanes', () => {
    expect(getVideoModelCandidates('auto')).toEqual([
      'ltx-video',
      'ltx-2.3',
      'stable-video-diffusion-img2vid-xt',
      'longcat-video',
      'bfs-face-swap-video',
      'smolvlm2-500m-video',
    ]);
  });

  test('getVideoModelCandidates keeps explicit non-default ids', () => {
    expect(getVideoModelCandidates('lightricks/ltx-video')).toEqual([
      'lightricks/ltx-video',
    ]);
  });

  test('evaluateModelReadiness returns ready for listed ready model', () => {
    const readiness = evaluateModelReadiness(
      {
        data: [
          {
            id: 'ltx-2.3',
            ready: true,
          },
        ],
      },
      'ltx-2.3'
    );
    expect(readiness).toEqual({ ready: true });
  });

  test('evaluateModelReadiness returns not ready reason for unready model', () => {
    const readiness = evaluateModelReadiness(
      {
        data: [
          {
            id: 'ltx-2.3',
            ready: false,
            status_code: 'MODEL_NOT_READY',
            status_message: 'coordinator timeout',
          },
        ],
      },
      'ltx-2.3'
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('MODEL_NOT_READY');
    expect(readiness.reason).toContain('coordinator timeout');
  });

  test('evaluateModelReadiness returns not listed when model missing', () => {
    const readiness = evaluateModelReadiness(
      {
        data: [{ id: 'other-model', ready: true }],
      },
      'ltx-2.3'
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain('not listed');
  });

  test('isLikelyStaticNoiseMetrics flags high-entropy high-correlation artifacts', () => {
    expect(
      isLikelyStaticNoiseMetrics({
        entropy: 6.6,
        correlationX: 0.97,
        correlationY: 0.96,
      })
    ).toBe(true);

    expect(
      isLikelyStaticNoiseMetrics({
        entropy: 6.35,
        correlationX: 0.968,
        correlationY: 0.971,
      })
    ).toBe(true);

    expect(
      isLikelyStaticNoiseMetrics({
        entropy: 5.86,
        correlationX: 0.959,
        correlationY: 0.961,
      })
    ).toBe(true);

    expect(
      isLikelyStaticNoiseMetrics({
        entropy: 5.2,
        correlationX: 0.97,
        correlationY: 0.96,
      })
    ).toBe(false);
  });

  test('isProceduralVideoPayload detects native procedural runtime metadata', () => {
    expect(
      isProceduralVideoPayload({
        model: 'ltx-2.3',
        inference_mode: 'model_backed',
        video: {
          pipeline: { metrics: {} },
          branch: 'cinematic-sweep',
          score: 0.91,
        },
      })
    ).toBe(true);

    expect(
      isProceduralVideoPayload({
        model: 'ltx-2.3',
        inference_mode: 'model_backed',
        video: {
          mime_type: 'video/mp4',
          width: 256,
          height: 256,
          num_frames: 8,
          pipeline: { metrics: {} },
          branch: 'cinematic-sweep',
          score: 0.91,
        },
      })
    ).toBe(true);
  });
});
