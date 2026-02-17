/**
 * Bandwidth Optimizer
 *
 * Optimizes network usage for model inference:
 * - FP16/FP8 transfer formats
 * - Compression algorithms
 * - Adaptive quality based on network
 * - Partial model loading
 * - Delta updates
 */

/**
 * Compression algorithm
 */
export type CompressionAlgorithm = 'none' | 'gzip' | 'brotli' | 'lz4' | 'zstd';

/**
 * Transfer format
 */
export type TransferFormat = 'fp32' | 'fp16' | 'fp8' | 'int8' | 'int4';

/**
 * Quality level
 */
export type QualityLevel = 'ultra' | 'high' | 'medium' | 'low' | 'minimal';

/**
 * Network profile
 */
export interface NetworkProfile {
  /** Effective bandwidth in Mbps */
  bandwidthMbps: number;

  /** Round-trip time in ms */
  rttMs: number;

  /** Packet loss rate (0-1) */
  packetLoss: number;

  /** Connection type */
  connectionType: 'wifi' | '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

  /** Whether data saver is enabled */
  dataSaver: boolean;

  /** Metered connection */
  metered: boolean;
}

/**
 * Optimization strategy
 */
export interface OptimizationStrategy {
  /** Transfer format to use */
  format: TransferFormat;

  /** Compression algorithm */
  compression: CompressionAlgorithm;

  /** Quality level */
  quality: QualityLevel;

  /** Chunk size for streaming */
  chunkSize: number;

  /** Whether to prefetch next chunks */
  prefetch: boolean;

  /** Maximum concurrent requests */
  maxConcurrent: number;

  /** Use delta updates if available */
  useDelta: boolean;

  /** Estimated bandwidth saving (0-1) */
  estimatedSaving: number;
}

/**
 * Transfer statistics
 */
export interface TransferStats {
  /** Bytes sent */
  bytesSent: number;

  /** Bytes received */
  bytesReceived: number;

  /** Bytes saved by optimization */
  bytesSaved: number;

  /** Compression ratio */
  compressionRatio: number;

  /** Average transfer speed in bytes/s */
  avgSpeed: number;

  /** Transfer count */
  transferCount: number;

  /** Failed transfers */
  failedTransfers: number;
}

/**
 * Optimizer configuration
 */
export interface BandwidthOptimizerConfig {
  /** Enable automatic optimization */
  autoOptimize: boolean;

  /** Preferred compression */
  preferredCompression: CompressionAlgorithm;

  /** Preferred format */
  preferredFormat: TransferFormat;

  /** Quality thresholds */
  qualityThresholds: {
    ultraMinBandwidth: number; // Mbps
    highMinBandwidth: number;
    mediumMinBandwidth: number;
    lowMinBandwidth: number;
  };

  /** Maximum chunk size in bytes */
  maxChunkSize: number;

  /** Minimum chunk size in bytes */
  minChunkSize: number;

  /** Enable prefetching */
  enablePrefetch: boolean;

  /** Callback on strategy change */
  onStrategyChange?: (strategy: OptimizationStrategy) => void;

  /** Callback on network change */
  onNetworkChange?: (profile: NetworkProfile) => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BandwidthOptimizerConfig = {
  autoOptimize: true,
  preferredCompression: 'gzip',
  preferredFormat: 'fp16',
  qualityThresholds: {
    ultraMinBandwidth: 50,
    highMinBandwidth: 20,
    mediumMinBandwidth: 5,
    lowMinBandwidth: 1,
  },
  maxChunkSize: 64 * 1024, // 64KB
  minChunkSize: 4 * 1024, // 4KB
  enablePrefetch: true,
};

/**
 * Bandwidth Optimizer
 *
 * Optimizes network usage for edge inference.
 */
export class BandwidthOptimizer {
  private config: BandwidthOptimizerConfig;
  private networkProfile: NetworkProfile;
  private currentStrategy: OptimizationStrategy;
  private stats: TransferStats;
  private networkMonitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<BandwidthOptimizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.networkProfile = this.detectNetworkProfile();
    this.currentStrategy = this.calculateStrategy();
    this.stats = this.createEmptyStats();
  }

  /**
   * Create empty stats
   */
  private createEmptyStats(): TransferStats {
    return {
      bytesSent: 0,
      bytesReceived: 0,
      bytesSaved: 0,
      compressionRatio: 1,
      avgSpeed: 0,
      transferCount: 0,
      failedTransfers: 0,
    };
  }

