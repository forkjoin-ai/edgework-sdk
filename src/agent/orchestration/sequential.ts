/**
 * Sequential Agent
 *
 * Deterministic pipeline that runs sub-agents in order.
 * Google ADK SequentialAgent pattern.
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

export interface SequentialAgentConfig extends EADKAgentConfig {
  name: string;
  description?: string;
  instructions: string | ((ctx: AgentContext) => string | Promise<string>);
  /** Ordered list of agents to run sequentially */
  pipeline: EADKAgent[];
  /** Whether to pass previous agent output as next agent input */
  chainOutputs?: boolean;
}

export class SequentialAgent extends BaseAgent {
  readonly type: AgentType = 'sequential';
  private readonly pipeline: EADKAgent[];
  private readonly chainOutputs: boolean;

  constructor(config: SequentialAgentConfig) {
    super(config);
    this.pipeline = config.pipeline;
    this.chainOutputs = config.chainOutputs ?? true;
  }

  async run(input: string, runConfig?: RunConfig): Promise<RunResult> {
    const startTime = Date.now();
    const allMessages: Message[] = [];
    const allToolCalls: ToolCallResult[] = [];
    const totalUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    const guardrailsTriggered: string[] = [];

    let currentInput = input;
    let lastResult: RunResult | undefined;

    for (const agent of this.pipeline) {
      const result = await agent.run(currentInput, runConfig);

      allMessages.push(...result.messages);
      allToolCalls.push(...result.toolCalls);
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      guardrailsTriggered.push(...result.guardrailsTriggered);

      lastResult = result;

      // Chain outputs: use this agent's output as next agent's input
      if (this.chainOutputs) {
        currentInput = result.output;
      }
    }

    return {
      output: lastResult?.output ?? '',
      structuredOutput: lastResult?.structuredOutput,
      messages: allMessages,
      toolCalls: allToolCalls,
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      turns: this.pipeline.length,
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

    let currentInput = input;

    for (let i = 0; i < this.pipeline.length; i++) {
      const agent = this.pipeline[i];

      for await (const event of agent.stream(currentInput, runConfig)) {
        yield event;

        // Capture the result for chaining
        if (event.data.type === 'agent_end' && this.chainOutputs) {
          currentInput = event.data.result.output;
        }
      }
    }
  }
}
