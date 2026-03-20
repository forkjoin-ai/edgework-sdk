/**
 * Real-time streaming processor for large datasets
 * Supports chunked processing with incremental statistical analysis
 */

import { createReadStream } from 'node:fs';
import { Readable, Transform, Writable } from 'stream';
import { StatisticalContext } from '../common-types';
import { StatisticalAnalyzer } from '../statistical/analyzer';

export interface StreamOptions {
  chunkSize: number;
  maxConcurrency: number;
  enableIncrementalStats: boolean;
  memoryLimit: number; // MB
  bufferSize: number;
}

export interface StreamProgress {
  processed: number;
  total: number;
  percentage: number;
  rate: number; // items per second
  eta: number; // estimated time remaining in seconds
}

export interface StreamResult {
  success: boolean;
  processed: number;
  errors: number;
  processingTime: number;
  statisticalContext?: StatisticalContext;
  chunks: ChunkResult[];
}

export interface ChunkResult {
  index: number;
  size: number;
  processingTime: number;
  statisticalContext?: StatisticalContext;
  errors: string[];
}

export class StreamProcessor {
  private options: StreamOptions;
  startTime = 0;
  processedCount = 0;
  errorCount = 0;
  chunks: ChunkResult[] = [];
  incrementalStats: StatisticalContext | null = null;

  constructor(options: Partial<StreamOptions> = {}) {
    this.options = {
      chunkSize: 1000,
      maxConcurrency: 4,
      enableIncrementalStats: true,
      memoryLimit: 512, // 512MB
      bufferSize: 10000,
      ...options,
    };
  }

