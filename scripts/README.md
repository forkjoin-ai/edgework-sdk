# Edgework SDK Scripts

This directory contains utility scripts for the `edgework-sdk` package, primarily focused on client generation and maintenance.

## Scripts

### `generate-clients.ts`

Generates type-safe API clients for the Edgework SDK from the OpenAPI specification.

**Usage:**

```bash
bun scripts/generate-clients.ts
```

**Functionality:**

1.  **TypeScript Generation**: Uses `@hey-api/openapi-ts` to generate a lightweight, type-safe TypeScript client.
    *   **Output**: `src/compute/gateway`
    *   **Client**: `fetch`-based client compatible with browser and Edge environments.

2.  **Go & Rust Generation**:
    *   **Docker Strategy** (Preferred): Uses `openapitools/openapi-generator-cli` Docker image to ensure consistent environment.
    *   **Java Fallback**: If Docker is unavailable, falls back to system `java` to run `openapi-generator-cli`.
    *   **Output**: `generated/go` and `generated/rust`.

3.  **Rust WASM Integration**:
    *   **Patching**: Automatically patches generated Rust code to support WASM (removes blocking `reqwest` features, fixes type boxing issues).
    *   **Build**: Uses `wasm-pack` to compile the patched Rust client into a WebAssembly module.
    *   **Output**: `src/compute/gateway/wasm`.

**Prerequisites:**

*   **Bun**: Runtime for the script.
*   **Docker**: Recommended for Go/Rust generation.
*   **Java**: Fallback if Docker is missing.
*   **wasm-pack**: Required for building the WASM client (`cargo install wasm-pack`).

**Key Paths:**

*   **OpenAPI Spec**: `apps/docs-app/public/api-docs/ai-gateway-openapi.json`
*   **WASM Wrapper Source**: `rust/wasm-wrapper`

Last Updated: 2026-01-31