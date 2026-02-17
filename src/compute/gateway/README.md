# Edgework AI Gateway Client

This directory contains the generated client code for connecting to the Edgework AI Gateway.

## Structure

*   **`client.gen.ts`**, **`sdk.gen.ts`**, **`types.gen.ts`**: Auto-generated TypeScript files created by `@hey-api/openapi-ts`. These provide the core types and request functions based on the OpenAPI specification.
*   **`wasm/`**: Contains the WebAssembly implementation of the client (compiled from Rust).
*   **`core/`**: Core networking and configuration logic.
*   **`client/`**: Higher-level client abstractions.

## Generation

These files are generated automatically. **Do not edit `*.gen.ts` files manually.**

To regenerate the client, run:

```bash
bun scripts/generate-clients.ts
```

Last Updated: 2026-01-31

## Sub-Directories

- **[Client](./client)**
- **[Core](./core)**
- **[Wasm](./wasm)**