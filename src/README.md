# Edgework SDK Core

Core implementation of the Edgework SDK, providing client-side AI inference, storage abstraction, and model synchronization.

## Purpose

The `src` directory contains the source code for the `@affectively/edgework-sdk` package. It implements:

- **Unified SDK Interface**: The `Edgework` class in `index.ts`.
- **Inference Engines**: WebGPU and WASM based inference backends.
- **Storage Abstractions**: Handlers for IndexedDB, OPFS, and memory storage.
- **Model Synchronization**: Logic to download and cache model weights.
- **RLHF Training**: On-device Reinforcement Learning from Human Feedback.
- **Agent Runtime**: EADK agent core with Gnosis-style topology runtime for client orchestration and fetch compatibility.
- **Deploy Registration**: AeonPID helpers stage temporary minimal envelopes so control-plane registration does not inherit full built client payloads.

## Key Files

- `index.ts`: The main entry point exporting the `Edgework` class and utility functions.
- `types.ts`: TypeScript definitions for options, results, and internal structures.
- `schemas.ts`: Zod schemas for runtime validation of inputs and configuration.
- `models.ts`: Configuration for supported models (e.g., Cyrano, Cog).
- `inference/`: Directory containing inference engine implementations.
- `storage/`: Directory containing storage backend implementations.
- `sync/`: Directory containing model synchronization logic.
- `rlhf/`: Directory containing RLHF trainer implementation.

## Usage

Internal usage within the SDK or by consumers importing from `@affectively/edgework-sdk`:

```typescript
import { Edgework, EdgeworkOptions } from './index';

// Instantiate the SDK
const sdk = await Edgework.init({
  model: 'cyrano-360m',
  // ... options
});

// Generate text
const result = await sdk.generate('Hello world');
```

Last Updated: 2026-03-23

## Sub-Directories

- **[Agent](./agent/README.md)**
- **[Auth](./auth)**
- **[Compute](./compute)**
- **[Data](./data)**
- **[Deploy](./deploy/README.md)**
- **[React](./react)**
