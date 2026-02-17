# Edgework Inference Layer

Implements the AI inference backends for the Edgework SDK, supporting WebGPU, WASM, and SIMD execution providers.

## Purpose

This module handles the actual execution of Large Language Models (LLMs) in the browser or edge environment. It abstracts the complexity of different compute backends.

## Key Components

- **WebGPUInference** (`webgpu-inference.ts`): High-performance inference using the WebGPU API.
- **WASMInference** (`wasm-inference.ts`): Fallback inference using WebAssembly.
- **SIMDInference** (`simd-inference.ts`): Optimized CPU inference using SIMD instructions.
- **Factory** (`factory.ts`): Logic to detect available hardware capabilities and instantiate the best backend.
- **Tokenizer** (`tokenizer.ts`): Client-side tokenization processing.

## Usage

```typescript
import { createInferenceEngine, detectBestBackend } from './factory';

// Auto-detect backend
const backendParams = await detectBestBackend();
const engine = await createInferenceEngine(storage, 'model-id', backendParams);

// Generate
const output = await engine.generate('Prompt');
```

Last Updated: 2026-01-31