/**
 * Loop Agent
 *
 * Iterative refinement with escalation.
 * Google ADK LoopAgent pattern.
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

export interface LoopAgentConfig extends EADKAgentConfig {
  name: string;
  description?: string;
  instructions: string | ((ctx: AgentContext) => string | Promise<string>);
  /** Agent to run in each iteration */
  agent: EADKAgent;
  /** Maximum number of iterations */
  maxIterations?: number;
  /** experience to continue looping (return true to continue) */
  shouldContinue: (
    result: RunResult,
    iteration: number
  ) => boolean | Promise<boolean>;
  /** Transform output between iterations */
  transformOutput?: (
    output: string,
    iteration: number
  ) => string | Promise<string>;
  /** Escalation agent (called when maxIterations exceeded) */
  escalationAgent?: EADKAgent;
}

export class LoopAgent extends BaseAgent {
  readonly type: AgentType = 'loop';
  private readonly agent: EADKAgent;
  private readonly maxIterations: number;
  private readonly shouldContinue: LoopAgentConfig['shouldContinue'];
  private readonly transformOutput?: LoopAgentConfig['transformOutput'];
  private readonly escalationAgent?: EADKAgent;

  constructor(config: LoopAgentConfig) {
    super(config);
    this.agent = config.agent;
    this.maxIterations = config.maxIterations ?? 5;
    this.shouldContinue = config.shouldContinue;
    this.transformOutput = config.transformOutput;
    this.escalationAgent = config.escalationAgent;
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
    let iteration = 0;

    while (iteration < this.maxIterations) {
      const result = await this.agent.run(currentInput, runConfig);

      allMessages.push(...result.messages);
      allToolCalls.push(...result.toolCalls);
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      guardrailsTriggered.push(...result.guardrailsTriggered);

      lastResult = result;
      iteration++;

      // Check if we should continue
      const continueLoop = await this.shouldContinue(result, iteration);
      if (!continueLoop) break;

      // Transform output for next iteration
      currentInput = this.transformOutput
        ? await this.transformOutput(result.output, iteration)
        : result.output;
    }

    // Escalate if max iterations reached and shouldContinue still returns true
    if (iteration >= this.maxIterations && this.escalationAgent && lastResult) {
      const shouldEscalate = await this.shouldContinue(lastResult, iteration);
      if (shouldEscalate) {
        const escalationResult = await this.escalationAgent.run(
          `Escalation: After ${iteration} iterations, the task was not completed. Last output: ${lastResult.output}`,
          runConfig
        );

        allMessages.push(...escalationResult.messages);
        allToolCalls.push(...escalationResult.toolCalls);
        totalUsage.promptTokens += escalationResult.usage.promptTokens;
        totalUsage.completionTokens += escalationResult.usage.completionTokens;
        totalUsage.totalTokens += escalationResult.usage.totalTokens;

        lastResult = escalationResult;
      }
    }

    return {
      output: lastResult?.output ?? '',
      structuredOutput: lastResult?.structuredOutput,
      messages: allMessages,
      toolCalls: allToolCalls,
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      turns: iteration,
      maxTurnsReached: iteration >= this.maxIterations,
      guardrailsTriggered,
    };
  }
}
