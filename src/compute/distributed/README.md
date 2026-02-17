# Distributed Compute SDK

**Directory**: `packages/edgework-sdk/src/compute/distributed/`

## Purpose

This module provides the core logic for AFFECTIVELY's distributed edge computing capabilities. It orchestrates the execution of AI models and computational tasks across a network of available nodes (browser peers, edge workers, or local native runtimes).

## Key Components

- **`distributed-client.ts`**: The main entry point for initiating distributed tasks.
- **`model-router.ts`**: Determines the optimal location for executing a specific model inference task based on latency, capability, and cost.
- **`batch-scheduler.ts`**: Groups multiple inference requests to optimize throughput.
- **`bandwidth-optimizer.ts`**: Manages data transfer to prevent network congestion during distributed processing.
- **`metrics-reporter.ts`**: Telemetry for tracking performance and health of the distributed grid.
- **`edge-inference-adapter.ts`**: Adapts standard model interfaces to run on the specific edge runtime environment.

## Usage

This SDK is used by applications (like the Web App or Desktop App) to offload heavy AI processing from the main thread or to leverage the "Edgework" distributed grid.

```typescript
import { distributedClient } from '@edgework/sdk/compute/distributed';

await distributedClient.execute({
  model: 'llama-3-8b',
  input: 'Analyze this emotion...',
  priority: 'high'
});
```

Last Updated: 2026-01-31