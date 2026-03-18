/**
 * Edgework SDK Proxy Handler
 */

import {
  createChatCompletion,
  createEmbeddings,
  listModels,
} from '../src/compute/gateway/index.js';
import type {
  CreateChatCompletionData,
  CreateEmbeddingsData,
} from '../src/compute/gateway/types.gen.js';
import { client } from '../src/compute/gateway/client.gen.js';

import fs from 'fs';
import path from 'path';

// Configuration
export const EDGE_BASE_URL = 'https://edge.affectively.ai';
client.setConfig({ baseUrl: `${EDGE_BASE_URL}/v1` });

export const PORT = parseInt(process.env.PORT || '11420', 10);
export const HOST = process.env.HOST || '127.0.0.1';
export const DEBUG =
  process.env.DEBUG === 'true' || process.argv.includes('--debug');

// Load Session
const CONFIG_DIR = process.env.HOME
  ? path.join(process.env.HOME, '.edgework')
  : '.edgework';
const SESSION_FILE = path.join(CONFIG_DIR, 'proxy-session.json');

let sessionToken: string | null = null;
try {
  if (fs.existsSync(SESSION_FILE)) {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (session && session.token) {
      sessionToken = session.token;
      if (DEBUG) console.log(`[auth] Loaded session for: ${session.identity}`);
    }
  }
} catch (e) {
  if (DEBUG) console.warn('[warn] Could not load session file:', e);
}

