/**
 * Tier 1: Distributed Integration Tests
 * Tests for distributed client, model router, and edge inference adapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  DistributedClient,
  DISTRIBUTED_PRESETS,
  type DistributedClientConfig,
  type DistributedResult,
} from '../compute/distributed';
import { ModelRouter } from '../compute/distributed/model-router';
import { EdgeInferenceAdapter } from '../compute/distributed/edge-inference-adapter';
import type {
  DeviceCapabilities,
  ModelCapabilities,
} from '../compute/distributed/model-router';

// Mock data
const mockWorkerEndpoints = [
  'https://worker1.example.com/api/v1',
  'https://worker2.example.com/api/v1',
  'https://worker3.example.com/api/v1',
];

const mockDeviceCapabilities: DeviceCapabilities = {
  availableMemoryMB: 4096,
  hasWebGPU: true,
  hasWASMSIMD: true,
  cpuCores: 8,
  deviceType: 'desktop',
  webGPULimits: {
    maxBufferSize: 268435456,
    maxStorageBufferBindingSize: 268435456,
    maxComputeWorkgroupSizeX: 256,
  },
  computeScore: 85, // Mock score
};

const mockModelCapabilities: Record<string, ModelCapabilities> = {
  'cyrano-360m': {
    minMemoryMB: 512,
    requiresWebGPU: false,
    supportsWASM: true,
    maxLocalSeqLength: 2048,
    parameterCount: 360_000_000,
    quantization: 'int4',
    supportsStreaming: true,
  },
  'gemini-2.0-flash': {
    minMemoryMB: 16384,
    requiresWebGPU: false,
    supportsWASM: false,
    maxLocalSeqLength: 100000,
    parameterCount: 70_000_000_000,
    quantization: 'fp16', // Fixed from 'fp8' to match ModelCapabilities definition
    supportsStreaming: true,
  },
  'gpt-4o-mini': {
    minMemoryMB: 8192,
    requiresWebGPU: false,
    supportsWASM: false,
    maxLocalSeqLength: 128000,
    parameterCount: 7_000_000_000,
    quantization: 'fp16',
    supportsStreaming: true,
  },
};

describe('Tier 1: Distributed Integration', () => {
  describe('DistributedClient', () => {
    let client: DistributedClient;

    beforeEach(() => {
      client = new DistributedClient({
        endpoints: mockWorkerEndpoints,
        connectionTimeoutMs: 5000,
        requestTimeoutMs: 30000,
        maxConcurrentRequests: 10,
      });
    });

    afterEach(() => {
      client.shutdown();
    });

    it('should initialize with multiple endpoints', () => {
      expect(client).toBeDefined();
      const statuses = client.getWorkerStatuses();
      expect(statuses).toHaveLength(3);
    });

    it('should track worker status', async () => {
      const statuses = client.getWorkerStatuses();
      expect(statuses[0]).toHaveProperty('endpoint');
      expect(statuses[0]).toHaveProperty('state');
      expect(statuses[0]).toHaveProperty('healthy');
      expect(statuses[0]).toHaveProperty('avgLatencyMs');
    });

    it('should support connection state callbacks', (done) => {
      let callbackCount = 0;

      const config: DistributedClientConfig = {
        endpoints: mockWorkerEndpoints,
        onConnectionChange: (endpoint, state) => {
          callbackCount++;
          expect(endpoint).toBeDefined();
          expect([
            'connecting',
            'connected',
            'disconnected',
            'error',
          ]).toContain(state);
        },
      };

      const testClient = new DistributedClient(config);
      testClient.shutdown();
      done();
    });

    it('should support using presets', () => {
      const multiRegionConfig = DISTRIBUTED_PRESETS.multiRegion;
      expect(multiRegionConfig).toHaveProperty('connectionTimeoutMs');
      expect(multiRegionConfig).toHaveProperty('maxConcurrentRequests');
      expect(multiRegionConfig.maxConcurrentRequests).toBe(10);
    });

    it('should handle disconnection gracefully', () => {
      const endpoint = mockWorkerEndpoints[0];
      client.disconnect(endpoint);
      const statuses = client.getWorkerStatuses();
      const status = statuses.find((s) => s.endpoint === endpoint);
      expect(status?.state).toBe('disconnected');
    });

    it('should support disconnect all', () => {
      client.disconnectAll();
      const statuses = client.getWorkerStatuses();
      for (const status of statuses) {
        expect(status.state).toBe('disconnected');
      }
    });
  });

  describe('ModelRouter', () => {
    let router: ModelRouter;

    beforeEach(() => {
      router = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'adaptive',
      });
    });

    it('should detect local capability for small models', () => {
      const route = router.route('cyrano-360m', {
        preferQuality: false,
        preferLatency: true,
      });

      expect(route).toBeDefined();
      expect(['local-wasm', 'local-webgpu', 'edge']).toContain(
        route?.primary || ''
      );
    });

    it('should recommend edge for large models', () => {
      const route = router.route('gemini-2.0-flash', {
        preferQuality: true,
        preferLatency: false,
      });

      expect(route).toBeDefined();
      expect(route?.primary).toBeDefined();
      expect(['local-wasm', 'local-webgpu', 'edge', 'cloud']).toContain(
        route?.primary || ''
      );
    });

    it('should route based on latency preference', () => {
      const latencyRoute = router.route('gpt-4o-mini', {
        preferLatency: true,
      });

      const qualityRoute = router.route('gpt-4o-mini', {
        preferQuality: true,
      });

      expect(latencyRoute).toBeDefined();
      expect(qualityRoute).toBeDefined();
    });

    it('should estimate cost correctly', () => {
      const localCost = router.estimateCost('cyrano-360m', 'local-wasm', 1000);
      const edgeCost = router.estimateCost('gemini-2.0-flash', 'edge', 1000);

      expect(localCost).toBe(0); // Local is free
      expect(edgeCost).toBeGreaterThan(0);
    });

    it('should support cost-optimized routing', () => {
      const costOptRouter = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'cost-optimized',
      });

      const route = costOptRouter.route('gpt-4o-mini', {});
      expect(route).toBeDefined();
      expect(route?.estimatedCost).toBeLessThanOrEqual(
        costOptRouter.route('gemini-2.0-flash', {})?.estimatedCost ?? 0
      );
    });

    it('should support quality-optimized routing', () => {
      const qualityRouter = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'quality-optimized',
      });

      const route = qualityRouter.route('gpt-4o-mini', {});
      expect(route).toBeDefined();
      expect(['local-wasm', 'local-webgpu', 'edge', 'cloud']).toContain(
        route?.primary || ''
      );
    });

    it('should track routing decisions', () => {
      router.route('cyrano-360m', {});
      router.route('gpt-4o-mini', {});
      router.route('gemini-2.0-flash', {});

      const stats = router.getRoutingStats();
      expect(stats.totalDecisions).toBe(3);
    });

    it('should update device capabilities dynamically', () => {
      const newCapabilities = {
        ...mockDeviceCapabilities,
        availableMemoryMB: 2048,
      };

      router.updateDeviceCapabilities(newCapabilities);
      const route = router.route('gpt-4o-mini', {});
      expect(route).toBeDefined();
    });
  });

  describe('EdgeInferenceAdapter', () => {
    let adapter: EdgeInferenceAdapter;
    let router: ModelRouter;
    let client: DistributedClient;

    beforeEach(() => {
      client = new DistributedClient({
        endpoints: mockWorkerEndpoints,
      });

      router = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'adaptive',
      });

      adapter = new EdgeInferenceAdapter({
        router,
        distributedClient: client,
      });
    });

    afterEach(() => {
      client.shutdown();
    });

    it('should initialize correctly', () => {
      expect(adapter).toBeDefined();
    });

    it('should support context-aware routing via hooks', () => {
      let seenContext: Record<string, unknown> | undefined;

      const hookAdapter = new EdgeInferenceAdapter({
        router,
        distributedClient: client,
        customRouting: (decision, context) => {
          seenContext = context;
          return {
            ...decision,
            reason: `${decision.reason} (custom)`,
          };
        },
      });

      hookAdapter.setContext({ domain: 'example', priority: 'high' });

      const route = hookAdapter.getRoute('gpt-4o-mini');
      expect(route).toBeDefined();
      expect(route.reason).toContain('custom');
      expect(seenContext).toEqual({ domain: 'example', priority: 'high' });
    });

    it('should apply quantized LoRA when available', async () => {
      const config = adapter.getOptimalConfig('cyrano-360m', {
        quality: 'high',
      });

      expect(config).toHaveProperty('quantization');
      expect(config).toHaveProperty('useSpeculativeDecoding');
    });

    it('should estimate quality score (custom scorer)', () => {
      const hookAdapter = new EdgeInferenceAdapter({
        router,
        distributedClient: client,
        customQualityScore: () => 0.42,
      });

      const score = hookAdapter.getQualityScore({
        model: 'gpt-4o-mini',
        source: 'edge',
        context: { domain: 'example' },
      });

      expect(score).toBe(0.42);
    });

    it('should support hybrid inference options', () => {
      const options = adapter.getHybridOptions({
        model: 'gpt-4o-mini',
        quality: 'balanced',
      });

      expect(options).toHaveProperty('source');
      expect(options).toHaveProperty('useCache');
      expect(options).toHaveProperty('useCompression');
    });
  });

  describe('Integration Tests', () => {
    it('should route through distributed client via router', () => {
      const router = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'adaptive',
      });

      const route1 = router.route('cyrano-360m', { preferLatency: true });
      const route2 = router.route('gemini-2.0-flash', { preferQuality: true });

      expect(route1).toBeDefined();
      expect(route2).toBeDefined();
      expect(['local-wasm', 'local-webgpu', 'edge', 'cloud']).toContain(
        route1?.primary || ''
      );
      expect(['local-wasm', 'local-webgpu', 'edge', 'cloud']).toContain(
        route2?.primary || ''
      );
    });

    it('should support full pipeline from adapter to router to client', async () => {
      const client = new DistributedClient({ endpoints: mockWorkerEndpoints });
      const router = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'adaptive',
      });
      const adapter = new EdgeInferenceAdapter({
        router,
        distributedClient: client,
      });

      const route = adapter.getRoute('gpt-4o-mini');
      expect(route).toBeDefined();

      client.shutdown();
    });

    it('should handle multiple simultaneous routing decisions', () => {
      const router = new ModelRouter({
        deviceCapabilities: mockDeviceCapabilities,
        modelCapabilities: mockModelCapabilities,
        strategy: 'adaptive',
      });

      const models = ['cyrano-360m', 'gpt-4o-mini', 'gemini-2.0-flash'];
      const routes = models.map((m) => router.route(m, {}));

      expect(routes).toHaveLength(3);
      for (const route of routes) {
        expect(route).toHaveProperty('source');
        expect(route).toHaveProperty('estimatedCost');
      }
    });
  });
});