  /**
   * Start network monitoring
   */
  startMonitoring(intervalMs = 5000): void {
    if (this.networkMonitorInterval) return;

    // Listen for connection changes
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;
    if (connection) {
      connection.addEventListener('change', () => this.handleNetworkChange());
    }

    // Periodic monitoring
    this.networkMonitorInterval = setInterval(() => {
      this.updateNetworkProfile();
    }, intervalMs);
  }

  /**
   * Stop network monitoring
   */
  stopMonitoring(): void {
    if (this.networkMonitorInterval) {
      clearInterval(this.networkMonitorInterval);
      this.networkMonitorInterval = null;
    }
  }

  /**
   * Detect current network profile
   */
  private detectNetworkProfile(): NetworkProfile {
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;

    const profile: NetworkProfile = {
      bandwidthMbps: 10, // Conservative default
      rttMs: 100,
      packetLoss: 0,
      connectionType: 'unknown',
      dataSaver: false,
      metered: false,
    };

    if (connection) {
      profile.bandwidthMbps = connection.downlink || 10;
      profile.rttMs = connection.rtt || 100;
      profile.dataSaver = connection.saveData || false;
      profile.connectionType = this.mapEffectiveType(connection.effectiveType);
    }

    return profile;
  }

  /**
   * Map effective type to connection type
   */
  private mapEffectiveType(
    effectiveType?: string
  ): NetworkProfile['connectionType'] {
    switch (effectiveType) {
      case 'slow-2g':
        return 'slow-2g';
      case '2g':
        return '2g';
      case '3g':
        return '3g';
      case '4g':
        return '4g';
      default:
        return 'unknown';
    }
  }

  /**
   * Update network profile
   */
  private updateNetworkProfile(): void {
    const newProfile = this.detectNetworkProfile();

    // Check if profile changed significantly
    const significantChange =
      Math.abs(newProfile.bandwidthMbps - this.networkProfile.bandwidthMbps) >
        5 ||
      Math.abs(newProfile.rttMs - this.networkProfile.rttMs) > 50 ||
      newProfile.connectionType !== this.networkProfile.connectionType;

    if (significantChange) {
      this.networkProfile = newProfile;
      this.config.onNetworkChange?.(newProfile);

      if (this.config.autoOptimize) {
        this.recalculateStrategy();
      }
    }
  }

  /**
   * Handle network change event
   */
  private handleNetworkChange(): void {
    this.updateNetworkProfile();
  }

  /**
   * Calculate optimization strategy
   */
  private calculateStrategy(): OptimizationStrategy {
    const { bandwidthMbps, dataSaver, metered } = this.networkProfile;
    const thresholds = this.config.qualityThresholds;

    // Determine quality level
    let quality: QualityLevel;
    if (dataSaver || metered) {
      quality = 'minimal';
    } else if (bandwidthMbps >= thresholds.ultraMinBandwidth) {
      quality = 'ultra';
    } else if (bandwidthMbps >= thresholds.highMinBandwidth) {
      quality = 'high';
    } else if (bandwidthMbps >= thresholds.mediumMinBandwidth) {
      quality = 'medium';
    } else if (bandwidthMbps >= thresholds.lowMinBandwidth) {
      quality = 'low';
    } else {
      quality = 'minimal';
    }

    // Determine format based on quality
    let format: TransferFormat;
    switch (quality) {
      case 'ultra':
        format = 'fp32';
        break;
      case 'high':
        format = 'fp16';
        break;
      case 'medium':
        format = 'fp16';
        break;
      case 'low':
        format = 'fp8';
        break;
      case 'minimal':
        format = 'int8';
        break;
    }

    // Use preferred format if it's more compact
    const formatOrder: TransferFormat[] = [
      'fp32',
      'fp16',
      'fp8',
      'int8',
      'int4',
    ];
    const preferredIndex = formatOrder.indexOf(this.config.preferredFormat);
    const calculatedIndex = formatOrder.indexOf(format);
    if (preferredIndex > calculatedIndex) {
      format = this.config.preferredFormat;
    }

    // Determine compression
    let compression: CompressionAlgorithm = this.config.preferredCompression;
    if (quality === 'ultra' && bandwidthMbps > 100) {
      compression = 'none'; // Don't compress on very fast connections
    } else if (quality === 'minimal') {
      compression = 'brotli'; // Maximum compression for slow connections
    }

    // Calculate chunk size
    const chunkSize = this.calculateChunkSize(bandwidthMbps);

    // Determine concurrency
    let maxConcurrent: number;
    if (bandwidthMbps > 20) {
      maxConcurrent = 6;
    } else if (bandwidthMbps > 5) {
      maxConcurrent = 4;
    } else {
      maxConcurrent = 2;
    }

    return {
      format,
      compression,
      quality,
      chunkSize,
      prefetch: this.config.enablePrefetch && quality !== 'minimal',
      maxConcurrent,
      useDelta: quality !== 'ultra', // Use delta for non-ultra quality
      estimatedSaving: this.estimateSaving(format, compression),
    };
  }

