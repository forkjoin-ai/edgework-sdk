/**
 * Handoff System
 *
 * Agent delegation via handoffs.
 * OpenAI Agents SDK pattern.
 */

import type {
  Handoff,
  HandoffResult,
  EADKAgent,
  AgentContext,
  RunConfig,
} from '../core/types';

/**
 * Create a handoff definition.
 */
export function createHandoff(options: {
  target: EADKAgent;
  description?: string;
  contextFilter?: Handoff['contextFilter'];
  experience?: Handoff['experience'];
}): Handoff {
  return {
    target: options.target,
    description:
      options.description ?? `Hand off to ${options.target.config.name}`,
    contextFilter: options.contextFilter,
    experience: options.experience,
  };
}

/**
 * Execute a handoff to a target agent.
 */
export async function executeHandoff(
  handoff: Handoff,
  input: string,
  ctx: AgentContext,
  runConfig?: RunConfig
): Promise<HandoffResult> {
  // Apply context filter if provided
  let effectiveCtx = ctx;
  if (handoff.contextFilter) {
    effectiveCtx = handoff.contextFilter(ctx);
  }

  // Check experience
  if (handoff.experience) {
    const allowed = await handoff.experience(effectiveCtx);
    if (!allowed) {
      return {
        targetAgent: handoff.target.config.name,
        result: {
          output: 'Handoff experience not met',
          messages: [],
          toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
          turns: 0,
          maxTurnsReached: false,
          guardrailsTriggered: [],
        },
        metadata: { conditionMet: false },
      };
    }
  }

  const result = await handoff.target.run(input, runConfig);

  return {
    targetAgent: handoff.target.config.name,
    result,
    metadata: { conditionMet: true },
  };
}