  /**
   * Process a readable stream in chunks
   */
  async processStream(
    inputStream: Readable,
    transformFunction: (chunk: any[]) => Promise<any>,
    onProgress?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    this.startTime = Date.now();
    this.processedCount = 0;
    this.errorCount = 0;
    this.chunks = [];

    return new Promise((resolve, reject) => {
      const chunks: any[][] = [];
      let currentChunk: any[] = [];
      const chunkIndex = 0;

      const chunkTransform = new Transform({
        objectMode: true,
        transform: (data, encoding, callback) => {
          currentChunk.push(data);

          if (currentChunk.length >= this.options.chunkSize) {
            chunks.push([...currentChunk]);
            currentChunk = [];
          }

          callback();
        },
        flush: (callback) => {
          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
          }
          callback();
        },
      });

      const processChunks = async () => {
        const results: ChunkResult[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkStartTime = Date.now();

          try {
            // Process the chunk
            const result = await transformFunction(chunk);

            // Update incremental statistics if enabled
            if (this.options.enableIncrementalStats) {
              this.updateIncrementalStats(chunk);
            }

            const processingTime = Date.now() - chunkStartTime;
            this.processedCount += chunk.length;

            results.push({
              index: i,
              size: chunk.length,
              processingTime,
              statisticalContext: this.options.enableIncrementalStats
                ? this.incrementalStats!
                : undefined,
              errors: [],
            });

            // Report progress
            if (onProgress) {
              const progress = this.calculateProgress(chunks.length, i + 1);
              onProgress(progress);
            }
          } catch (error) {
            this.errorCount++;
            results.push({
              index: i,
              size: chunk.length,
              processingTime: Date.now() - chunkStartTime,
              errors: [error instanceof Error ? error.message : String(error)],
            });
          }
        }

        return results;
      };

      inputStream
        .pipe(chunkTransform)
        .on('finish', async () => {
          try {
            this.chunks = await processChunks();
            resolve({
              success: true,
              processed: this.processedCount,
              errors: this.errorCount,
              processingTime: Date.now() - this.startTime,
              statisticalContext: this.incrementalStats || undefined,
              chunks: this.chunks,
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Process CSV stream with automatic parsing
   */
  async processCSVStream(
    inputStream: Readable,
    options: { delimiter?: string; headers?: boolean } = {},
    onProgress?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    const { delimiter = ',', headers = true } = options;
    let headerRow: string[] = [];
    let isFirstRow = headers;

    const transformFunction = async (chunk: string[]) => {
      const rows = chunk
        .map((line) => {
          const values = line.split(delimiter).map((v) => v.trim());

          if (isFirstRow && headers) {
            headerRow = values;
            isFirstRow = false;
            return null;
          }

          const obj: Record<string, any> = {};
          headerRow.forEach((header, index) => {
            const value = values[index];
            // Try to parse as number
            const numValue = parseFloat(value);
            obj[header] = isNaN(numValue) ? value : numValue;
          });

          return obj;
        })
        .filter((row) => row !== null);

      return rows;
    };

    return this.processStream(inputStream, transformFunction, onProgress);
  }

  /**
   * Process JSON stream (one JSON object per line)
   */
  async processJSONStream(
    inputStream: Readable,
    onProgress?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    const transformFunction = async (chunk: string[]) => {
      const objects = chunk
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            console.warn(`Failed to parse JSON: ${line}`);
            return null;
          }
        })
        .filter((obj) => obj !== null);

      return objects;
    };

    return this.processStream(inputStream, transformFunction, onProgress);
  }

  /**
   * Process SQL results stream
   */
  async processSQLStream(
    inputStream: Readable,
    onProgress?: (progress: StreamProgress) => void
  ): Promise<StreamResult> {
    const transformFunction = async (chunk: any[]) => {
      // Assume chunk contains SQL result rows
      return chunk;
    };

    return this.processStream(inputStream, transformFunction, onProgress);
  }

  /**
   * Update incremental statistics
   */
  private updateIncrementalStats(chunk: any[]): void {
    if (!this.incrementalStats) {
      this.incrementalStats =
        StatisticalAnalyzer.generateStatisticalContext(chunk);
    } else {
      // Merge new chunk statistics with existing ones
      const newStats = StatisticalAnalyzer.generateStatisticalContext(chunk);
      this.mergeStatistics(this.incrementalStats, newStats);
    }
  }

  /**
   * Merge statistical contexts
   */
  private mergeStatistics(
    existing: StatisticalContext,
    newStats: StatisticalContext
  ): void {
    // Merge outliers
    existing.outliers = [...existing.outliers, ...newStats.outliers];

    // Merge distribution (simplified - would need proper statistical merging)
    if (newStats.distribution) {
      const n1 = existing.distribution?.mean || 0;
      const n2 = newStats.distribution.mean;
      const combinedMean = (n1 + n2) / 2;

      existing.distribution = {
        ...existing.distribution,
        mean: combinedMean,
        // Other distribution metrics would need proper statistical merging
      };
    }

    // Merge patterns
    existing.patterns = [
      ...new Set([...existing.patterns, ...newStats.patterns]),
    ];

    // Update data quality
    if (existing.dataQuality && newStats.dataQuality) {
      existing.dataQuality = {
        completeness:
          (existing.dataQuality.completeness +
            newStats.dataQuality.completeness) /
          2,
        consistency:
          (existing.dataQuality.consistency +
            newStats.dataQuality.consistency) /
          2,
        outliers: existing.dataQuality.outliers + newStats.dataQuality.outliers,
      };
    }
  }

  /**
   * Calculate processing progress
   */
  private calculateProgress(
    totalChunks: number,
    processedChunks: number
  ): StreamProgress {
    const elapsed = Date.now() - this.startTime;
    const rate = this.processedCount / (elapsed / 1000); // items per second
    const remainingChunks = totalChunks - processedChunks;
    const eta =
      remainingChunks > 0
        ? (remainingChunks * this.options.chunkSize) / rate
        : 0;

    return {
      processed: this.processedCount,
      total: totalChunks * this.options.chunkSize,
      percentage: (processedChunks / totalChunks) * 100,
      rate,
      eta,
    };
  }

  /**
   * Create a readable stream from various sources
   */
  static createReadableStream(source: string | Readable): Readable {
    if (source instanceof Readable) {
      return source;
    }

    // Create stream from file path
    return createReadStream(source, { encoding: 'utf8' });
  }

  /**
   * Create a transform stream for line-by-line processing
   */
  static createLineTransform(): Transform {
    let buffer = '';

    return new Transform({
      transform: function (this: Transform, chunk, encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        lines.forEach((line) => {
          if (line.trim()) {
            this.push(line.trim());
          }
        });

        callback();
      },
      flush: function (this: Transform, callback) {
        if (buffer.trim()) {
          this.push(buffer.trim());
        }
        callback();
      },
    });
  }

  /**
   * Monitor memory usage
   */
  getMemoryUsage(): { used: number; limit: number; percentage: number } {
    const used = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    return {
      used,
      limit: this.options.memoryLimit,
      percentage: (used / this.options.memoryLimit) * 100,
    };
  }

  /**
   * Check if memory limit is exceeded
   */
  isMemoryLimitExceeded(): boolean {
    const usage = this.getMemoryUsage();
    return usage.percentage > 80; // 80% threshold
  }
}
