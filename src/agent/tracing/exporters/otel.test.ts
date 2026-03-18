import { afterEach, describe, expect, it } from 'bun:test';
import type { Span } from '../../core/types';
import { OpenTelemetryExporter } from './otel';

const originalFetch = globalThis.fetch;

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    traceId: '123e4567-e89b-12d3-a456-426614174000',
    type: 'agent',
    name: 'test-span',
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_000_123,
    attributes: {
      stringAttr: 'value',
      numberAttr: 42,
      boolAttr: true,
    },
    events: [
      {
        name: 'checkpoint',
        timestamp: 1_700_000_000_050,
        attributes: { step: 1 },
      },
    ],
    status: 'ok',
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OpenTelemetryExporter', () => {
  it('serializes IDs and timestamps in OTLP-compatible format', async () => {
    const requestBodies: unknown[] = [];

    globalThis.fetch = (async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const exporter = new OpenTelemetryExporter({
      endpoint: 'https://collector.example/v1/traces',
      batchSize: 100,
      serviceName: 'edgework-sdk-test',
    });

    exporter.exportSpan(makeSpan());
    await exporter.flush();

    expect(requestBodies).toHaveLength(1);

    const body = requestBodies[0] as {
      resourceSpans: Array<{
        scopeSpans: Array<{
          spans: Array<{
            traceId: string;
            spanId: string;
            startTimeUnixNano: string;
            endTimeUnixNano: string;
          }>;
        }>;
      }>;
    };
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof span.startTimeUnixNano).toBe('string');
    expect(typeof span.endTimeUnixNano).toBe('string');
  });

  it('re-buffers spans when the collector responds with non-2xx', async () => {
    let fetchCallCount = 0;
    const postedSpanCounts: number[] = [];

    globalThis.fetch = (async (_input, init) => {
      fetchCallCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        resourceSpans?: Array<{
          scopeSpans?: Array<{ spans?: unknown[] }>;
        }>;
      };
      const spanCount =
        body.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.length ?? 0;
      postedSpanCounts.push(spanCount);

      if (fetchCallCount === 1) {
        return new Response('collector failure', { status: 500 });
      }

      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const exporter = new OpenTelemetryExporter({
      endpoint: 'https://collector.example/v1/traces',
      batchSize: 100,
    });

    exporter.exportSpan(
      makeSpan({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    );
    exporter.exportSpan(
      makeSpan({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    );

    await exporter.flush();
    await exporter.flush();

    expect(fetchCallCount).toBe(2);
    expect(postedSpanCounts).toEqual([2, 2]);
  });
});
