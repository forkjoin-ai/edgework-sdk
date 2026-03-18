# Edgework SDK Compute

The Compute module provides the core intelligence capabilities of the Edgework SDK, bridging client applications with both cloud-based AI Gateway services and local edge inference.

## Modules

### `gateway`
Access to the centralized AI Gateway.
- **REST Client**: Standard HTTP-based client.
- **WASM Client**: High-performance WebAssembly client (`WasmGatewayClient`).

### `inference`
(Planned) Local inference engine for running lightweight models directly on the client.

### `rlhf`
(Planned) Utilities for Reinforcement Learning from Human Feedback, enabling decentralized model improvement.

## Usage

### WASM Gateway Client
The `WasmGatewayClient` offers a performant interface to the AI Gateway, utilizing a compiled Rust module for request handling and Gnosis runtime orchestration for client lifecycle steps.

```typescript
import { WasmGatewayClient } from '@edgework/sdk/compute/wasm-gateway-client';

const client = new WasmGatewayClient('https://api.edgework.dev', 'your-token');

// Perform a health check
await client.healthCheck();

// Create a chat completion
const response = await client.createChatCompletion({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

Last Updated: 2026-01-31

## Sub-Directories

- **[Distributed](./distributed)**
- **[Embeddings](./embeddings)**
- **[Gateway](./gateway)**
- **[Inference](./inference)**
- **[Rlhf](./rlhf)**
