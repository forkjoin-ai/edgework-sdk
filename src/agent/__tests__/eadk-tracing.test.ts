/**
 * EADK Tracing & Evaluation Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  Tracer,
  getGlobalTracer,
  setGlobalTracer,
  ConsoleExporter,
  EdgeworkMetricsExporter,
} from '../tracing';
import {
  evaluate,
  exactMatch,
  contains,
  lengthRatio,
  toolUsage,
  createRegexMetric,
} from '../eval';
import { CustomAgent } from '../core';
import type { Span, TraceExporter, EvalContext } from '../core';

// ---------------------------------------------------------------------------
// Tracer Tests
// ---------------------------------------------------------------------------

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer();
  });

  it('should create a trace ID', () => {
    expect(tracer.getTraceId()).toBeDefined();
    expect(typeof tracer.getTraceId()).toBe('string');
  });

  it('should start a span', () => {
    const span = tracer.startSpan({
      name: 'test-span',
      type: 'agent',
    });

    expect(span.id).toBeDefined();
    expect(span.name).toBe('test-span');
    expect(span.type).toBe('agent');
    expect(span.startTime).toBeGreaterThan(0);
    expect(span.status).toBe('unset');
  });

  it('should end a span', () => {
    const span = tracer.startSpan({ name: 'test', type: 'tool' });
    tracer.endSpan(span.id, 'ok');

    const finished = tracer.getSpan(span.id);
    expect(finished?.endTime).toBeGreaterThan(0);
    expect(finished?.status).toBe('ok');
  });

  it('should end a span with error', () => {
    const span = tracer.startSpan({ name: 'test', type: 'llm' });
    tracer.endSpan(span.id, 'error', new Error('LLM failed'));

    const finished = tracer.getSpan(span.id);
    expect(finished?.status).toBe('error');
    expect(finished?.error?.message).toBe('LLM failed');
  });

  it('should add span events', () => {
    const span = tracer.startSpan({ name: 'test', type: 'agent' });
    tracer.addSpanEvent(span.id, 'checkpoint', { step: 1 });

    const updated = tracer.getSpan(span.id);
    expect(updated?.events).toHaveLength(1);
    expect(updated?.events[0].name).toBe('checkpoint');
    expect(updated?.events[0].attributes).toEqual({ step: 1 });
  });

  it('should set span attributes', () => {
    const span = tracer.startSpan({ name: 'test', type: 'agent' });
    tracer.setSpanAttributes(span.id, { model: 'gpt-4', tokens: 100 });

    const updated = tracer.getSpan(span.id);
    expect(updated?.attributes.model).toBe('gpt-4');
    expect(updated?.attributes.tokens).toBe(100);
  });

  it('should get all spans', () => {
    tracer.startSpan({ name: 'a', type: 'agent' });
    tracer.startSpan({ name: 'b', type: 'tool' });
    tracer.startSpan({ name: 'c', type: 'llm' });

    expect(tracer.getSpans()).toHaveLength(3);
  });

  it('should clear spans', () => {
    tracer.startSpan({ name: 'a', type: 'agent' });
    tracer.clear();
    expect(tracer.getSpans()).toHaveLength(0);
  });

  it('should export spans to exporters', () => {
    const exported: Span[] = [];
    const exporter: TraceExporter = {
      exportSpan: (span) => exported.push(span),
      flush: async () => {},
    };

    const tracerWithExporter = new Tracer({ exporters: [exporter] });
    const span = tracerWithExporter.startSpan({ name: 'test', type: 'agent' });
    tracerWithExporter.endSpan(span.id, 'ok');

    expect(exported).toHaveLength(1);
    expect(exported[0].name).toBe('test');
  });

  it('should support parent-child spans', () => {
    const parent = tracer.startSpan({ name: 'parent', type: 'agent' });
    const child = tracer.startSpan({
      name: 'child',
      type: 'tool',
      parentId: parent.id,
    });

    expect(child.parentId).toBe(parent.id);
    expect(child.traceId).toBe(parent.traceId);
  });
});

describe('Global Tracer', () => {
  it('should get/set global tracer', () => {
    const tracer = new Tracer();
    setGlobalTracer(tracer);
    expect(getGlobalTracer()).toBe(tracer);
  });
});

describe('ConsoleExporter', () => {
  it('should create without error', () => {
    const exporter = new ConsoleExporter();
    expect(exporter).toBeDefined();
  });

  it('should create verbose exporter', () => {
    const exporter = new ConsoleExporter({ verbose: true });
    expect(exporter).toBeDefined();
  });
});

describe('EdgeworkMetricsExporter', () => {
  it('should collect spans and provide summary', () => {
    const exporter = new EdgeworkMetricsExporter({
      includeEdgeMetrics: true,
    });

    const span1: Span = {
      id: '1',
      traceId: 't1',
      type: 'agent',
      name: 'test',
      startTime: 100,
      endTime: 200,
      attributes: {},
      events: [],
      status: 'ok',
    };

    const span2: Span = {
      id: '2',
      traceId: 't1',
      type: 'tool',
      name: 'calc',
      startTime: 150,
      endTime: 180,
      attributes: {},
      events: [],
      status: 'ok',
    };

    const span3: Span = {
      id: '3',
      traceId: 't1',
      type: 'llm',
      name: 'chat',
      startTime: 200,
      endTime: 500,
      attributes: {},
      events: [],
      status: 'error',
      error: new Error('timeout'),
    };

    exporter.exportSpan(span1);
    exporter.exportSpan(span2);
    exporter.exportSpan(span3);

    const summary = exporter.getSummary();
    expect(summary.totalSpans).toBe(3);
    expect(summary.byType.agent).toBe(1);
    expect(summary.byType.tool).toBe(1);
    expect(summary.byType.llm).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.averageLatency.agent).toBe(100);
    expect(summary.averageLatency.tool).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Evaluation Tests
// ---------------------------------------------------------------------------

describe('Evaluation Metrics', () => {
  it('exactMatch should match exactly', async () => {
    expect(
      await exactMatch.evaluate('hello', 'hello', {} as unknown as EvalContext)
    ).toBe(1);
    expect(
      await exactMatch.evaluate('hello', 'world', {} as unknown as EvalContext)
    ).toBe(0);
    expect(
      await exactMatch.evaluate(
        'hello',
        '  hello  ',
        {} as unknown as EvalContext
      )
    ).toBe(1);
    expect(
      await exactMatch.evaluate(
        undefined,
        'anything',
        {} as unknown as EvalContext
      )
    ).toBe(0);
  });

  it('contains should check substring', async () => {
    expect(
      await contains.evaluate(
        'hello',
        'say hello world',
        {} as unknown as EvalContext
      )
    ).toBe(1);
    expect(
      await contains.evaluate('hello', 'goodbye', {} as unknown as EvalContext)
    ).toBe(0);
    expect(
      await contains.evaluate(
        'HELLO',
        'hello world',
        {} as unknown as EvalContext
      )
    ).toBe(1);
  });

  it('lengthRatio should score based on length', async () => {
    const score1 = await lengthRatio.evaluate(
      'hello',
      'hello',
      {} as unknown as EvalContext
    );
    expect(score1).toBe(1);

    const score2 = await lengthRatio.evaluate(
      'hi',
      'hi there friend',
      {} as unknown as EvalContext
    );
    expect(score2).toBeLessThan(1);
  });

  it('toolUsage should check expected tools', async () => {
    const ctx = {
      case: {
        input: 'test',
        expectedToolCalls: [{ name: 'search' }, { name: 'calculate' }],
      },
      toolCalls: [
        { toolCallId: '1', name: 'search', result: 'found', durationMs: 10 },
      ],
      messages: [],
    };

    const score = await toolUsage.evaluate(undefined, '', ctx);
    expect(score).toBe(0.5); // 1 of 2 expected tools found
  });

  it('createRegexMetric should match patterns', async () => {
    const metric = createRegexMetric('has_json', /\{.*\}/s);

    expect(
      await metric.evaluate(
        undefined,
        '{"key": "value"}',
        {} as unknown as EvalContext
      )
    ).toBe(1);
    expect(
      await metric.evaluate(
        undefined,
        'no json here',
        {} as unknown as EvalContext
      )
    ).toBe(0);
  });
});

describe('evaluate()', () => {
  it('should evaluate agent against test cases', async () => {
    const agent = new CustomAgent(
      { name: 'echo', instructions: '' },
      async (input) => ({
        output: input,
        messages: [],
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        durationMs: 0,
        turns: 1,
        maxTurnsReached: false,
        guardrailsTriggered: [],
      })
    );

    const result = await evaluate(
      agent,
      [
        { input: 'hello', expectedOutput: 'hello' },
        { input: 'world', expectedOutput: 'world' },
        { input: 'test', expectedOutput: 'different' },
      ],
      {
        metrics: [exactMatch, contains],
        passThreshold: 0.5,
      }
    );

    expect(result.cases).toHaveLength(3);
    expect(result.passRate).toBeGreaterThan(0);
    expect(result.averageScore).toBeGreaterThan(0);
    expect(result.metricAverages).toHaveProperty('exact_match');
    expect(result.metricAverages).toHaveProperty('contains');
  });
});
