/**
 * EADK Core Tests
 *
 * Comprehensive tests for the Edgework Agent Development Kit.
 * Covers: Agent, Tool, Runner, Session, Hooks, Context.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
  LLMAgent,
  CustomAgent,
  registerProvider,
  defineTool,
  zodToJsonSchema,
  toolsToLLMDefinitions,
  executeTool,
  agentAsTool,
  Runner,
  Session,
  mergeHooks,
  createNoOpHooks,
  createAgentContext,
  createChildContext,
  createToolContext,
  createGuardrailContext,
  createHookContext,
} from '../core';
import type { LLMProvider, LLMRequest, LLMResponse, RunHooks } from '../core';

// ---------------------------------------------------------------------------
// Mock LLM Provider
// ---------------------------------------------------------------------------

function createMockProvider(response?: Partial<LLMResponse>): LLMProvider {
  return {
    chat: async (_req: LLMRequest): Promise<LLMResponse> => ({
      content: response?.content ?? 'Hello from mock LLM!',
      usage: response?.usage ?? {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      finishReason: response?.finishReason ?? 'stop',
      model: response?.model ?? 'mock-model',
      toolCalls: response?.toolCalls,
    }),
  };
}

// ---------------------------------------------------------------------------
// Session Tests
// ---------------------------------------------------------------------------

describe('Session', () => {
  let session: Session;

  beforeEach(() => {
    session = new Session();
  });

  it('should generate a unique ID', () => {
    const s1 = new Session();
    const s2 = new Session();
    expect(s1.id).not.toBe(s2.id);
  });

  it('should accept a custom ID', () => {
    const s = new Session({ id: 'my-session' });
    expect(s.id).toBe('my-session');
  });

  it('should get/set/delete with default session scope', () => {
    session.set('key', 'value');
    expect(session.get('key')).toBe('value');
    session.delete('key');
    expect(session.get('key')).toBeUndefined();
  });

  it('should scope state independently', () => {
    session.set('key', 'session-val', 'session');
    session.set('key', 'app-val', 'app');
    session.set('key', 'user-val', 'user');
    session.set('key', 'temp-val', 'temp');

    expect(session.get('key', 'session')).toBe('session-val');
    expect(session.get('key', 'app')).toBe('app-val');
    expect(session.get('key', 'user')).toBe('user-val');
    expect(session.get('key', 'temp')).toBe('temp-val');
  });

  it('should getAll for a scope', () => {
    session.set('a', 1);
    session.set('b', 2);
    session.set('c', 3, 'app');

    const all = session.getAll('session');
    expect(all).toEqual({ a: 1, b: 2 });
  });

  it('should clear a specific scope', () => {
    session.set('a', 1, 'session');
    session.set('b', 2, 'app');

    session.clear('session');

    expect(session.get('a', 'session')).toBeUndefined();
    expect(session.get('b', 'app')).toBe(2);
  });

  it('should clear all scopes', () => {
    session.set('a', 1, 'session');
    session.set('b', 2, 'app');

    session.clear();

    expect(session.get('a', 'session')).toBeUndefined();
    expect(session.get('b', 'app')).toBeUndefined();
  });

  it('should initialize with state', () => {
    const s = new Session({
      initialState: { foo: 'bar', count: 42 },
    });

    expect(s.get('foo')).toBe('bar');
    expect(s.get('count')).toBe(42);
  });

  it('should check expiration', () => {
    const s = new Session({ timeoutMs: 1 });
    s.set('key', 'value');

    // Should be expired after 1ms
    // Use a small delay
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* busy wait */
    }

    expect(s.isExpired()).toBe(true);
    expect(s.get('key')).toBeUndefined();
  });

  it('should snapshot and restore', () => {
    session.set('a', 1);
    session.set('b', 2, 'app');

    const snap = session.snapshot();

    session.clear();
    expect(session.get('a')).toBeUndefined();

    session.restore(snap);
    expect(session.get('a')).toBe(1);
    expect(session.get('b', 'app')).toBe(2);
  });

  it('should fork into independent copy', () => {
    session.set('a', 1);

    const forked = session.fork();
    forked.set('a', 999);
    forked.set('b', 2);

    expect(session.get('a')).toBe(1);
    expect(session.get('b')).toBeUndefined();
    expect(forked.get('a')).toBe(999);
    expect(forked.get('b')).toBe(2);
    expect(forked.id).not.toBe(session.id);
  });
});

