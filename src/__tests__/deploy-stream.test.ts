import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import {
  fetchAppByCid,
  smokeTestSite,
  streamProcess,
  streamProcessAnthropicMessages,
  streamProcessOpenAIChat,
} from '../deploy';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('deploy stream helpers', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('streams generic process SSE events', async () => {
    const fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://demo.edgework.ai/stream');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer ew_explicit_key');
      return sseResponse([
        'event: update\n',
        'data: {"type":"text","chunk":"hi"}\n\n',
      ]);
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const stream = await streamProcess(
      'demo',
      {
        text: 'hello',
        format: 'text',
      },
      {
        apiKey: 'ew_explicit_key',
      }
    );

    const events = [];
    for await (const evt of stream) {
      events.push(evt);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('update');
    expect((events[0].json as { type: string }).type).toBe('text');
  });

  it('streams OpenAI-compatible process events', async () => {
    globalThis.fetch = jest.fn(async () =>
      sseResponse([
        'data: {"id":"chatcmpl-1","object":"text_completion.chunk"}\n\n',
        'data: [DONE]\n\n',
      ])
    ) as unknown as typeof globalThis.fetch;

    const stream = await streamProcessOpenAIChat('demo', {
      model: 'mistral-7b',
      messages: [{ role: 'user', content: 'hello' }],
    });

    const events = [];
    for await (const evt of stream) {
      events.push(evt);
    }

    expect(events).toHaveLength(2);
    expect((events[0].json as { object: string }).object).toBe(
      'text_completion.chunk'
    );
    expect(events[1].data).toBe('[DONE]');
    expect(events[1].json).toBeUndefined();
  });

  it('streams Anthropic-compatible process events', async () => {
    globalThis.fetch = jest.fn(async () =>
      sseResponse([
        'data: {"type":"content_block_start"}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ])
    ) as unknown as typeof globalThis.fetch;

    const stream = await streamProcessAnthropicMessages('demo', {
      model: 'claude-like',
      messages: [{ role: 'user', content: 'hello' }],
    });

    const events = [];
    for await (const evt of stream) {
      events.push(evt);
    }

    expect(events).toHaveLength(2);
    expect((events[0].json as { type: string }).type).toBe(
      'content_block_start'
    );
    expect((events[1].json as { type: string }).type).toBe('message_stop');
  });

  it('throws on non-2xx process response', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response('not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        })
    ) as unknown as typeof globalThis.fetch;

    await expect(
      streamProcess('missing-process', { text: 'hello' })
    ).rejects.toThrow('Process request failed (404): not found');
  });

  it('throws clear 401 auth errors for process streams', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
    ) as unknown as typeof globalThis.fetch;

    await expect(
      streamProcess('demo', { text: 'hello' }, { apiKey: 'ew_bad_key' })
    ).rejects.toThrow(
      'Process request failed (401): {"error":"Invalid API key"}'
    );
  });

  it('throws clear 402 credit errors for process streams', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ error: 'insufficient_credits' }), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        })
    ) as unknown as typeof globalThis.fetch;

    await expect(
      streamProcessOpenAIChat(
        'demo',
        {
          model: 'mistral-7b',
          messages: [{ role: 'user', content: 'hello' }],
        },
        { apiKey: 'ew_low_balance' }
      )
    ).rejects.toThrow(
      'Process request failed (402): {"error":"insufficient_credits"}'
    );
  });

  it('fetches app by cid through AeonPID proxy endpoint', async () => {
    globalThis.fetch = jest.fn(async (url: string | URL) => {
      expect(String(url)).toBe(
        'https://api.edgework.ai/v1/aeon-deploy/abc123/app?path=%2F'
      );
      return new Response('<html>ok</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof globalThis.fetch;

    const response = await fetchAppByCid('abc123');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('ok');
  });

  it('passes smoke test when site returns typical HTML', async () => {
    globalThis.fetch = jest.fn(async (url: string | URL) => {
      const resolved = String(url);
      if (resolved.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ready' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (resolved.endsWith('/probe')) {
        return new Response(JSON.stringify({ status: 'exists' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('<!DOCTYPE html><html><body>ok</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof globalThis.fetch;

    const result = await smokeTestSite('demo');
    expect(result.ok).toBe(true);
    expect(result.legacyRedirectDetected).toBe(false);
    expect(result.status).toBe(200);
  });

  it('fails smoke test on HTTP redirect to workers.dev', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://halos-agency.taylorbuley.workers.dev/' },
      });
    }) as unknown as typeof globalThis.fetch;

    const result = await smokeTestSite('demo');
    expect(result.ok).toBe(false);
    expect(result.legacyRedirectDetected).toBe(true);
    expect(result.details).toContain('workers.dev');
  });

  it('fails smoke test on client-side redirect stubs to workers.dev', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(
        `<!DOCTYPE html><script>window.location.href = 'https://halos-agency.taylorbuley.workers.dev' + window.location.pathname;</script>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }) as unknown as typeof globalThis.fetch;

    const result = await smokeTestSite('demo');
    expect(result.ok).toBe(false);
    expect(result.legacyRedirectDetected).toBe(true);
    expect(result.details).toContain('client-side redirect');
  });

  it('fails smoke test on proxy-origin workers.dev leakage', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response('<!DOCTYPE html><html><body>ok</body></html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Aeon-Proxy-Origin': 'https://halos-agency.taylorbuley.workers.dev',
        },
      });
    }) as unknown as typeof globalThis.fetch;

    const result = await smokeTestSite('demo');
    expect(result.ok).toBe(false);
    expect(result.legacyRedirectDetected).toBe(true);
    expect(result.details).toContain('workers.dev');
    expect(result.details).toContain('Proxy origin');
  });
});
