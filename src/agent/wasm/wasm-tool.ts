/**
 * WASM Tool Execution
 *
 * Execute WebAssembly modules as agent tools in the browser.
 * Sandboxed execution with capability-based permissions.
 * UNIQUE to EADK.
 */

import { z } from 'zod';
import type { Tool, ToolContext, ComputePreference } from '../core/types';

export interface WASMToolConfig {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** WASM module (bytes or URL) */
  module: ArrayBuffer | string;
  /** Exported function name to call */
  exportName: string;
  /** Input schema */
  inputSchema: z.ZodSchema;
  /** Output schema */
  outputSchema?: z.ZodSchema;
  /** Allowed capabilities */
  capabilities?: WASMCapability[];
  /** Memory limit in pages (64KB each) */
  memoryPages?: number;
  /** Execution timeout in ms */
  timeoutMs?: number;
}

export type WASMCapability =
  | 'fs_read'
  | 'fs_write'
  | 'net_fetch'
  | 'crypto'
  | 'time';

/**
 * Create a tool that executes a WASM module.
 */
export function createWASMTool(config: WASMToolConfig): Tool {
  let compiledModule: WebAssembly.Module | null = null;

  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    computeTarget: 'local' as ComputePreference,

    execute: async (input: unknown, _ctx: ToolContext): Promise<unknown> => {
      // Compile module on first use
      if (!compiledModule) {
        let wasmBytes: ArrayBuffer;
        if (typeof config.module === 'string') {
          const response = await fetch(config.module);
          wasmBytes = await response.arrayBuffer();
        } else {
          wasmBytes = config.module;
        }
        compiledModule = await WebAssembly.compile(wasmBytes);
      }

      // Create sandboxed imports
      const memory = new WebAssembly.Memory({
        initial: config.memoryPages ?? 16,
        maximum: config.memoryPages ? config.memoryPages * 2 : 256,
      });

      const imports: WebAssembly.Imports = {
        env: {
          memory,
          abort: () => {
            throw new Error('WASM execution aborted');
          },
        },
      };

      // Add capabilities
      if (config.capabilities?.includes('time')) {
        (imports.env as Record<string, unknown>)['Date_now'] = () => Date.now();
      }

      if (config.capabilities?.includes('crypto')) {
        (imports.env as Record<string, unknown>)['random'] = () =>
          Math.random();
      }

      // Instantiate
      const instance = await WebAssembly.instantiate(compiledModule, imports);

      const exportedFn = instance.exports[config.exportName] as
        | ((...args: unknown[]) => unknown)
        | undefined;

      if (!exportedFn) {
        throw new Error(`WASM module does not export '${config.exportName}'`);
      }

      // Execute with timeout
      const timeoutMs = config.timeoutMs ?? 5000;
      const result = await Promise.race([
        Promise.resolve(exportedFn(input)),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('WASM execution timed out')),
            timeoutMs
          )
        ),
      ]);

      return result;
    },
  };
}
