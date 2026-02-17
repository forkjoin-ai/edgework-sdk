/**
 * Model Router
 *
 * Intelligent routing decisions for model inference requests.
 * Determines optimal execution path based on:
 * - Model size and capabilities
 * - Device resources (memory, GPU)
 * - Network experiences
 * - User preferences
 * - Cost optimization
 */

/**
 * Routing strategy type
 */
export type RoutingStrategy =
  | 'local-first' // Prefer local execution, fallback to edge
  | 'edge-first' // Prefer edge execution, fallback to local
  | 'cost-optimized' // Minimize cost (prefer local when possible)
  | 'latency-optimized' // Minimize latency (use fastest available)
  | 'quality-optimized' // Maximize quality (use largest available model)
  | 'adaptive' // Dynamically switch based on experiences
  | 'hybrid'; // Split between local and edge

/**
 * Inference source
 */
export type InferenceSource = 'local-wasm' | 'local-webgpu' | 'edge' | 'cloud';

/**
 * Model capability requirements
 */
export interface ModelCapabilities {
  /** Minimum required memory in MB */
  minMemoryMB: number;

  /** Whether WebGPU is required */
  requiresWebGPU: boolean;

  /** Whether model can run in WASM */
  supportsWASM: boolean;

  /** Maximum sequence length supported locally */
  maxLocalSeqLength: number;

  /** Model parameter count */
  parameterCount: number;

  /** Quantization format */
  quantization: 'fp32' | 'fp16' | 'int8' | 'int4';

  /** Whether streaming is supported */
  supportsStreaming: boolean;
}

/**
 * Device capabilities detected at runtime
 */
export interface DeviceCapabilities {
  /** Available memory in MB */
  availableMemoryMB: number;

  /** Whether WebGPU is available */
  hasWebGPU: boolean;

  /** WebGPU device limits (if available) */
  webGPULimits?: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupSizeX: number;
  };

  /** Whether WASM SIMD is available */
  hasWASMSIMD: boolean;

  /** Number of logical CPUs */
  cpuCores: number;

  /** Device type */
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';

  /** Estimated compute power (relative score) */
  computeScore: number;
}

/**
 * Network experiences
 */
export interface NetworkConditions {
  /** Effective connection type */
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi' | 'unknown';

  /** Estimated bandwidth in Mbps */
  bandwidthMbps: number;

  /** Round-trip time in ms */
  rttMs: number;

  /** Whether we're currently offline */
  isOffline: boolean;

  /** Whether data saver is enabled */
  dataSaverEnabled: boolean;
}

/**
 * Latency statistics
 */
export interface LatencyStats {
  /** Source type */
  source: InferenceSource;

  /** Average latency in ms */
  avgLatencyMs: number;

  /** P50 latency */
  p50Ms: number;

  /** P95 latency */
  p95Ms: number;

  /** P99 latency */
  p99Ms: number;

  /** Sample count */
  samples: number;

  /** Success rate */
  successRate: number;

  /** Tokens per second */
  avgTokensPerSecond: number;
}

/**
 * Route decision
 */
export interface RouteDecision {
  /** Primary source for inference */
  primary: InferenceSource;

  /** Alias for primary (for backwards compatibility) */
  source?: InferenceSource;

  /** Fallback sources in order of preference */
  fallbacks: InferenceSource[];

  /** Reasoning for the decision */
  reason: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Estimated latency for primary source */
  estimatedLatencyMs: number;

  /** Estimated tokens per second */
  estimatedTPS: number;

  /** Estimated cost for this routing decision */
  estimatedCost?: number;

  /** Emotion-aware quality multiplier (0-1) */
  emotionQualityMultiplier?: number;

  /** Whether to use hybrid mode */
  hybrid?: {
    /** Tokens to generate locally before switching */
    localTokens: number;
    /** Switch threshold (when to hand off to edge) */
    switchThreshold: number;
  };

  /** Model modifications */
  modelAdjustments?: {
    /** Use quantized version */
    useQuantized: boolean;
    /** Reduce max tokens */
    maxTokens?: number;
    /** Use smaller batch size */
    batchSize?: number;
  };
}

/**
 * Model router configuration
 */
