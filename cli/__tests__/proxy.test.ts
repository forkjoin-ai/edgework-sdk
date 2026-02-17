import { describe, it, expect, mock, beforeAll, afterAll } from 'bun:test';
import { handleProxyRequest } from '../proxy-handler.js';

// Mock the generated SDK client
mock.module('../../src/compute/gateway/client.gen.js', () => ({
  client: {
    setConfig: () => {},
  },
}));

// Mock the API functions
mock.module('../../src/compute/gateway/sdk.gen.js', () => ({
  createChatCompletion: async ({ body }) => {
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
}));

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
