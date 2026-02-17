# Rust WASM Wrapper

This directory contains the Rust crate that wraps the auto-generated Rust client to expose it as a WebAssembly module.

## Purpose

The generated Rust client (in `../../generated/rust`) is a standard Rust crate. This wrapper:
1.  Dependencies on the generated crate.
2.  Exposes a `wasm-bindgen` interface.
3.  Optimizes the build for web targets.

## Build

Built by `bun scripts/generate-clients.ts` which invokes `wasm-pack`.

Last Updated: 2026-01-31

## Sub-Directories

- **[Src](./src)**