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
 * Default configuration
 */
const DEFAULT_CONFIG = {
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
  constructor(config = {}) {
    this.networkMonitorInterval = null;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.networkProfile = this.detectNetworkProfile();
    this.currentStrategy = this.calculateStrategy();
    this.stats = this.createEmptyStats();
  }
  /**
   * Create empty stats
   */
  createEmptyStats() {
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
  startMonitoring(intervalMs = 5000) {
    if (this.networkMonitorInterval) return;
    // Listen for connection changes
    const connection = navigator.connection;
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
  stopMonitoring() {
    if (this.networkMonitorInterval) {
      clearInterval(this.networkMonitorInterval);
      this.networkMonitorInterval = null;
    }
  }
  /**
   * Detect current network profile
   */
  detectNetworkProfile() {
    const connection = navigator.connection;
    const profile = {
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
  mapEffectiveType(effectiveType) {
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
  updateNetworkProfile() {
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
  handleNetworkChange() {
    this.updateNetworkProfile();
  }
  /**
   * Calculate optimization strategy
   */
  calculateStrategy() {
    const { bandwidthMbps, dataSaver, metered } = this.networkProfile;
    const thresholds = this.config.qualityThresholds;
    // Determine quality level
    let quality;
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
    let format;
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
    const formatOrder = ['fp32', 'fp16', 'fp8', 'int8', 'int4'];
    const preferredIndex = formatOrder.indexOf(this.config.preferredFormat);
    const calculatedIndex = formatOrder.indexOf(format);
    if (preferredIndex > calculatedIndex) {
      format = this.config.preferredFormat;
    }
    // Determine compression
    let compression = this.config.preferredCompression;
    if (quality === 'ultra' && bandwidthMbps > 100) {
      compression = 'none'; // Don't compress on very fast connections
    } else if (quality === 'minimal') {
      compression = 'brotli'; // Maximum compression for slow connections
    }
    // Calculate chunk size
    const chunkSize = this.calculateChunkSize(bandwidthMbps);
    // Determine concurrency
    let maxConcurrent;
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
  calculateChunkSize(bandwidthMbps) {
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
  estimateSaving(format, compression) {
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
  recalculateStrategy() {
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
  getStrategy() {
    return { ...this.currentStrategy };
  }
  /**
   * Get network profile
   */
  getNetworkProfile() {
    return { ...this.networkProfile };
  }
  /**
   * Set manual strategy override
   */
  setStrategy(strategy) {
    this.currentStrategy = { ...this.currentStrategy, ...strategy };
    this.config.onStrategyChange?.(this.currentStrategy);
  }
  /**
   * Optimize request headers
   */
  getOptimizedHeaders() {
    const headers = {};
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
  async optimizeBody(body) {
    const originalSize = this.getBodySize(body);
    let data = body;
    const headers = {};
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
  getBodySize(body) {
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
  async compress(data) {
    // Convert to Uint8Array
    let bytes;
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
      const chunks = [];
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
        data: compressed.buffer,
        encoding: algorithm === 'gzip' ? 'gzip' : 'deflate',
        size: compressed.length,
      };
    }
    // Fallback: no compression
    return {
      data: bytes.buffer || new ArrayBuffer(0),
      encoding: 'identity',
      size: bytes.length,
    };
  }
  /**
   * Decompress response
   */
  async decompressResponse(response) {
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
      const chunks = [];
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
  recordTransfer(bytes, failed = false) {
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
  updateCompressionRatio() {
    const totalOriginal = this.stats.bytesSent + this.stats.bytesSaved;
    if (totalOriginal > 0) {
      this.stats.compressionRatio = this.stats.bytesSent / totalOriginal;
    }
  }
  /**
   * Get transfer stats
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * Reset stats
   */
  resetStats() {
    this.stats = this.createEmptyStats();
  }
  /**
   * Get quality for current network
   */
  getRecommendedQuality() {
    return this.currentStrategy.quality;
  }
  /**
   * Check if network is suitable for operation
   */
  isNetworkSuitable(minBandwidth) {
    return this.networkProfile.bandwidthMbps >= minBandwidth;
  }
}
/**
 * Pre-configured optimizer presets
 */
export const BANDWIDTH_PRESETS = {
  /** Maximum quality, no optimization */
  maxQuality: {
    autoOptimize: false,
    preferredFormat: 'fp32',
    preferredCompression: 'none',
  },
  /** Balanced quality and bandwidth */
  balanced: {
    autoOptimize: true,
    preferredFormat: 'fp16',
    preferredCompression: 'gzip',
  },
  /** Aggressive optimization for slow networks */
  dataSaver: {
    autoOptimize: true,
    preferredFormat: 'int8',
    preferredCompression: 'brotli',
    enablePrefetch: false,
    qualityThresholds: {
      ultraMinBandwidth: 100,
      highMinBandwidth: 50,
      mediumMinBandwidth: 10,
      lowMinBandwidth: 2,
    },
  },
};
//# sourceMappingURL=bandwidth-optimizer.js.map