function log(msg: string, data?: any) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${msg}`,
    data ? JSON.stringify(data, null, 2) : ''
  );
}

function handleError(err: unknown, requestId: string) {
  console.error(`ERROR [${requestId}]:`, err);
  return new Response(
    JSON.stringify({
      error: {
        message: err instanceof Error ? err.message : String(err),
        type: 'server_error',
        param: null,
        code: 'internal_error',
      },
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}

function pickStringField(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeAeonCompletionBody(
  rawBody: unknown
): CreateChatCompletionData['body'] {
  const record =
    rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : {};

  if (Array.isArray(record['messages'])) {
    return record as unknown as CreateChatCompletionData['body'];
  }

  const prompt = pickStringField(record, ['prompt', 'input', 'text', 'query']);
  const instructions = pickStringField(record, ['instructions', 'system']);
  const model = pickStringField(record, ['model']) ?? 'auto';

  const contentParts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } }
  > = [];

  if (prompt) {
    contentParts.push({ type: 'text', text: prompt });
  }

  const attachmentCandidates: unknown[] = [];
  const attachments = record['attachments'];
  if (Array.isArray(attachments)) {
    attachmentCandidates.push(...attachments);
  }
  const images = record['images'];
  if (Array.isArray(images)) {
    attachmentCandidates.push(
      ...images.map((url) => ({
        type: 'image',
        url,
      }))
    );
  }

  for (const candidate of attachmentCandidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const attachment = candidate as Record<string, unknown>;
    const type =
      typeof attachment['type'] === 'string'
        ? attachment['type'].toLowerCase()
        : '';
    const directUrl =
      typeof attachment['url'] === 'string'
        ? attachment['url']
        : typeof attachment['imageUrl'] === 'string'
        ? attachment['imageUrl']
        : null;
    const nestedImageUrl =
      attachment['image_url'] &&
      typeof attachment['image_url'] === 'object' &&
      !Array.isArray(attachment['image_url']) &&
      typeof (attachment['image_url'] as Record<string, unknown>)['url'] ===
        'string'
        ? ((attachment['image_url'] as Record<string, unknown>)[
            'url'
          ] as string)
        : null;
    const url = (directUrl ?? nestedImageUrl)?.trim();
    if (!url) {
      continue;
    }
    if (
      type === '' ||
      type === 'image' ||
      type === 'image_url' ||
      type === 'camera'
    ) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url,
          detail: 'high',
        },
      });
    }
  }

  if (contentParts.length === 0) {
    contentParts.push({ type: 'text', text: '' });
  }

  const messages: Array<Record<string, unknown>> = [];
  if (instructions) {
    messages.push({
      role: 'system',
      content: instructions,
    });
  }
  messages.push({
    role: 'user',
    content:
      contentParts.length === 1 && contentParts[0]?.type === 'text'
        ? contentParts[0].text
        : contentParts,
  });

  return {
    ...record,
    model,
    messages,
  } as unknown as CreateChatCompletionData['body'];
}

export async function handleProxyRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const requestId = crypto.randomUUID().slice(0, 8);
  const method = req.method;

  if (DEBUG) log(`[incoming] [${requestId}] ${method} ${url.pathname}`);

  try {
    // Extract headers (Authorization + X-Headers)
    const headers: Record<string, string> = {};

    // 1. Client Headers
    for (const [key, value] of req.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'authorization' || lowerKey.startsWith('x-')) {
        headers[key] = value;
      }
    }

    // 2. Auth Fallback
    if (
      !headers['Authorization'] &&
      !headers['authorization'] &&
      sessionToken
    ) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
      if (DEBUG) log(`[auth] Injected session token`);
    }

    // CLONE REQUEST BODY for logging (since it can only be read once)
    let bodyCopy: any = null;
    if (DEBUG && method === 'POST') {
      try {
        bodyCopy = await req.clone().json();
        const preview = JSON.stringify(bodyCopy).slice(0, 200);
        log(
          `[body] [${requestId}]`,
          preview + (preview.length >= 200 ? '...' : '')
        );
      } catch {}
    }

    // OPENAI/AEON COMPATIBILITY: POST /v1/chat/completions | /v1/aeon/completions
    if (
      req.method === 'POST' &&
      (url.pathname === '/v1/chat/completions' ||
        url.pathname === '/v1/aeon/completions')
    ) {
      try {
        // Use the cloned body if we read it, otherwise read from req
        const rawBody = bodyCopy || (await req.json());
        const body =
          url.pathname === '/v1/aeon/completions'
            ? normalizeAeonCompletionBody(rawBody)
            : (rawBody as CreateChatCompletionData['body']);

        // Use the generated SDK client
        const response = await createChatCompletion({
          body,
          headers,
        });

        if (response.error) {
          log(`[error] [${requestId}]`, response.error);
          return new Response(JSON.stringify(response.error), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        log(`[success] [${requestId}]`);
        // Return generic response
        return new Response(JSON.stringify(response.data), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return handleError(err, requestId);
      }
    }

    // OPENAI COMPATIBILITY: POST /v1/embeddings (Typed SDK)
    if (req.method === 'POST' && url.pathname === '/v1/embeddings') {
      try {
        const body = bodyCopy || (await req.json());
        const response = await createEmbeddings({
          body: body as CreateEmbeddingsData['body'],
          headers,
        });

        if (response.error) {
          return new Response(JSON.stringify(response.error), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(response.data), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return handleError(err, requestId);
      }
    }

    // OPENAI COMPATIBILITY: GET /v1/models (Typed SDK)
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      try {
        const response = await listModels({ headers });
        if (response.error) {
          return new Response(JSON.stringify(response.error), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(response.data), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return handleError(err, requestId);
      }
    }

    // CORS Pre-flight & Headers
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // HEALTH CHECK
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', uptime: process.uptime() }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // OLLAMA COMPATIBILITY: GET /api/tags (List Models)
    if (req.method === 'GET' && url.pathname === '/api/tags') {
      try {
        const response = await listModels({ headers });
        if (response.error) {
          return new Response(JSON.stringify(response.error), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Map to Ollama format: { models: [ { name: "model-name", ... } ] }
        const ollamaResponse = {
          models:
            response.data?.data?.map((m: any) => ({
              name: m.id,
              modified_at: new Date(m.created * 1000).toISOString(),
              size: 0,
              digest: m.id,
              details: {
                format: 'gguf',
                family: 'llama',
                families: null,
                parameter_size: '7B',
                quantization_level: 'Q4_0',
              },
            })) || [],
        };
        return new Response(JSON.stringify(ollamaResponse), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return handleError(err, requestId);
      }
    }

    // OLLAMA COMPATIBILITY: POST /api/chat (Chat Completions)
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      try {
        const body = bodyCopy || (await req.json());

        const response = await createChatCompletion({
          body: body as any,
          headers,
        });

        if (response.error) {
          log(`[error] [${requestId}] /api/chat`, response.error);
          return new Response(JSON.stringify(response.error), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        log(`[success] [${requestId}] /api/chat (via OpenAI layer)`);
        return new Response(JSON.stringify(response.data), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return handleError(err, requestId);
      }
    }

    // COPILOT: Token Endpoint (Mock)
    if (req.method === 'GET' && url.pathname === '/copilot_internal/v2/token') {
      // Return a dummy token structure that Copilot expects
      const token =
        'tid=1234567890;exp=253402300799;sku=monthly_subscriber;st=dotcom;chat=1';
      return new Response(JSON.stringify({ token, expires_at: 253402300799 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // COPILOT: Legacy Completions Endpoint (Adapter)
    if (
      req.method === 'POST' &&
      url.pathname.endsWith('/completions') &&
      url.pathname.includes('copilot-codex')
    ) {
      try {
        const body = bodyCopy || (await req.json());
        const { prompt, suffix, max_tokens, temperature, n, stop } = body;

        // Adapt Legacy "prompt" + "suffix" (FIM) to Chat format
        // Note: True FIM support requires a FIM-capable model and specific syntax.
        // Here we simply concatenate for a best-effort chat response if the user points to a chat model.
        // Ideally, we would route this to a refined FIM endpoint on the gateway.

        let content = prompt;
        if (suffix) {
          content += `\n[Wait, I also have the following code after the cursor:]\n${suffix}\n[Please fill in the gap.]`;
        }

        const response = await createChatCompletion({
          body: {
            model: body.model || 'gpt-4o', // Default to a smart model
            messages: [{ role: 'user', content }],
            max_tokens,
            temperature,
            n,
            stop,
            stream: false, // Copilot usually expects streaming, but we'll start with blocking for simplicity unless connection is keep-alive
          },
          headers,
        });

        if (response.error) {
          return new Response(JSON.stringify(response.error), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Map Chat Response back to Legacy Completion Response
        const text = response.data?.choices?.[0]?.message?.content || '';
        const legacyResponse = {
          id: response.data?.id,
          created: response.data?.created,
          model: response.data?.model,
          choices: [
            {
              text: text,
              index: 0,
              logprobs: null,
              finish_reason: response.data?.choices?.[0]?.finish_reason,
            },
          ],
          usage: response.data?.usage,
        };

        return new Response(JSON.stringify(legacyResponse), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return handleError(err, requestId);
      }
    }

    // FALLBACK: Pass-through proxy for all other requests
    try {
      const targetUrl = new URL(url.pathname + url.search, EDGE_BASE_URL);

      // Re-stream basic fetch
      const init: RequestInit = {
        method,
        headers: headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        init.body = bodyCopy ? JSON.stringify(bodyCopy) : await req.blob();
      }

      if (DEBUG) log(`[forward] ${targetUrl.toString()}`);

      const response = await fetch(targetUrl.toString(), init);

      if (DEBUG) log(`[gateway] ${response.status} ${response.statusText}`);

      // Stream response back
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      return handleError(error, requestId);
    }
  } catch (e) {
    return handleError(e, requestId);
  }
}
