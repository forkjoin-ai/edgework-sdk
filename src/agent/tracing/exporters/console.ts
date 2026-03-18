/**
 * Console Trace Exporter
 *
 * Logs spans to the console for development and debugging.
 */

import type { Span, TraceExporter } from '../../core/types';

export class ConsoleExporter implements TraceExporter {
  private verbose: boolean;

  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false;
  }

  exportSpan(span: Span): void {
    const duration = span.endTime
      ? `${span.endTime - span.startTime}ms`
      : 'ongoing';
    const status =
      span.status === 'error' ? '!' : span.status === 'ok' ? '+' : '?';

    const prefix = `[${status}] [${span.type}]`;
    const summary = `${prefix} ${span.name} (${duration})`;

    if (span.status === 'error') {
      console.error(summary, span.error?.message ?? '');
    } else {
      console.log(summary);
    }

    if (this.verbose) {
      if (Object.keys(span.attributes).length > 0) {
        console.log('  attributes:', span.attributes);
      }
      if (span.events.length > 0) {
        for (const event of span.events) {
          console.log(`  event: ${event.name}`, event.attributes ?? '');
        }
      }
    }
  }

  async flush(): Promise<void> {
    // Console doesn't need flushing
  }
}
