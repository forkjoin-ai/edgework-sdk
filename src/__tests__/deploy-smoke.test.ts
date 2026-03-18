import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runSmokeSuite, withRetry } from '../deploy';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'edgework-smoke-'));
  tempDirs.push(dir);
  return dir;
}

describe('deploy smoke harness', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { force: true, recursive: true });
      }
    }
  });

  it('retries until work succeeds', async () => {
    let attempts = 0;

    const result = await withRetry(
      'eventual success',
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('not yet');
        }
        return 'ok';
      },
      {
        timeoutMs: 100,
        retryIntervalMs: 1,
      }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('runs cleanup in reverse order and writes a report on failure', async () => {
    const cleanupOrder: string[] = [];
    const reportDir = createTempDir();
    const reportPath = join(reportDir, 'smoke-report.json');

    const result = await runSmokeSuite({
      name: 'cleanup-order',
      baseUrl: 'https://demo.example',
      reportPath,
      steps: [
        {
          name: 'register cleanups',
          run: (context) => {
            context.onCleanup('first', async () => {
              cleanupOrder.push('first');
            });
            context.onCleanup('second', async () => {
              cleanupOrder.push('second');
            });
            throw new Error('boom');
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe('register cleanups');
    expect(cleanupOrder).toEqual(['second', 'first']);
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      suite: string;
      ok: boolean;
      cleanup: { attempted: number };
    };
    expect(report.suite).toBe('cleanup-order');
    expect(report.ok).toBe(false);
    expect(report.cleanup.attempted).toBe(2);
  });

  it('waits for a live route before running steps', async () => {
    let healthAttempts = 0;
    globalThis.fetch = jest.fn(async (url: string | URL) => {
      if (String(url) === 'https://demo.example/health') {
        healthAttempts += 1;
        if (healthAttempts < 2) {
          return new Response(JSON.stringify({ status: 'booting' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ status: 'healthy' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('not found', { status: 404 });
    }) as unknown as typeof globalThis.fetch;

    const result = await runSmokeSuite({
      name: 'wait-for-live-route',
      baseUrl: 'https://demo.example',
      waitFor: {
        path: '/health',
        retryIntervalMs: 1,
        timeoutMs: 100,
        validate: (response, bodyText) => {
          if (!response.ok) {
            return false;
          }
          const payload = JSON.parse(bodyText) as Record<string, unknown>;
          return payload.status === 'healthy';
        },
      },
      steps: [
        {
          name: 'noop',
          run: () => undefined,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.liveRoute?.attempts).toBe(2);
  });

  it('persists the MCP session header across calls', async () => {
    const seenSessionHeaders: Array<string | null> = [];

    globalThis.fetch = jest.fn(
      async (_url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          method: string;
          id: string;
        };
        const headers = new Headers(init?.headers);
        seenSessionHeaders.push(headers.get('mcp-session-id'));

        if (body.method === 'initialize') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                serverInfo: {
                  name: 'demo-mcp',
                },
              },
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'mcp-session-id': 'smoke-session',
              },
            }
          );
        }

        if (body.method === 'tools/list') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                tools: [],
              },
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'mcp-session-id': 'smoke-session',
              },
            }
          );
        }

        return new Response('unexpected request', { status: 500 });
      }
    ) as unknown as typeof globalThis.fetch;

    const result = await runSmokeSuite({
      name: 'mcp-session',
      baseUrl: 'https://demo.example',
      steps: [
        {
          name: 'initialize and list tools',
          run: async (context) => {
            await context.mcpInitialize('/mcp');
            await context.mcpListTools('/mcp');
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(seenSessionHeaders).toEqual([null, 'smoke-session']);
  });
});