  /**
   * Calculate optimal chunk size
   */
  private calculateChunkSize(bandwidthMbps: number): number {
    // Target ~100ms per chunk for smooth streaming
    const targetTimeMs = 100;
    const bytesPerMs = (bandwidthMbps * 1024 * 1024) / 8 / 1000;
    const optimalSize = Math.round(bytesPerMs * targetTimeMs);

    return Math.max(
      this.config.minChunkSize,
      Math.min(this.config.maxChunkSize, optimalSize)
    );
  }

  /**
   * Estimate bandwidth saving
   */
  private estimateSaving(
    format: TransferFormat,
    compression: CompressionAlgorithm
  ): number {
    let saving = 0;

    // Format savings (relative to fp32)
    switch (format) {
      case 'fp16':
        saving += 0.5;
        break;
      case 'fp8':
        saving += 0.75;
        break;
      case 'int8':
        saving += 0.75;
        break;
      case 'int4':
        saving += 0.875;
        break;
    }

    // Compression savings (approximate)
    switch (compression) {
      case 'gzip':
        saving += 0.1;
        break;
      case 'brotli':
        saving += 0.15;
        break;
      case 'lz4':
        saving += 0.05;
        break;
      case 'zstd':
        saving += 0.12;
        break;
    }

    return Math.min(0.95, saving);
  }

  /**
   * Recalculate strategy
   */
  private recalculateStrategy(): void {
    const newStrategy = this.calculateStrategy();

    // Check if strategy changed
    const changed =
      newStrategy.format !== this.currentStrategy.format ||
      newStrategy.compression !== this.currentStrategy.compression ||
      newStrategy.quality !== this.currentStrategy.quality;

    if (changed) {
      this.currentStrategy = newStrategy;
      this.config.onStrategyChange?.(newStrategy);
    }
  }

  /**
   * Get current strategy
   */
  getStrategy(): OptimizationStrategy {
    return { ...this.currentStrategy };
  }

  /**
   * Get network profile
   */
  getNetworkProfile(): NetworkProfile {
    return { ...this.networkProfile };
  }

  /**
   * Set manual strategy override
   */
  setStrategy(strategy: Partial<OptimizationStrategy>): void {
    this.currentStrategy = { ...this.currentStrategy, ...strategy };
    this.config.onStrategyChange?.(this.currentStrategy);
  }

  /**
   * Optimize request headers
   */
  getOptimizedHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Request format
    headers['X-Transfer-Format'] = this.currentStrategy.format;

    // Request compression
    if (this.currentStrategy.compression !== 'none') {
      switch (this.currentStrategy.compression) {
        case 'gzip':
          headers['Accept-Encoding'] = 'gzip';
          break;
        case 'brotli':
          headers['Accept-Encoding'] = 'br';
          break;
        case 'zstd':
          headers['Accept-Encoding'] = 'zstd';
          break;
        case 'lz4':
          headers['Accept-Encoding'] = 'lz4';
          break;
      }
    }

    // Quality hint
    headers['X-Quality-Level'] = this.currentStrategy.quality;

    // Delta support
    if (this.currentStrategy.useDelta) {
      headers['X-Delta-Encoding'] = 'supported';
    }

