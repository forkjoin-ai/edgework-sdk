#!/usr/bin/env bun
/**
 * Edgework SDK Proxy Entry Point
 */

import {
  handleProxyRequest,
  PORT,
  HOST,
  EDGE_BASE_URL,
  DEBUG,
} from './proxy-handler.js';

console.info(`
[edgework] AI Proxy
--------------------
Listening on: http://${HOST}:${PORT}
Target:       Edgework AI Gateway (${EDGE_BASE_URL})
Debug Mode:   ${DEBUG ? 'ENABLED' : 'DISABLED'}

Supported Endpoints:
  - POST /v1/chat/completions (Typed SDK)
  - POST /v1/aeon/completions (Aeon multimodal alias)
  - POST /v1/embeddings       (Typed SDK)
  - GET  /v1/models           (Typed SDK)
  - GET  /api/tags            (Ollama Compat)
  - POST /api/chat            (Ollama Compat)
  - GET  /health              (Health Check)
  - GET  /copilot_internal/*  (Copilot Compat)
  - *                         (Pass-through to Gateway)
`);

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: handleProxyRequest,
});
