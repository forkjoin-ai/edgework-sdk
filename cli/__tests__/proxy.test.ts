import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { handleProxyRequest } from '../proxy-handler.js';

let lastCreateChatBody: unknown = null;

// Mock fetch globally to prevent real network calls
globalThis.fetch = mock(async (input: RequestInfo | URL) => {
  const url =
    typeof input === 'string' ? input : (input as Request).url || String(input);

  if (url.includes('/v1/chat/completions')) {
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-mock',
        created: 1234567890,
        model: 'gpt-4o',
        choices: [
          {
            message: { content: 'Mock Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { total_tokens: 10 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.includes('/v1/models')) {
    return new Response(
      JSON.stringify({
        data: [
          {
            id: 'gpt-4o',
            created: 1677610602,
            object: 'model',
            owned_by: 'openai',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response('Not Found', { status: 404 });
});

mock.module('../../src/compute/gateway/index.js', () => ({
  createChatCompletion: async ({ body }: any) => {
    lastCreateChatBody = body;
    if (body.model === 'error-model') {
      return { error: { message: 'Mock Error' } };
    }
    return {
      data: {
        id: 'chatcmpl-mock',
        created: 1234567890,
        model: body.model || 'gpt-4o',
        choices: [
          {
            message: { content: 'Mock Response', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { total_tokens: 10 },
      },
    };
  },
  listModels: async () => ({
    data: {
      data: [
        {
          id: 'gpt-4o',
          created: 1677610602,
          object: 'model',
          owned_by: 'openai',
        },
      ],
    },
  }),
  createEmbeddings: async () => ({ data: { data: [] } }),
}));

mock.module('../../src/compute/gateway/client.gen.js', () => ({
  client: {
    setConfig: () => {},
  },
}));

mock.module('../../src/compute/gateway/sdk.gen.js', () => ({}));

describe('Edgework Proxy', () => {
  it('should handle CORS preflight (OPTIONS)', async () => {
    const req = new Request('http://localhost:11420/v1/chat/completions', {
      method: 'OPTIONS',
    });
    const res = await handleProxyRequest(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should return health check (GET /health)', async () => {
    const req = new Request('http://localhost:11420/health');
    const res = await handleProxyRequest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.uptime).toBeDefined();
  });

  it('should list models in Ollama format (GET /api/tags)', async () => {
    const req = new Request('http://localhost:11420/api/tags');
    const res = await handleProxyRequest(req);
    if (res.status === 500) {
      console.log('500 Error Payload:', await res.json());
    }
    expect(res.status).toBe(200);
    const json = await res.json();
    // Check for Ollama structure
    expect(json.models).toBeArray();
    expect(json.models[0].name).toBe('gpt-4o');
    expect(json.models[0].details.family).toBe('llama'); // Our hardcoded mock details
  });

  it('should handle Ollama chat (POST /api/chat)', async () => {
    const req = new Request('http://localhost:11420/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'mistral',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });
    const res = await handleProxyRequest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Should map back to standard response as per our implementation
    expect(json.id).toBe('chatcmpl-mock');
  });

  it('should handle Aeon multimodal completions alias (POST /v1/aeon/completions)', async () => {
    const req = new Request('http://localhost:11420/v1/aeon/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'auto',
        prompt: 'summarize this image',
        attachments: [
          {
            type: 'image',
            url: 'https://example.com/r1.png',
          },
        ],
      }),
    });
    const res = await handleProxyRequest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('chatcmpl-mock');

    const forwarded = lastCreateChatBody as {
      messages?: Array<{ role?: string; content?: unknown }>;
    } | null;
    const messages = forwarded?.messages ?? [];
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBeArray();
  });

  it('should handle Copilot Token (GET /copilot_internal/v2/token)', async () => {
    const req = new Request('http://localhost:11420/copilot_internal/v2/token');
    const res = await handleProxyRequest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toContain('tid=');
    expect(json.expires_at).toBeGreaterThan(0);
  });

  it('should handle Copilot Legacy Completions (POST .../completions)', async () => {
    const req = new Request(
      'http://localhost:11420/v1/engines/copilot-codex/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'function foo() {',
          suffix: '}',
          max_tokens: 50,
          temperature: 0.1,
        }),
      }
    );
    const res = await handleProxyRequest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Check legacy format
    expect(json.choices[0].text).toBe('Mock Response');
    expect(json.choices[0].index).toBe(0);
  });
});
