/**
 * EADK Tracer
 *
 * Automatic trace collection with span management.
 * Combines OpenAI Agents SDK tracing with OpenTelemetry export.
 */

import type { Span, SpanType, SpanEvent, TraceExporter } from '../core/types';

function createTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function createSpanId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Tracer collects spans during agent execution and exports them.
 */
export class Tracer {
  private spans: Map<string, Span> = new Map();
  private exporters: TraceExporter[] = [];
  private traceId: string;
  private enabled: boolean;

  constructor(options?: { exporters?: TraceExporter[]; enabled?: boolean }) {
    this.exporters = options?.exporters ?? [];
    this.enabled = options?.enabled ?? true;
    this.traceId = createTraceId();
  }

  /**
   * Start a new span.
   */
  startSpan(options: {
    name: string;
    type: SpanType;
    parentId?: string;
    attributes?: Record<string, unknown>;
  }): Span {
    const span: Span = {
      id: createSpanId(),
      parentId: options.parentId,
      traceId: this.traceId,
      type: options.type,
      name: options.name,
      startTime: Date.now(),
      attributes: options.attributes ?? {},
      events: [],
      status: 'unset',
    };

    if (this.enabled) {
      this.spans.set(span.id, span);
    }

    return span;
  }

  /**
   * End a span and export it.
   */
  endSpan(spanId: string, status?: 'ok' | 'error', error?: Error): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.status = status ?? 'ok';
    if (error) span.error = error;

    // Export to all exporters
    for (const exporter of this.exporters) {
      exporter.exportSpan(span);
    }
  }

  /**
   * Add an event to a span.
   */
  addSpanEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, unknown>
  ): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Set span attributes.
   */
  setSpanAttributes(spanId: string, attributes: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    Object.assign(span.attributes, attributes);
  }

  /**
   * Get all collected spans.
   */
  getSpans(): Span[] {
    return [...this.spans.values()];
  }

  /**
   * Get a specific span by ID.
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get the current trace ID.
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Flush all exporters.
   */
  async flush(): Promise<void> {
    await Promise.all(this.exporters.map((e) => e.flush()));
  }

  /**
   * Clear all spans (for testing).
   */
  clear(): void {
    this.spans.clear();
  }

  /**
   * Add an exporter.
   */
  addExporter(exporter: TraceExporter): void {
    this.exporters.push(exporter);
  }
}

/**
 * Global tracer instance (singleton for convenience).
 */
let globalTracer: Tracer | null = null;

export function getGlobalTracer(): Tracer {
  if (!globalTracer) {
    globalTracer = new Tracer();
  }
  return globalTracer;
}

export function setGlobalTracer(tracer: Tracer): void {
  globalTracer = tracer;
}
