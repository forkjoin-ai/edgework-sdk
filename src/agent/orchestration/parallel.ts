/**
 * Parallel Agent
 *
 * Concurrent fan-out that runs sub-agents simultaneously.
 * Google ADK ParallelAgent pattern.
 */

import { BaseAgent } from '../core/agent';
import type {
  AgentType,
  AgentContext,
  EADKAgentConfig,
  EADKAgent,
  RunConfig,
  RunResult,
  RunEvent,
  Message,
  TokenUsage,
  ToolCallResult,
} from '../core/types';

export interface ParallelAgentConfig extends EADKAgentConfig {
  name: string;
  description?: string;
  instructions: string | ((ctx: AgentContext) => string | Promise<string>);
  /** Agents to run in parallel */
  agents: EADKAgent[];
  /** How to merge results */
  mergeStrategy?: 'concatenate' | 'first' | 'best' | 'custom';
  /** Custom merge function */
  mergeFn?: (results: RunResult[]) => RunResult;
}

export class ParallelAgent extends BaseAgent {
  readonly type: AgentType = 'parallel';
  private readonly agents: EADKAgent[];
  private readonly mergeStrategy: string;
  private readonly mergeFn?: (results: RunResult[]) => RunResult;

  constructor(config: ParallelAgentConfig) {
    super(config);
    this.agents = config.agents;
    this.mergeStrategy = config.mergeStrategy ?? 'concatenate';
    this.mergeFn = config.mergeFn;
  }

  async run(input: string, runConfig?: RunConfig): Promise<RunResult> {
    const startTime = Date.now();

    // Run all agents concurrently
    const results = await Promise.all(
      this.agents.map((agent) => agent.run(input, runConfig))
    );

    // Merge results based on strategy
    if (this.mergeFn) {
      return this.mergeFn(results);
    }

    return this.mergeResults(results, startTime);
  }

  private mergeResults(results: RunResult[], startTime: number): RunResult {
    const allMessages: Message[] = [];
    const allToolCalls: ToolCallResult[] = [];
    const totalUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    const guardrailsTriggered: string[] = [];

    for (const result of results) {
      allMessages.push(...result.messages);
      allToolCalls.push(...result.toolCalls);
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      guardrailsTriggered.push(...result.guardrailsTriggered);
    }

    let output: string;
    let structuredOutput: unknown;

    switch (this.mergeStrategy) {
      case 'first':
        output = results[0]?.output ?? '';
        structuredOutput = results[0]?.structuredOutput;
        break;
      case 'best': {
        // Pick the result with the most tool calls (proxy for most thorough)
        const best = results.reduce((a, b) =>
          a.toolCalls.length >= b.toolCalls.length ? a : b
        );
        output = best.output;
        structuredOutput = best.structuredOutput;
        break;
      }
      case 'concatenate':
      default:
        output = results.map((r) => r.output).join('\n\n');
        break;
    }

    return {
      output,
      structuredOutput,
      messages: allMessages,
      toolCalls: allToolCalls,
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      turns: results.length,
      maxTurnsReached: false,
      guardrailsTriggered,
    };
  }

  override async *stream(
    input: string,
    runConfig?: RunConfig
  ): AsyncIterable<RunEvent> {
    const startTime = Date.now();

    yield {
      type: 'agent_start',
      agentName: this.config.name,
      timestamp: startTime,
      data: { type: 'agent_start', turn: 0 },
    };

    // Stream from all agents concurrently using a merge approach
    const iterators = this.agents.map((agent) =>
      agent.stream(input, runConfig)
    );

    // Interleave events from all streams
    const pending = iterators.map(async (iter) => {
      const events: RunEvent[] = [];
      for await (const event of iter) {
        events.push(event);
      }
      return events;
    });

    const allEvents = await Promise.all(pending);
    const merged = allEvents.flat().sort((a, b) => a.timestamp - b.timestamp);

    for (const event of merged) {
      yield event;
    }
  }
}
