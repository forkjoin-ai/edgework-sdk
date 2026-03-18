/**
 * OpenTelemetry Trace Exporter
 *
 * Exports spans in OpenTelemetry-compatible format.
 * Can be configured to send to any OTel collector endpoint.
 */

import type { Span, TraceExporter } from '../../core/types';

export interface OTelExporterConfig {
  /** OTel collector endpoint */
  endpoint: string;
  /** Service name */
  serviceName?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Batch size before flush */
  batchSize?: number;
}

export class OpenTelemetryExporter implements TraceExporter {
  private config: OTelExporterConfig;
  private buffer: Span[] = [];
  private batchSize: number;

  constructor(config: OTelExporterConfig) {
    this.config = config;
    this.batchSize = config.batchSize ?? 100;
  }

  exportSpan(span: Span): void {
    this.buffer.push(span);
    if (this.buffer.length >= this.batchSize) {
      // Fire-and-forget flush
      this.flush().catch(() => {
        /* fire-and-forget */
      });
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const spans = [...this.buffer];
    this.buffer = [];

    const otelSpans = spans.map((span) => this.toOTelSpan(span));

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers ?? {}),
        },
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [
                  {
                    key: 'service.name',
                    value: {
                      stringValue: this.config.serviceName ?? 'eadk-agent',
                    },
                  },
                ],
              },
              scopeSpans: [
                {
                  scope: { name: 'eadk', version: '0.1.0' },
                  spans: otelSpans,
                },
              ],
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `OTel collector request failed with status ${response.status}`
        );
      }
    } catch {
      // Re-buffer on unmet expectations
      this.buffer.unshift(...spans);
    }
  }

  private toOTelSpan(span: Span): Record<string, unknown> {
    return {
      traceId: this.toHexId(span.traceId, 32),
      spanId: this.toHexId(span.id, 16),
      parentSpanId: span.parentId ? this.toHexId(span.parentId, 16) : undefined,
      name: span.name,
      kind: 1, // INTERNAL
      startTimeUnixNano: this.toUnixNanos(span.startTime),
      endTimeUnixNano: this.toUnixNanos(span.endTime ?? Date.now()),
      status: {
        code: span.status === 'error' ? 2 : span.status === 'ok' ? 1 : 0,
        message: span.error?.message,
      },
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: this.toAnyValue(value),
      })),
      events: span.events.map((e) => ({
        timeUnixNano: this.toUnixNanos(e.timestamp),
        name: e.name,
        attributes: Object.entries(e.attributes ?? {}).map(([key, value]) => ({
          key,
          value: this.toAnyValue(value),
        })),
      })),
    };
  }

  private toHexId(value: string, expectedLength: number): string {
    const sanitized = value.toLowerCase().replace(/[^0-9a-f]/g, '');

    if (sanitized.length === expectedLength) {
      return sanitized;
    }

    if (sanitized.length > expectedLength) {
      return sanitized.slice(sanitized.length - expectedLength);
    }

    if (sanitized.length > 0) {
      return sanitized.padStart(expectedLength, '0');
    }

    return crypto.randomUUID().replace(/-/g, '').slice(0, expectedLength);
  }

  private toUnixNanos(unixMillis: number): string {
    const millis = Number.isFinite(unixMillis)
      ? Math.trunc(unixMillis)
      : Date.now();
    return (BigInt(millis) * 1_000_000n).toString();
  }

  private toAnyValue(value: unknown): Record<string, unknown> {
    if (value == null) {
      return { stringValue: '' };
    }

    if (typeof value === 'string') {
      return { stringValue: value };
    }

    if (typeof value === 'boolean') {
      return { boolValue: value };
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { intValue: value.toString() };
      }
      return { doubleValue: value };
    }

    try {
      return { stringValue: JSON.stringify(value) };
    } catch {
      return { stringValue: String(value) };
    }
  }
}
