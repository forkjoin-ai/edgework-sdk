import { GnosisClientRuntime } from '../agent/core/gnosis-runtime';

interface WasmGatewayModule {
  default: () => Promise<unknown> | void;
  GatewayClient: new (basePath: string, token: string) => WasmGatewayClientApi;
}

interface WasmGatewayClientApi {
  create_chat_completion: (
    request: unknown,
    requestId?: string,
    correlationId?: string
  ) => unknown;
  health_check: () => unknown;
}

export class WasmGatewayClient {
  private client: WasmGatewayClientApi | null = null;
  private initPromise: Promise<unknown> | null = null;
  private wasmModule: WasmGatewayModule | null = null;
  private runtime: GnosisClientRuntime;

  constructor(private basePath: string, private token: string) {
    this.runtime = new GnosisClientRuntime('wasm-gateway-client');
  }

  private async ensureInit() {
    if (this.client) return this.client;

    if (!this.initPromise) {
      // Initialize WASM module.
      // In a bundler environment (Vite/Webpack), this will resolve the .wasm file automatically via import.meta.url
      this.initPromise = this.runtime.process('wasm-init', async () => {
        const module = await this.loadWasmModule();
        this.client = new module.GatewayClient(this.basePath, this.token);
      });
    }
    await this.initPromise;
    return this.client!;
  }

  private async loadWasmModule(): Promise<WasmGatewayModule> {
    if (this.wasmModule) {
      return this.wasmModule;
    }

    try {
      const module = await import('./gateway/wasm/edgework_sdk_wasm.js');
      const typedModule = module as unknown as WasmGatewayModule;
      await typedModule.default();
      this.wasmModule = typedModule;
      return typedModule;
    } catch (error) {
      throw new Error(
        `Failed to load Edgework WASM client. Ensure the WASM bundle is built and available. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async createChatCompletion(
    request: unknown,
    requestId?: string,
    correlationId?: string
  ): Promise<unknown> {
    return this.runtime.process('create-chat-completion', async () => {
      const client = await this.ensureInit();
      // generated WASM client handles serialization/deserialization via serde-wasm-bindgen
      return client.create_chat_completion(request, requestId, correlationId);
    });
  }

  async healthCheck(): Promise<unknown> {
    return this.runtime.process('health-check', async () => {
      const client = await this.ensureInit();
      return client.health_check();
    });
  }
}
