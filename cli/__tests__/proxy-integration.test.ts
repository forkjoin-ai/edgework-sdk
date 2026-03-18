import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';

const PROXY_PORT = 11425; // Use a distinct port for integration testing
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;

// NOTE(liquidated): This test is skipped because:
// - Integration test requires spawning a proxy server subprocess
// - Makes real HTTP calls to localhost proxy
// - Blocked by: Requires running proxy server infrastructure
describe('Proxy Integration Tests', () => {
  let proxyProcess: any;

  beforeAll(async () => {
    // Start the proxy server as a subprocess
    // Use the correct path relative to repository root
    proxyProcess = spawn('bun', ['packages/edgework-sdk/cli/proxy-start.ts'], {
      env: {
        ...process.env,
        PORT: PROXY_PORT.toString(),
        HOST: '127.0.0.1',
        DEBUG: 'true',
      },
      cwd: process.cwd(),
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (proxyProcess) {
      proxyProcess.kill();
    }
  });

  it('GET /health should return 200 OK', async () => {
    const res = await fetch(`${PROXY_URL}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('OPTIONS /v1/chat/completions should return CORS headers', async () => {
    const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('GET /copilot_internal/v2/token should return mock token', async () => {
    const res = await fetch(`${PROXY_URL}/copilot_internal/v2/token`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.token).toContain('tid=');
  });

  it('GET /api/tags (Ollama) should be reachable (even if upstream fails)', async () => {
    // This tests the routing logic. Upstream might fail without auth, but we check if it handled the route.
    // In our implementation, it tries to call listModels.
    // Without proper auth/mocking of the underlying SDK network call in this integration test,
    // it might result in a 500 or 401. We just want to check it didn't 404.
    const res = await fetch(`${PROXY_URL}/api/tags`);
    expect(res.status).not.toBe(404);
  });
});
