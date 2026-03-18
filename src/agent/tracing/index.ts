/**
 * EADK Tracing — Public API
 */

export { Tracer, getGlobalTracer, setGlobalTracer } from './tracer';

export { ConsoleExporter } from './exporters/console';
export { OpenTelemetryExporter } from './exporters/otel';
export type { OTelExporterConfig } from './exporters/otel';
export { EdgeworkMetricsExporter } from './exporters/edgework';
export type { EdgeworkExporterConfig } from './exporters/edgework';

// Re-export tracing types from core
export type { Span, SpanType, SpanEvent, TraceExporter } from '../core/types';