export interface ModelRouterConfig {
  /** Default routing strategy */
  defaultStrategy: RoutingStrategy;

  /** Model-specific overrides */
  modelOverrides?: Record<
    string,
    {
      strategy?: RoutingStrategy;
      preferredSource?: InferenceSource;
      forceLocal?: boolean;
      forceEdge?: boolean;
    }
  >;

  /** Latency thresholds */
  thresholds?: {
    /** Max acceptable local latency before switching to edge */
    maxLocalLatencyMs: number;
    /** Max acceptable edge latency before switching to cloud */
    maxEdgeLatencyMs: number;
    /** Minimum tokens per second for acceptable experience */
    minTokensPerSecond: number;
  };

  /** Cost weights for optimization */
  costWeights?: {
    /** Weight for edge compute costs */
    edgeCompute: number;
    /** Weight for bandwidth costs */
    bandwidth: number;
    /** Weight for latency */
    latency: number;
  };

  /** Enable adaptive learning */
  enableAdaptiveLearning?: boolean;

  /** Callback when route decision is made */
  onRouteDecision?: (decision: RouteDecision) => void;
}

/**
 * Initialization config for ModelRouter.
 * Includes runtime-detected capabilities and legacy aliases.
 */
export interface ModelRouterInitConfig extends Partial<ModelRouterConfig> {
  /** Device capabilities (optional; can be detected if omitted) */
  deviceCapabilities?: DeviceCapabilities;

  /** Network experiences override (optional; can be detected if omitted) */
  networkConditions?: NetworkConditions;

  /** Model capability map keyed by model id */
  modelCapabilities?: Record<string, ModelCapabilities>;

  /** Legacy alias for defaultStrategy */
  strategy?: RoutingStrategy;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<
  Omit<ModelRouterConfig, 'modelOverrides' | 'onRouteDecision'>
> = {
  defaultStrategy: 'adaptive',
  thresholds: {
    maxLocalLatencyMs: 5000,
    maxEdgeLatencyMs: 2000,
    minTokensPerSecond: 5,
  },
  costWeights: {
    edgeCompute: 1.0,
    bandwidth: 0.5,
    latency: 1.5,
  },
  enableAdaptiveLearning: true,
};

/**
 * Model Router
 *
 * Makes intelligent routing decisions for model inference.
 */
export class ModelRouter {
  private config: ModelRouterConfig & typeof DEFAULT_CONFIG;
  private deviceCapabilities: DeviceCapabilities | null = null;
  private networkConditions: NetworkConditions | null = null;
  private latencyHistory: Map<InferenceSource, LatencyStats> = new Map();
  private modelCapabilities: Map<string, ModelCapabilities> = new Map();

  constructor(config: ModelRouterInitConfig = {}) {
    const defaultStrategy =
      config.strategy ??
      config.defaultStrategy ??
      DEFAULT_CONFIG.defaultStrategy;

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      defaultStrategy,
    };
    this.initializeLatencyHistory();

    // Initialize device capabilities from config if provided
    if (config.deviceCapabilities) {
      this.deviceCapabilities = config.deviceCapabilities;
    }

    // Initialize network experiences from config if provided
    if (config.networkConditions) {
      this.networkConditions = config.networkConditions;
    }

    // Register model capabilities if provided
    if (config.modelCapabilities) {
      for (const [modelId, caps] of Object.entries(config.modelCapabilities)) {
        this.registerModel(modelId, caps);
      }
    }

    // Initialize network experiences if needed
    if (!this.networkConditions) {
      this.detectNetworkConditions();
    }
  }

  /**
   * Initialize latency history with defaults
   */
  private initializeLatencyHistory(): void {
    const sources: InferenceSource[] = [
      'local-wasm',
      'local-webgpu',
      'edge',
      'cloud',
    ];
    for (const source of sources) {
      this.latencyHistory.set(source, {
        source,
        avgLatencyMs: this.getDefaultLatency(source),
        p50Ms: this.getDefaultLatency(source),
        p95Ms: this.getDefaultLatency(source) * 1.5,
        p99Ms: this.getDefaultLatency(source) * 2,
        samples: 0,
        successRate: 1,
        avgTokensPerSecond: this.getDefaultTPS(source),
      });
    }
  }

