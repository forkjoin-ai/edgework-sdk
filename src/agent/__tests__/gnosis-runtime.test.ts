import { describe, it, expect, mock } from 'bun:test';
import { GnosisClientRuntime } from '../core';

describe('GnosisClientRuntime', () => {
  it('records PROCESS events', async () => {
    const runtime = new GnosisClientRuntime('test-runtime');
    const value = await runtime.process('unit-process', async () => 'ok');
    expect(value).toBe('ok');

    const events = runtime.getTrace();
    expect(events.some((event) => event.primitive === 'PROCESS')).toBe(true);
  });

  it('executes RACE with the fastest successful branch', async () => {
    const runtime = new GnosisClientRuntime('race-runtime');
    const { winnerId, value } = await runtime.race('unit-race', [
      {
        id: 'slow',
        run: async () =>
          new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 20)),
      },
      {
        id: 'fast',
        run: async () => 'fast',
      },
    ]);

    expect(winnerId).toBe('fast');
    expect(value).toBe('fast');
  });

  it('executes FOLD with reducer output', async () => {
    const runtime = new GnosisClientRuntime('fold-runtime');
    const folded = await runtime.fold(
      'unit-fold',
      [
        { id: 'a', run: async () => 2 },
        { id: 'b', run: async () => 3 },
      ],
      async (results) =>
        results.reduce((total, entry) => total + entry.value, 0)
    );

    expect(folded).toBe(5);
  });

  it('supports fetchJson compatibility wrapper', async () => {
    const runtime = new GnosisClientRuntime('fetch-runtime');
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => {
      const responseBody = JSON.stringify({ ok: true });
      return new Response(responseBody, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const result = await runtime.fetchJson<{ ok: boolean }>('fetch-node', {
        url: 'https://example.test/data',
        init: { method: 'GET' },
      });
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
