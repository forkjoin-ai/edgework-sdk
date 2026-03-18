/**
 * Edgework Metrics Exporter
 *
 * Integrates with existing edgework MetricsReporter for
 * edge-native observability (latency, p2p routing, etc.).
 */

import type { Span, TraceExporter } from '../../core/types';

export interface EdgeworkExporterConfig {
  /** Callback to report spans to existing MetricsReporter */
  onSpan?: (span: Span) => void;
  /** Whether to include edge-specific attributes */
  includeEdgeMetrics?: boolean;
}

export class EdgeworkMetricsExporter implements TraceExporter {
  private config: EdgeworkExporterConfig;
  private spans: Span[] = [];

  constructor(config?: EdgeworkExporterConfig) {
    this.config = config ?? {};
  }

  exportSpan(span: Span): void {
    this.spans.push(span);

    // Enrich with edge-specific metrics
    if (this.config.includeEdgeMetrics) {
      span.attributes['edge.exporter'] = 'edgework';
      if (span.endTime && span.startTime) {
        span.attributes['edge.latency_ms'] = span.endTime - span.startTime;
      }
    }

    if (this.config.onSpan) {
      this.config.onSpan(span);
    }
  }

  async flush(): Promise<void> {
    // Edgework metrics are reported inline
    this.spans = [];
  }

  /**
   * Get performance summary for all collected spans.
   */
  getSummary(): {
    totalSpans: number;
    byType: Record<string, number>;
    averageLatency: Record<string, number>;
    errors: number;
  } {
    const byType: Record<string, number> = {};
    const latencies: Record<string, number[]> = {};
    let errors = 0;

    for (const span of this.spans) {
      byType[span.type] = (byType[span.type] ?? 0) + 1;

      if (span.status === 'error') errors++;

      if (span.endTime) {
        if (!latencies[span.type]) latencies[span.type] = [];
        latencies[span.type].push(span.endTime - span.startTime);
      }
    }

    const averageLatency: Record<string, number> = {};
    for (const [type, values] of Object.entries(latencies)) {
      averageLatency[type] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    return {
      totalSpans: this.spans.length,
      byType,
      averageLatency,
      errors,
    };
  }
}