    return headers;
  }

  /**
   * Optimize request body
   */
  async optimizeBody(body: ArrayBuffer | Blob | string): Promise<{
    data: ArrayBuffer | Blob | string;
    headers: Record<string, string>;
    originalSize: number;
    optimizedSize: number;
  }> {
    const originalSize = this.getBodySize(body);
    let data = body;
    const headers: Record<string, string> = {};

    // Apply compression if available and beneficial
    if (originalSize > 1024 && this.currentStrategy.compression !== 'none') {
      try {
        const compressed = await this.compress(body);
        if (compressed.size < originalSize * 0.9) {
          data = compressed.data;
          headers['Content-Encoding'] = compressed.encoding;
        }
      } catch (error) {
        // Fall back to uncompressed
      }
    }

    const optimizedSize = this.getBodySize(data);

    // Update stats
    this.stats.bytesSent += optimizedSize;
    this.stats.bytesSaved += originalSize - optimizedSize;
    this.stats.transferCount++;
    this.updateCompressionRatio();

    return {
      data,
      headers,
      originalSize,
      optimizedSize,
    };
  }

  /**
   * Get body size
   */
  private getBodySize(body: ArrayBuffer | Blob | string): number {
    if (body instanceof ArrayBuffer) {
      return body.byteLength;
    }
    if (body instanceof Blob) {
      return body.size;
    }
    return new TextEncoder().encode(body).length;
  }

  /**
   * Compress data
   */
  private async compress(data: ArrayBuffer | Blob | string): Promise<{
    data: ArrayBuffer | Blob;
    encoding: string;
    size: number;
  }> {
    // Convert to Uint8Array
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = new TextEncoder().encode(data);
    }

    // Use CompressionStream if available
    if ('CompressionStream' in globalThis) {
      const algorithm =
        this.currentStrategy.compression === 'gzip' ? 'gzip' : 'deflate';
      const cs = new CompressionStream(algorithm);
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();

      // Cast to Uint8Array for writer.write
      writer.write(new Uint8Array(bytes));
      writer.close();

      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }

      const compressed = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      return {
        data: compressed.buffer as ArrayBuffer,
        encoding: algorithm === 'gzip' ? 'gzip' : 'deflate',
        size: compressed.length,
      };
    }

    // Fallback: no compression
    return {
      data: (bytes.buffer as ArrayBuffer) || new ArrayBuffer(0),
      encoding: 'identity',
      size: bytes.length,
    };
  }

  /**
   * Decompress response
   */
  async decompressResponse(response: Response): Promise<ArrayBuffer> {
    const encoding = response.headers.get('Content-Encoding');
    const data = await response.arrayBuffer();

    if (!encoding || encoding === 'identity') {
      return data;
    }

    // Use DecompressionStream if available
    if ('DecompressionStream' in globalThis) {
      const algorithm = encoding === 'gzip' ? 'gzip' : 'deflate';
      const ds = new DecompressionStream(algorithm);
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      writer.write(new Uint8Array(data));
      writer.close();

      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }

      const decompressed = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }

      return decompressed.buffer;
    }

    return data;
  }

  /**
   * Record transfer
   */
  recordTransfer(bytes: number, failed = false): void {
    if (failed) {
      this.stats.failedTransfers++;
    } else {
      this.stats.bytesReceived += bytes;
      this.stats.transferCount++;
    }
  }

  /**
   * Update compression ratio
   */
  private updateCompressionRatio(): void {
    const totalOriginal = this.stats.bytesSent + this.stats.bytesSaved;
    if (totalOriginal > 0) {
      this.stats.compressionRatio = this.stats.bytesSent / totalOriginal;
    }
  }

  /**
   * Get transfer stats
   */
  getStats(): TransferStats {
    return { ...this.stats };
  }

  /**
   * Reset stats
   */
  resetStats(): void {
    this.stats = this.createEmptyStats();
  }

  /**
   * Get quality for current network
   */
  getRecommendedQuality(): QualityLevel {
    return this.currentStrategy.quality;
  }

  /**
   * Check if network is suitable for operation
   */
  isNetworkSuitable(minBandwidth: number): boolean {
    return this.networkProfile.bandwidthMbps >= minBandwidth;
  }
}

/**
 * Network Information API types
 */
interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/**
 * Pre-configured optimizer presets
 */
export const BANDWIDTH_PRESETS = {
  /** Maximum quality, no optimization */
  maxQuality: {
    autoOptimize: false,
    preferredFormat: 'fp32' as TransferFormat,
    preferredCompression: 'none' as CompressionAlgorithm,
  } as Partial<BandwidthOptimizerConfig>,

  /** Balanced quality and bandwidth */
  balanced: {
    autoOptimize: true,
    preferredFormat: 'fp16' as TransferFormat,
    preferredCompression: 'gzip' as CompressionAlgorithm,
  } as Partial<BandwidthOptimizerConfig>,

  /** Aggressive optimization for slow networks */
  dataSaver: {
    autoOptimize: true,
    preferredFormat: 'int8' as TransferFormat,
    preferredCompression: 'brotli' as CompressionAlgorithm,
    enablePrefetch: false,
    qualityThresholds: {
      ultraMinBandwidth: 100,
      highMinBandwidth: 50,
      mediumMinBandwidth: 10,
      lowMinBandwidth: 2,
    },
  } as Partial<BandwidthOptimizerConfig>,
};