  /**
   * Get default latency estimate for source
   */
  private getDefaultLatency(source: InferenceSource): number {
    switch (source) {
      case 'local-webgpu':
        return 50;
      case 'local-wasm':
        return 200;
      case 'edge':
        return 100;
      case 'cloud':
        return 500;
    }
  }

  /**
   * Get default TPS estimate for source
   */
  private getDefaultTPS(source: InferenceSource): number {
    switch (source) {
      case 'local-webgpu':
        return 30;
      case 'local-wasm':
        return 5;
      case 'edge':
        return 50;
      case 'cloud':
        return 100;
    }
  }

  /**
   * Detect device capabilities
   */
  async detectDeviceCapabilities(): Promise<DeviceCapabilities> {
    const capabilities: DeviceCapabilities = {
      availableMemoryMB: 0,
      hasWebGPU: false,
      hasWASMSIMD: false,
      cpuCores: navigator.hardwareConcurrency || 4,
      deviceType: 'unknown',
      computeScore: 0,
    };

    // Check memory
    if ('deviceMemory' in navigator) {
      capabilities.availableMemoryMB =
        (navigator as Navigator & { deviceMemory: number }).deviceMemory * 1024;
    } else {
      // Estimate based on performance memory (Chrome only)
      const perfMemory = (
        performance as Performance & { memory?: { jsHeapSizeLimit: number } }
      ).memory;
      if (perfMemory) {
        capabilities.availableMemoryMB =
          perfMemory.jsHeapSizeLimit / (1024 * 1024);
      } else {
        capabilities.availableMemoryMB = 2048; // Conservative default
      }
    }

    // Check WebGPU
    if ('gpu' in navigator) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          capabilities.hasWebGPU = true;
          const limits = adapter.limits;
          capabilities.webGPULimits = {
            maxBufferSize: limits.maxBufferSize,
            maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
            maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
          };
        }
      } catch {
        capabilities.hasWebGPU = false;
      }
    }

    // Check WASM SIMD
    try {
      // Simple SIMD detection via feature test
      capabilities.hasWASMSIMD = await this.detectWASMSIMD();
    } catch {
      capabilities.hasWASMSIMD = false;
    }

    // Detect device type
    capabilities.deviceType = this.detectDeviceType();

    // Calculate compute score (0-100)
    capabilities.computeScore = this.calculateComputeScore(capabilities);

    this.deviceCapabilities = capabilities;
    return capabilities;
  }

  /**
   * Detect WASM SIMD support
   */
  private async detectWASMSIMD(): Promise<boolean> {
    // Feature detection via trying to instantiate a module with SIMD
    const simdBytes = new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d, // magic
      0x01,
      0x00,
      0x00,
      0x00, // version
      0x01,
      0x05,
      0x01,
      0x60,
      0x00,
      0x01,
      0x7b, // type section with v128
      0x03,
      0x02,
      0x01,
      0x00, // function section
      0x0a,
      0x0a,
      0x01,
      0x08,
      0x00,
      0xfd,
      0x0c,
      0x00,
      0x00,
      0x00,
      0x00,
      0x0b, // code section
    ]);

    try {
      await WebAssembly.compile(simdBytes);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect device type
   */
  private detectDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
    const ua = navigator.userAgent.toLowerCase();

    if (/mobile|android|iphone|ipod/.test(ua)) {
      return 'mobile';
    }
    if (/ipad|tablet/.test(ua)) {
      return 'tablet';
    }
    if (/windows|macintosh|linux/.test(ua)) {
      return 'desktop';
    }
    return 'unknown';
  }

  /**
   * Calculate compute score
   */
  private calculateComputeScore(capabilities: DeviceCapabilities): number {
    let score = 0;

    // Memory contribution (max 30 points)
    score += Math.min(30, (capabilities.availableMemoryMB / 8192) * 30);

    // CPU cores contribution (max 20 points)
    score += Math.min(20, (capabilities.cpuCores / 16) * 20);

    // WebGPU contribution (30 points)
    if (capabilities.hasWebGPU) {
      score += 30;
    }

    // WASM SIMD contribution (10 points)
    if (capabilities.hasWASMSIMD) {
      score += 10;
    }

    // Device type adjustment
    if (capabilities.deviceType === 'desktop') {
      score *= 1.0;
    } else if (capabilities.deviceType === 'tablet') {
      score *= 0.7;
    } else if (capabilities.deviceType === 'mobile') {
      score *= 0.5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Detect network experiences
   */
  detectNetworkConditions(): NetworkConditions {
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;

    const experiences: NetworkConditions = {
      effectiveType: 'unknown',
      bandwidthMbps: 10, // Conservative default
      rttMs: 100,
      isOffline: !navigator.onLine,
      dataSaverEnabled: false,
    };

    if (connection) {
      experiences.effectiveType =
        (connection.effectiveType as NetworkConditions['effectiveType']) ||
        'unknown';
      experiences.bandwidthMbps = connection.downlink || 10;
      experiences.rttMs = connection.rtt || 100;
      experiences.dataSaverEnabled = connection.saveData || false;
    }

    this.networkConditions = experiences;
    return experiences;
  }

  /**
   * Register model capabilities
   */
  registerModel(modelId: string, capabilities: ModelCapabilities): void {
    this.modelCapabilities.set(modelId, capabilities);
  }

  /**
   * Record latency observation
   */
  recordLatency(
    source: InferenceSource,
    latencyMs: number,
    success: boolean,
    tokensPerSecond?: number
  ): void {
    const stats = this.latencyHistory.get(source);
    if (!stats) return;

    // Exponential moving average
    const alpha = 0.1;
    stats.samples++;
    stats.avgLatencyMs = stats.avgLatencyMs * (1 - alpha) + latencyMs * alpha;

    if (tokensPerSecond !== undefined) {
      stats.avgTokensPerSecond =
        stats.avgTokensPerSecond * (1 - alpha) + tokensPerSecond * alpha;
    }

    // Update success rate
    const successAlpha = 0.05;
    stats.successRate =
      stats.successRate * (1 - successAlpha) + (success ? 1 : 0) * successAlpha;

    // Update percentiles (simplified approximation)
    if (stats.samples > 10) {
      stats.p50Ms = stats.avgLatencyMs;
      stats.p95Ms = stats.avgLatencyMs * 1.5;
      stats.p99Ms = stats.avgLatencyMs * 2;
    }
  }

  /**
   * Get route decision for a model request
   */
  route(
    modelId: string,
    options: {
      preferLatency?: boolean;
      preferQuality?: boolean;
      strategy?: RoutingStrategy;
      maxTokens?: number;
      streamingRequired?: boolean;
      qualityPriority?: number; // 0-1, higher = prefer quality
      latencyPriority?: number; // 0-1, higher = prefer speed
    } = {}
  ): RouteDecision | null {
    this.lastModelId = modelId;

    // Ensure we have device and network info
    if (!this.deviceCapabilities) {
      this.detectDeviceCapabilities().catch(() => {
        /* noop - detection may fail */
      });
    }
    if (!this.networkConditions) {
      this.detectNetworkConditions();
    }

    // Handle new preference parameters
    let strategy = options.strategy;
    if (!strategy) {
      if (options.preferLatency) {
        strategy = 'latency-optimized';
      } else if (options.preferQuality) {
        strategy = 'quality-optimized';
      } else {
        strategy =
          this.config.modelOverrides?.[modelId]?.strategy ||
          this.config.defaultStrategy;
      }
    }

    const modelCaps = this.modelCapabilities.get(modelId);
    const deviceCaps = this.deviceCapabilities;
    const network = this.networkConditions;

    if (!deviceCaps || !network) {
      return null;
    }

    // Check for forced routing
    const override = this.config.modelOverrides?.[modelId];
    if (override?.forceLocal) {
      return this.createDecision(
        'local-webgpu',
        [],
        'Forced local execution',
        1.0
      );
    }
    if (override?.forceEdge) {
      return this.createDecision(
        'edge',
        ['cloud'],
        'Forced edge execution',
        1.0
      );
    }

    // If offline, must use local
    if (network.isOffline) {
      const localSource = deviceCaps.hasWebGPU ? 'local-webgpu' : 'local-wasm';
      return this.createDecision(localSource, [], 'Device is offline', 0.9);
    }

    // Check if model can run locally
    const canRunLocally = this.canRunLocally(modelId, deviceCaps, modelCaps);

    // Route based on strategy
    switch (strategy) {
      case 'local-first':
        return this.routeLocalFirst(canRunLocally, deviceCaps, network);

      case 'edge-first':
        return this.routeEdgeFirst(canRunLocally, deviceCaps, network);

      case 'cost-optimized':
        return this.routeCostOptimized(canRunLocally, deviceCaps, network);

      case 'latency-optimized':
        return this.routeLatencyOptimized(canRunLocally, deviceCaps, network);

      case 'quality-optimized':
        return this.routeQualityOptimized(canRunLocally, deviceCaps, network);

      case 'hybrid':
        return this.routeHybrid(canRunLocally, deviceCaps, network);

      case 'adaptive':
      default:
        return this.routeAdaptive(canRunLocally, deviceCaps, network, options);
    }
  }

  /**
   * Async version of route for backward compatibility
   */
  async routeAsync(
    modelId: string,
    options: {
      strategy?: RoutingStrategy;
      maxTokens?: number;
      streamingRequired?: boolean;
      qualityPriority?: number;
      latencyPriority?: number;
    } = {}
  ): Promise<RouteDecision> {
    // Ensure we have device and network info
    if (!this.deviceCapabilities) {
      await this.detectDeviceCapabilities();
    }
    if (!this.networkConditions) {
      this.detectNetworkConditions();
    }

    const result = this.route(modelId, options);
    if (!result) {
      throw new Error('Could not determine routing');
    }
    return result;
  }

  /**
   * Check if model can run locally
   */
  private canRunLocally(
    modelId: string,
    device: DeviceCapabilities,
    model?: ModelCapabilities
  ): { webgpu: boolean; wasm: boolean } {
    if (!model) {
      // Unknown model, assume it can run if we have resources
      return {
        webgpu: device.hasWebGPU && device.availableMemoryMB > 500,
        wasm: device.availableMemoryMB > 300,
      };
    }

    const hasEnoughMemory = device.availableMemoryMB >= model.minMemoryMB;

    return {
      webgpu: device.hasWebGPU && hasEnoughMemory && !model.requiresWebGPU,
      wasm: model.supportsWASM && hasEnoughMemory,
    };
  }

  /**
   * Route with local-first strategy
   */
  private routeLocalFirst(
    canRunLocally: { webgpu: boolean; wasm: boolean },
    device: DeviceCapabilities,
    _network: NetworkConditions
  ): RouteDecision {
    if (canRunLocally.webgpu) {
      return this.createDecision(
        'local-webgpu',
        ['local-wasm', 'edge', 'cloud'],
        'Local WebGPU available',
        0.9
      );
    }
    if (canRunLocally.wasm) {
      return this.createDecision(
        'local-wasm',
        ['edge', 'cloud'],
        'Local WASM available',
        0.8
      );
    }
    return this.createDecision(
      'edge',
      ['cloud'],
      'Local execution not available',
      0.7
    );
  }

  /**
   * Route with edge-first strategy
   */
  private routeEdgeFirst(
    canRunLocally: { webgpu: boolean; wasm: boolean },
    _device: DeviceCapabilities,
    network: NetworkConditions
  ): RouteDecision {
    // Poor network, fallback to local
    if (network.rttMs > 500 || network.bandwidthMbps < 1) {
      if (canRunLocally.webgpu) {
        return this.createDecision(
          'local-webgpu',
          ['local-wasm', 'edge'],
          'Poor network, using local',
          0.7
        );
      }
      if (canRunLocally.wasm) {
        return this.createDecision(
          'local-wasm',
          ['edge'],
          'Poor network, using local WASM',
          0.6
        );
      }
    }

    const fallbacks: InferenceSource[] = [];
    if (canRunLocally.webgpu) fallbacks.push('local-webgpu');
    if (canRunLocally.wasm) fallbacks.push('local-wasm');
    fallbacks.push('cloud');

    return this.createDecision('edge', fallbacks, 'Edge-first strategy', 0.85);
  }

  /**
   * Route with cost optimization
   */
  private routeCostOptimized(
    canRunLocally: { webgpu: boolean; wasm: boolean },
    _device: DeviceCapabilities,
    network: NetworkConditions
  ): RouteDecision {
    // Prefer local execution (free) when available; otherwise prefer edge (cheap).
    // Cloud remains an explicit fallback.
    if (canRunLocally.webgpu) {
      return this.createDecision(
        'local-webgpu',
        ['local-wasm', 'edge', 'cloud'],
        'Cost optimized: local WebGPU (free)',
        0.9
      );
    }

    if (canRunLocally.wasm) {
      return this.createDecision(
        'local-wasm',
        ['edge', 'cloud'],
        'Cost optimized: local WASM (free)',
        0.85
      );
    }

    // Poor network can still force cloud last; edge first for privacy/cost.
    const fallbacks: InferenceSource[] = ['cloud'];
    if (network.rttMs > 800 || network.bandwidthMbps < 0.5) {
      fallbacks.unshift('local-wasm');
    }

    return this.createDecision('edge', fallbacks, 'Cost optimized: edge', 0.75);
  }

  /**
   * Route with latency optimization
   */
  private routeLatencyOptimized(
    canRunLocally: { webgpu: boolean; wasm: boolean },
    device: DeviceCapabilities,
    network: NetworkConditions
  ): RouteDecision {
    const stats = {
      webgpu: this.latencyHistory.get('local-webgpu')!,
      wasm: this.latencyHistory.get('local-wasm')!,
      edge: this.latencyHistory.get('edge')!,
      cloud: this.latencyHistory.get('cloud')!,
    };

    // Compare expected latencies
    const options: Array<{
      source: InferenceSource;
      latency: number;
      available: boolean;
    }> = [
      {
        source: 'local-webgpu',
        latency: stats.webgpu.avgLatencyMs,
        available: canRunLocally.webgpu,
      },
      {
        source: 'local-wasm',
        latency: stats.wasm.avgLatencyMs,
        available: canRunLocally.wasm,
      },
      {
        source: 'edge',
        latency: stats.edge.avgLatencyMs + network.rttMs,
        available: true,
      },
      {
        source: 'cloud',
        latency: stats.cloud.avgLatencyMs + network.rttMs * 2,
        available: true,
      },
    ];

    // Sort by latency, filter to available
    const available = options
      .filter((o) => o.available)
      .sort((a, b) => a.latency - b.latency);

    const primary = available[0];
    const fallbacks = available.slice(1).map((o) => o.source);

    return this.createDecision(
      primary.source,
      fallbacks,
      `Latency optimized: ${primary.latency.toFixed(0)}ms expected`,
      0.85,
      primary.latency
    );
  }

  /**
   * Route with quality optimization
   */
  private routeQualityOptimized(
    _canRunLocally: { webgpu: boolean; wasm: boolean },
    _device: DeviceCapabilities,
    network: NetworkConditions
  ): RouteDecision {
    // Prefer cloud for highest quality, then edge
    if (network.bandwidthMbps > 5 && network.rttMs < 200) {
      return this.createDecision(
        'cloud',
        ['edge'],
        'Quality optimized: cloud',
        0.9
      );
    }
    return this.createDecision(
      'edge',
      ['cloud'],
      'Quality optimized: edge',
      0.85
    );
  }

  /**
   * Route with hybrid mode
   */
  private routeHybrid(
    canRunLocally: { webgpu: boolean; wasm: boolean },
    _device: DeviceCapabilities,
    network: NetworkConditions
  ): RouteDecision {
    const localSource = canRunLocally.webgpu
      ? 'local-webgpu'
      : canRunLocally.wasm
      ? 'local-wasm'
      : null;

    if (!localSource) {
      return this.createDecision(
        'edge',
        ['cloud'],
        'Hybrid not available, using edge',
        0.7
      );
    }

    // Hybrid: generate first tokens locally, then switch to edge
    const decision = this.createDecision(
      localSource,
      ['edge', 'cloud'],
      'Hybrid mode: local start, edge continuation',
      0.85
    );

    decision.hybrid = {
      localTokens: 10, // Generate 10 tokens locally first
      switchThreshold: 0.5, // Switch if local TPS drops below 50% of expected
    };

    return decision;
  }

  /**
   * Route adaptively based on all factors
   */
  private routeAdaptive(
    canRunLocally: { webgpu: boolean; wasm: boolean },
    device: DeviceCapabilities,
    network: NetworkConditions,
    options: { qualityPriority?: number; latencyPriority?: number }
  ): RouteDecision {
    const qualityWeight = options.qualityPriority ?? 0.5;
    const latencyWeight = options.latencyPriority ?? 0.5;

    const stats = {
      webgpu: this.latencyHistory.get('local-webgpu')!,
      wasm: this.latencyHistory.get('local-wasm')!,
      edge: this.latencyHistory.get('edge')!,
      cloud: this.latencyHistory.get('cloud')!,
    };

    // Score each option
    const scores: Array<{
      source: InferenceSource;
      score: number;
      available: boolean;
    }> = [];

    // Local WebGPU
    if (canRunLocally.webgpu) {
      const latencyScore = 1 - stats.webgpu.avgLatencyMs / 1000;
      const qualityScore = 0.8; // Good quality
      const costScore = 1.0; // Free
      const reliabilityScore = stats.webgpu.successRate;

      scores.push({
        source: 'local-webgpu',
        score:
          latencyScore * latencyWeight +
          qualityScore * qualityWeight +
          costScore * 0.2 +
          reliabilityScore * 0.1,
        available: true,
      });
    }

    // Local WASM
    if (canRunLocally.wasm) {
      const latencyScore = 1 - stats.wasm.avgLatencyMs / 1000;
      const qualityScore = 0.6;
      const costScore = 1.0;
      const reliabilityScore = stats.wasm.successRate;

      scores.push({
        source: 'local-wasm',
        score:
          latencyScore * latencyWeight +
          qualityScore * qualityWeight +
          costScore * 0.2 +
          reliabilityScore * 0.1,
        available: true,
      });
    }

    // Edge
    const edgeLatency = stats.edge.avgLatencyMs + network.rttMs;
    const edgeLatencyScore = 1 - edgeLatency / 1000;
    const edgeQualityScore = 0.9;
    const edgeCostScore = 0.5;
    const edgeReliabilityScore = stats.edge.successRate;

    scores.push({
      source: 'edge',
      score:
        edgeLatencyScore * latencyWeight +
        edgeQualityScore * qualityWeight +
        edgeCostScore * 0.2 +
        edgeReliabilityScore * 0.1,
      available: !network.isOffline,
    });

    // Cloud
    const cloudLatency = stats.cloud.avgLatencyMs + network.rttMs * 2;
    const cloudLatencyScore = 1 - cloudLatency / 1000;
    const cloudQualityScore = 1.0;
    const cloudCostScore = 0.2;
    const cloudReliabilityScore = stats.cloud.successRate;

    scores.push({
      source: 'cloud',
      score:
        cloudLatencyScore * latencyWeight +
        cloudQualityScore * qualityWeight +
        cloudCostScore * 0.2 +
        cloudReliabilityScore * 0.1,
      available: !network.isOffline,
    });

    // Sort by score
    const sorted = scores
      .filter((s) => s.available)
      .sort((a, b) => b.score - a.score);

    if (sorted.length === 0) {
      throw new Error('No inference sources available');
    }

    const primary = sorted[0];
    const fallbacks = sorted.slice(1).map((s) => s.source);

    return this.createDecision(
      primary.source,
      fallbacks,
      `Adaptive routing: score ${primary.score.toFixed(2)}`,
      primary.score
    );
  }

  /**
   * Create route decision
   */
  private routingDecisionCount = 0;

  private createDecision(
    primary: InferenceSource,
    fallbacks: InferenceSource[],
    reason: string,
    confidence: number,
    estimatedLatencyMs?: number,
    estimatedCost?: number
  ): RouteDecision {
    const stats = this.latencyHistory.get(primary);
    this.routingDecisionCount++;

    const cost =
      estimatedCost ??
      this.estimateCost(this.lastModelId || 'default', primary, 1000);
    const decision: RouteDecision = {
      primary,
      source: primary,
      fallbacks,
      reason,
      confidence,
      estimatedLatencyMs: estimatedLatencyMs ?? stats?.avgLatencyMs ?? 100,
      estimatedTPS: stats?.avgTokensPerSecond ?? 10,
      estimatedCost: cost,
    };

    this.config.onRouteDecision?.(decision);
    return decision;
  }

  private lastModelId: string | null = null;

  /**
   * Get latency statistics
   */
  getLatencyStats(): Map<InferenceSource, LatencyStats> {
    return new Map(this.latencyHistory);
  }

  /**
   * Get device capabilities
   */
  getDeviceCapabilities(): DeviceCapabilities | null {
    return this.deviceCapabilities;
  }

  /**
   * Get network experiences
   */
  getNetworkConditions(): NetworkConditions | null {
    return this.networkConditions;
  }

  /**
   * Estimate cost for inference on a given source
   */
  estimateCost(
    modelId: string,
    source: InferenceSource,
    tokenCount: number
  ): number {
    const baseCosts: Record<InferenceSource, number> = {
      'local-wasm': 0.0,
      'local-webgpu': 0.0,
      edge: 0.0001, // Very cheap per token
      cloud: 0.001, // More expensive
    };

    const baseRate = baseCosts[source];
    // Apply multiplier based on model size (use more specific checks first)
    const modelMultiplier = modelId.includes('mini')
      ? 0.5
      : modelId.includes('gpt-4')
      ? 2.0
      : 1.0;

    return baseRate * tokenCount * modelMultiplier;
  }

  /**
   * Get routing statistics and metrics
   */
  getRoutingStats() {
    const sourceStats: Record<InferenceSource, any> = {
      'local-wasm': null,
      'local-webgpu': null,
      edge: null,
      cloud: null,
    };

    for (const [source, latencyStats] of this.latencyHistory) {
      sourceStats[source] = {
        avgLatencyMs: latencyStats.avgLatencyMs,
        p50Ms: latencyStats.p50Ms,
        p95Ms: latencyStats.p95Ms,
        p99Ms: latencyStats.p99Ms,
        avgTokensPerSecond: latencyStats.avgTokensPerSecond,
        successRate: latencyStats.successRate,
        samples: latencyStats.samples,
      };
    }

    return {
      totalDecisions: this.routingDecisionCount,
      sourceStats,
    };
  }

  /**
   * Update device capabilities (for testing and dynamic updates)
   */
  updateDeviceCapabilities(capabilities: DeviceCapabilities): void {
    this.deviceCapabilities = capabilities;
  }

  /**
   * Register multiple models at once
   */
  registerModels(models: Record<string, ModelCapabilities>): void {
    for (const [modelId, capabilities] of Object.entries(models)) {
      this.registerModel(modelId, capabilities);
    }
  }
}

/**
 * Network Information API types
 */
interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/**
 * Pre-configured routing strategies
 */
export const ROUTING_STRATEGIES = {
  /** Prioritize local execution for privacy */
  privacy: {
    defaultStrategy: 'local-first' as RoutingStrategy,
    thresholds: {
      maxLocalLatencyMs: 10000,
      maxEdgeLatencyMs: 5000,
      minTokensPerSecond: 2,
    },
  },

  /** Prioritize speed */
  performance: {
    defaultStrategy: 'latency-optimized' as RoutingStrategy,
    thresholds: {
      maxLocalLatencyMs: 2000,
      maxEdgeLatencyMs: 1000,
      minTokensPerSecond: 20,
    },
  },

  /** Minimize costs */
  economy: {
    defaultStrategy: 'cost-optimized' as RoutingStrategy,
    thresholds: {
      maxLocalLatencyMs: 15000,
      maxEdgeLatencyMs: 10000,
      minTokensPerSecond: 1,
    },
  },

  /** Balanced approach */
  balanced: {
    defaultStrategy: 'adaptive' as RoutingStrategy,
    thresholds: {
      maxLocalLatencyMs: 5000,
      maxEdgeLatencyMs: 2000,
      minTokensPerSecond: 5,
    },
  },
} as const;