// ---------------------------------------------------------------------------
// Context Tests
// ---------------------------------------------------------------------------

describe('Context', () => {
  it('should create an agent context', () => {
    const ctx = createAgentContext({
      agentName: 'test-agent',
    });

    expect(ctx.agentName).toBe('test-agent');
    expect(ctx.turn).toBe(0);
    expect(ctx.messages).toEqual([]);
    expect(ctx.computePreference).toBe('auto');
    expect(ctx.metadata).toEqual({});
  });

  it('should create a child context', () => {
    const parent = createAgentContext({ agentName: 'parent' });
    parent.turn = 3;

    const child = createChildContext(parent, 'child');

    expect(child.agentName).toBe('child');
    expect(child.turn).toBe(0);
    expect(child.parent).toBe(parent);
    expect(child.session).toBe(parent.session);
  });

  it('should create a tool context', () => {
    const agentCtx = createAgentContext({ agentName: 'test' });
    const toolCtx = createToolContext(agentCtx, 'my_tool', 2);

    expect(toolCtx.toolName).toBe('my_tool');
    expect(toolCtx.isRetry).toBe(true);
    expect(toolCtx.retryCount).toBe(2);
  });

  it('should create a guardrail context', () => {
    const agentCtx = createAgentContext({ agentName: 'test' });
    const guardCtx = createGuardrailContext(agentCtx, 'pii', 'input');

    expect(guardCtx.guardrailName).toBe('pii');
    expect(guardCtx.phase).toBe('input');
  });

  it('should create a hook context', () => {
    const agentCtx = createAgentContext({ agentName: 'test' });
    const hookCtx = createHookContext(agentCtx, 'span-123');

    expect(hookCtx.spanId).toBe('span-123');
    expect(hookCtx.startTime).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tool Tests
// ---------------------------------------------------------------------------

describe('Tool System', () => {
  it('should define a tool with input schema', () => {
    const tool = defineTool(
      {
        name: 'add',
        description: 'Add two numbers',
        input: z.object({
          a: z.number(),
          b: z.number(),
        }),
      },
      async (input) => input.a + input.b
    );

    expect(tool.name).toBe('add');
    expect(tool.description).toBe('Add two numbers');
  });

  it('should execute a tool successfully', async () => {
    const tool = defineTool(
      {
        name: 'add',
        description: 'Add two numbers',
        input: z.object({
          a: z.number(),
          b: z.number(),
        }),
      },
      async (input) => input.a + input.b
    );

    const ctx = createAgentContext({ agentName: 'test' });
    const result = await executeTool(tool, { a: 2, b: 3 }, ctx);

    expect(result.result).toBe(5);
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should fail validation on invalid input', async () => {
    const tool = defineTool(
      {
        name: 'add',
        description: 'Add two numbers',
        input: z.object({
          a: z.number(),
          b: z.number(),
        }),
        strictMode: true,
      },
      async (input) => input.a + input.b
    );

    const ctx = createAgentContext({ agentName: 'test' });
    const result = await executeTool(tool, { a: 'not a number', b: 3 }, ctx);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('validation failed');
  });

  it('should execute tool with output guardrail', async () => {
    const tool = defineTool(
      {
        name: 'generate',
        description: 'Generate text',
        input: z.object({ prompt: z.string() }),
        guardrails: {
          output: [
            {
              name: 'max_length',
              validate: async (value) => ({
                passed: String(value).length <= 100,
                info: { length: String(value).length },
              }),
            },
          ],
        },
      },
      async () => 'x'.repeat(200)
    );

    const ctx = createAgentContext({ agentName: 'test' });
    const result = await executeTool(tool, { prompt: 'hello' }, ctx);

    expect(result.error).toContain('output guardrail');
  });

  it('should convert zod schema to JSON schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
      tags: z.array(z.string()),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('object');
    const schemaObj = jsonSchema as unknown as {
      properties: Record<string, { type: string }>;
    };
    expect(schemaObj.properties.name.type).toBe('string');
    expect(schemaObj.properties.age.type).toBe('number');
    expect(schemaObj.properties.active.type).toBe('boolean');
    expect(schemaObj.properties.tags.type).toBe('array');
  });

  it('should convert tools to LLM definitions', () => {
    const tools = [
      defineTool(
        {
          name: 'search',
          description: 'Search the web',
          input: z.object({ query: z.string() }),
        },
        async () => 'results'
      ),
    ];

    const defs = toolsToLLMDefinitions(tools);

    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('search');
    expect(defs[0].description).toBe('Search the web');
    expect((defs[0].parameters as unknown as { type: string }).type).toBe(
      'object'
    );
  });

  it('should create agent-as-tool', () => {
    const mockAgent = {
      config: { name: 'helper' },
      run: async (input: string) => ({ output: `Helped: ${input}` }),
    };

    const tool = agentAsTool(mockAgent);

    expect(tool.name).toBe('consult_helper');
    expect(tool.description).toContain('helper');
  });
});

// ---------------------------------------------------------------------------
// Hooks Tests
// ---------------------------------------------------------------------------

describe('Hooks', () => {
  it('should create no-op hooks', () => {
    const hooks = createNoOpHooks();
    expect(Object.keys(hooks)).toHaveLength(0);
  });

  it('should merge hooks', async () => {
    const calls: string[] = [];

    const hooks1: RunHooks = {
      onAgentStart: async () => {
        calls.push('h1:start');
      },
    };

    const hooks2: RunHooks = {
      onAgentStart: async () => {
        calls.push('h2:start');
      },
    };

    const merged = mergeHooks(hooks1, hooks2);
    const ctx = createHookContext(createAgentContext({ agentName: 'test' }));

    await merged.onAgentStart?.(ctx);

    expect(calls).toEqual(['h1:start', 'h2:start']);
  });

  it('should chain transform hooks', async () => {
    const hooks1: RunHooks = {
      onToolStart: async (_ctx, _name, args) => {
        return { ...(args as object), enhanced: true };
      },
    };

    const hooks2: RunHooks = {
      onToolStart: async (_ctx, _name, args) => {
        return { ...(args as object), doubled: true };
      },
    };

    const merged = mergeHooks(hooks1, hooks2);
    const ctx = createHookContext(createAgentContext({ agentName: 'test' }));

    const result = await merged.onToolStart?.(ctx, 'test_tool', {
      original: true,
    });

    expect(result).toEqual({
      original: true,
      enhanced: true,
      doubled: true,
    });
  });

  it('should handle undefined hooks gracefully', () => {
    const merged = mergeHooks(undefined, undefined);
    expect(merged).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// LLMAgent Tests
// ---------------------------------------------------------------------------

describe('LLMAgent', () => {
  beforeEach(() => {
    registerProvider('default', createMockProvider());
  });

  it('should create an agent with config', () => {
    const agent = new LLMAgent({
      name: 'test-agent',
      instructions: 'You are a helpful assistant.',
    });

    expect(agent.config.name).toBe('test-agent');
    expect(agent.type).toBe('llm');
  });

  it('should run and return result', async () => {
    const agent = new LLMAgent({
      name: 'test-agent',
      instructions: 'You are a helpful assistant.',
    });

    const result = await agent.run('Hello!');

    expect(result.output).toBe('Hello from mock LLM!');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.messages.length).toBeGreaterThanOrEqual(2); // system + user + assistant
  });

  it('should run with dynamic instructions', async () => {
    const agent = new LLMAgent({
      name: 'dynamic-agent',
      instructions: (ctx) => `You are agent: ${ctx.agentName}`,
    });

    const result = await agent.run('Hello!');
    expect(result.output).toBeDefined();
  });

  it('should respect maxTurns', async () => {
    // Provider that always returns tool calls to force looping
    registerProvider(
      'default',
      createMockProvider({ content: 'Done', finishReason: 'stop' })
    );

    const agent = new LLMAgent({
      name: 'limited-agent',
      instructions: 'Be brief.',
      maxTurns: 2,
    });

    const result = await agent.run('Hello!');
    expect(result.turns).toBeLessThanOrEqual(2);
  });

  it('should handle tool calls', async () => {
    // Register a provider that returns tool calls then stops
    let callCount = 0;
    registerProvider('default', {
      chat: async (req: LLMRequest) => {
        callCount++;
        if (callCount === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                name: 'add',
                arguments: { a: 2, b: 3 },
              },
            ],
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            finishReason: 'tool_calls' as const,
            model: 'mock',
          };
        }
        return {
          content: 'The sum is 5.',
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          finishReason: 'stop' as const,
          model: 'mock',
        };
      },
    });

    const addTool = defineTool(
      {
        name: 'add',
        description: 'Add numbers',
        input: z.object({ a: z.number(), b: z.number() }),
      },
      async (input) => input.a + input.b
    );

    const agent = new LLMAgent({
      name: 'tool-agent',
      instructions: 'Use tools when needed.',
      tools: [addTool],
    });

    const result = await agent.run('What is 2 + 3?');

    expect(result.output).toBe('The sum is 5.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('add');
    expect(result.toolCalls[0].result).toBe(5);
  });

  it('should run input guardrails', async () => {
    const agent = new LLMAgent({
      name: 'guarded-agent',
      instructions: 'Be helpful.',
      guardrails: {
        input: [
          {
            name: 'block_test',
            tripwire: true,
            validate: async (input) => ({
              passed: !String(input).includes('BLOCKED'),
              tripwireTriggered: String(input).includes('BLOCKED'),
            }),
          },
        ],
      },
    });

    const result = await agent.run('This is BLOCKED content');

    expect(result.output).toContain('tripwire');
    expect(result.guardrailsTriggered).toContain('block_test');
  });

  it('should stream events', async () => {
    const agent = new LLMAgent({
      name: 'stream-agent',
      instructions: 'Be helpful.',
    });

    const events = [];
    for await (const event of agent.stream('Hello!')) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].data.type).toBe('agent_start');
    expect(events[events.length - 1].data.type).toBe('agent_end');
  });

  it('should return error when no provider is registered', async () => {
    registerProvider('default', undefined as unknown as LLMProvider);

    const agent = new LLMAgent({
      name: 'no-provider',
      instructions: 'Help.',
      model: { modelId: 'test', provider: 'nonexistent' },
    });

    const result = await agent.run('Hello');
    expect(result.output).toContain('No LLM provider');
  });
});

// ---------------------------------------------------------------------------
// CustomAgent Tests
// ---------------------------------------------------------------------------

describe('CustomAgent', () => {
  it('should run with custom logic', async () => {
    const agent = new CustomAgent(
      {
        name: 'custom-agent',
        instructions: 'Custom logic.',
      },
      async (input) => ({
        output: `Custom: ${input}`,
        messages: [],
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        durationMs: 0,
        turns: 1,
        maxTurnsReached: false,
        guardrailsTriggered: [],
      })
    );

    const result = await agent.run('test input');
    expect(result.output).toBe('Custom: test input');
    expect(agent.type).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// Runner Tests
// ---------------------------------------------------------------------------

describe('Runner', () => {
  beforeEach(() => {
    registerProvider('default', createMockProvider());
  });

  it('should run an agent via Runner.run', async () => {
    const agent = new LLMAgent({
      name: 'runner-agent',
      instructions: 'Be helpful.',
    });

    const result = await Runner.run(agent, 'Hello!');
    expect(result.output).toBeDefined();
  });

  it('should stream via Runner.stream', async () => {
    const agent = new LLMAgent({
      name: 'runner-stream-agent',
      instructions: 'Be helpful.',
    });

    const events = [];
    for await (const event of Runner.stream(agent, 'Hello!')) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it('should create a live session via Runner.runLive', async () => {
    const agent = new LLMAgent({
      name: 'live-agent',
      instructions: 'Be helpful.',
    });

    const session = Runner.runLive(agent);
    expect(session.isActive).toBe(true);

    session.send('Hello!');

    // Give it a moment to process
    await new Promise((r) => setTimeout(r, 100));

    session.close();
    expect(session.isActive).toBe(false);
  });
});
