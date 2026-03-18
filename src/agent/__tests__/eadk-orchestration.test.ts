/**
 * EADK Orchestration Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CustomAgent, registerProvider } from '../core';
import type { LLMResponse, LLMRequest, RunResult } from '../core';
import {
  SequentialAgent,
  ParallelAgent,
  LoopAgent,
  GraphAgent,
  InMemoryCheckpointer,
  END,
  createHandoff,
  executeHandoff,
} from '../orchestration';
import { createAgentContext } from '../core';

// Helper to create a simple custom agent
function makeAgent(name: string, transform: (input: string) => string) {
  return new CustomAgent({ name, instructions: '' }, async (input) => ({
    output: transform(input),
    messages: [{ role: 'assistant' as const, content: transform(input) }],
    toolCalls: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    durationMs: 0,
    turns: 1,
    maxTurnsReached: false,
    guardrailsTriggered: [],
  }));
}

describe('SequentialAgent', () => {
  it('should run agents in order with chained outputs', async () => {
    const agent = new SequentialAgent({
      name: 'pipeline',
      instructions: '',
      pipeline: [
        makeAgent('upper', (s) => s.toUpperCase()),
        makeAgent('exclaim', (s) => s + '!!!'),
      ],
      chainOutputs: true,
    });

    const result = await agent.run('hello');
    expect(result.output).toBe('HELLO!!!');
    expect(result.turns).toBe(2);
  });

  it('should pass original input when chaining disabled', async () => {
    const agent = new SequentialAgent({
      name: 'pipeline',
      instructions: '',
      pipeline: [
        makeAgent('a', (s) => `a(${s})`),
        makeAgent('b', (s) => `b(${s})`),
      ],
      chainOutputs: false,
    });

    const result = await agent.run('input');
    // Last agent gets original input
    expect(result.output).toBe('b(input)');
  });

  it('should aggregate usage from all agents', async () => {
    const agentA = new CustomAgent(
      { name: 'a', instructions: '' },
      async () => ({
        output: 'A',
        messages: [],
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        durationMs: 0,
        turns: 1,
        maxTurnsReached: false,
        guardrailsTriggered: [],
      })
    );

    const agentB = new CustomAgent(
      { name: 'b', instructions: '' },
      async () => ({
        output: 'B',
        messages: [],
        toolCalls: [],
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        durationMs: 0,
        turns: 1,
        maxTurnsReached: false,
        guardrailsTriggered: [],
      })
    );

    const seq = new SequentialAgent({
      name: 'seq',
      instructions: '',
      pipeline: [agentA, agentB],
    });

    const result = await seq.run('test');
    expect(result.usage.totalTokens).toBe(45);
  });
});

describe('ParallelAgent', () => {
  it('should run agents concurrently and concatenate results', async () => {
    const agent = new ParallelAgent({
      name: 'parallel',
      instructions: '',
      agents: [
        makeAgent('a', () => 'Result A'),
        makeAgent('b', () => 'Result B'),
      ],
      mergeStrategy: 'concatenate',
    });

    const result = await agent.run('input');
    expect(result.output).toContain('Result A');
    expect(result.output).toContain('Result B');
  });

  it('should use first strategy', async () => {
    const agent = new ParallelAgent({
      name: 'parallel-first',
      instructions: '',
      agents: [makeAgent('a', () => 'First'), makeAgent('b', () => 'Second')],
      mergeStrategy: 'first',
    });

    const result = await agent.run('input');
    expect(result.output).toBe('First');
  });

  it('should use custom merge function', async () => {
    const agent = new ParallelAgent({
      name: 'parallel-custom',
      instructions: '',
      agents: [makeAgent('a', () => 'A'), makeAgent('b', () => 'B')],
      mergeFn: (results: RunResult[]) => ({
        ...results[0],
        output: results.map((r) => r.output).join('+'),
      }),
    });

    const result = await agent.run('input');
    expect(result.output).toBe('A+B');
  });
});

describe('LoopAgent', () => {
  it('should loop until experience is false', async () => {
    let iteration = 0;

    const agent = new LoopAgent({
      name: 'loop',
      instructions: '',
      agent: makeAgent('refine', (s) => `${s}+`),
      maxIterations: 10,
      shouldContinue: (result, iter) => {
        iteration = iter;
        return iter < 3;
      },
    });

    const result = await agent.run('start');
    expect(iteration).toBe(3);
    expect(result.output).toBe('start+++');
  });

  it('should respect maxIterations', async () => {
    const agent = new LoopAgent({
      name: 'loop',
      instructions: '',
      agent: makeAgent('infinite', (s) => s + '.'),
      maxIterations: 3,
      shouldContinue: () => true,
    });

    const result = await agent.run('x');
    expect(result.turns).toBe(3);
    expect(result.maxTurnsReached).toBe(true);
  });

  it('should support output transformation', async () => {
    const agent = new LoopAgent({
      name: 'loop',
      instructions: '',
      agent: makeAgent('process', (s) => s),
      maxIterations: 2,
      shouldContinue: (_r, iter) => iter < 2,
      transformOutput: async (output, iter) => `iter${iter}(${output})`,
    });

    const result = await agent.run('start');
    expect(result.output).toBe('iter1(start)');
  });
});

describe('GraphAgent', () => {
  it('should traverse a simple graph', async () => {
    const agent = new GraphAgent({
      name: 'graph',
      instructions: '',
      graph: {
        nodes: {
          start: {
            fn: async (state: any) => ({ ...state, output: 'started' }),
          },
          process: {
            fn: async (state: any) => ({
              ...state,
              output: state.output + '->processed',
            }),
          },
          end: {
            fn: async (state: any) => ({
              ...state,
              output: state.output + '->done',
            }),
          },
        },
        edges: [
          { from: 'start', to: 'process' },
          { from: 'process', to: 'end' },
          { from: 'end', to: END },
        ],
        entryPoint: 'start',
      },
    });

    const result = await agent.run('input');
    expect(result.output).toBe('started->processed->done');
  });

  it('should support conditional routing', async () => {
    const agent = new GraphAgent({
      name: 'graph',
      instructions: '',
      graph: {
        nodes: {
          classify: {
            fn: async (state: any) => ({
              ...state,
              output: 'classified',
              category: state.input.includes('urgent') ? 'urgent' : 'typical',
            }),
          },
          urgent_handler: {
            fn: async (state: any) => ({ ...state, output: 'URGENT HANDLED' }),
          },
          normal_handler: {
            fn: async (state: any) => ({ ...state, output: 'typical handled' }),
          },
        },
        edges: [
          {
            from: 'classify',
            to: (state: any) =>
              state.category === 'urgent' ? 'urgent_handler' : 'normal_handler',
          },
          { from: 'urgent_handler', to: END },
          { from: 'normal_handler', to: END },
        ],
        entryPoint: 'classify',
      },
    });

    const urgentResult = await agent.run('This is urgent!');
    expect(urgentResult.output).toBe('URGENT HANDLED');

    const normalResult = await agent.run('regular request');
    expect(normalResult.output).toBe('typical handled');
  });

  it('should checkpoint state', async () => {
    const checkpointer = new InMemoryCheckpointer();

    const agent = new GraphAgent({
      name: 'graph',
      instructions: '',
      graph: {
        nodes: {
          step1: { fn: async (state: any) => ({ ...state, output: 'step1' }) },
          step2: { fn: async (state: any) => ({ ...state, output: 'step2' }) },
        },
        edges: [
          { from: 'step1', to: 'step2' },
          { from: 'step2', to: END },
        ],
        entryPoint: 'step1',
        checkpointer,
      },
    });

    await agent.run('test');

    const checkpoints = await checkpointer.list();
    expect(checkpoints.length).toBeGreaterThan(0);
  });
});

describe('InMemoryCheckpointer', () => {
  it('should save and load checkpoints', async () => {
    const cp = new InMemoryCheckpointer();

    await cp.save('cp1', { step: 1, data: 'test' });
    const loaded = await cp.load('cp1');

    expect(loaded).toEqual({ step: 1, data: 'test' });
  });

  it('should return null for missing checkpoints', async () => {
    const cp = new InMemoryCheckpointer();
    const loaded = await cp.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('should list checkpoints', async () => {
    const cp = new InMemoryCheckpointer();
    await cp.save('cp1', {});
    await cp.save('cp2', {});

    const list = await cp.list();
    expect(list).toHaveLength(2);
  });

  it('should delete checkpoints', async () => {
    const cp = new InMemoryCheckpointer();
    await cp.save('cp1', {});
    await cp.delete('cp1');

    const loaded = await cp.load('cp1');
    expect(loaded).toBeNull();
  });
});

describe('Handoff', () => {
  it('should create a handoff', () => {
    const target = makeAgent('helper', (s) => `helped: ${s}`);
    const handoff = createHandoff({ target });

    expect(handoff.target.config.name).toBe('helper');
    expect(handoff.description).toContain('helper');
  });

  it('should execute a handoff', async () => {
    const target = makeAgent('helper', (s) => `helped: ${s}`);
    const handoff = createHandoff({ target });
    const ctx = createAgentContext({ agentName: 'main' });

    const result = await executeHandoff(handoff, 'test', ctx);

    expect(result.targetAgent).toBe('helper');
    expect(result.result.output).toBe('helped: test');
  });

  it('should respect handoff experiences', async () => {
    const target = makeAgent('restricted', (s) => s);
    const handoff = createHandoff({
      target,
      experience: async () => false,
    });
    const ctx = createAgentContext({ agentName: 'main' });

    const result = await executeHandoff(handoff, 'test', ctx);
    expect(result.result.output).toContain('experience not met');
  });
});
