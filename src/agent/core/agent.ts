/**
 * EADK Agent
 *
 * Base Agent class and LLMAgent implementation.
 * Provides the autonomous reasoning loop with tool calling, guardrails,
 * handoffs, and compute-preference routing.
 */

import type {
  EADKAgent,
  EADKAgentConfig,
  AgentType,
  RunConfig,
  RunResult,
  RunEvent,
  RunEventData,
  Message,
  ToolCall,
  ToolCallResult,
  TokenUsage,
  LLMRequest,
  LLMResponse,
  AgentContext,
  GuardrailResult,
  ModelConfig,
} from './types';
import {
  createAgentContext,
  createHookContext,
  createGuardrailContext,
} from './context';
import { Session } from './session';
import { mergeHooks } from './hooks';
import { executeTool, toolsToLLMDefinitions } from './tool';

// ---------------------------------------------------------------------------
// LLM Provider Interface (pluggable backend)
// ---------------------------------------------------------------------------

export interface LLMProvider {
  chat(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncIterable<LLMResponse>;
}

/**
 * Default LLM provider registry. Agents look up providers by name.
 */
const providerRegistry = new Map<string, LLMProvider>();

export function registerProvider(name: string, provider: LLMProvider): void {
  providerRegistry.set(name, provider);
}

export function getProvider(name: string): LLMProvider | undefined {
  return providerRegistry.get(name);
}

// ---------------------------------------------------------------------------
// Base Agent
// ---------------------------------------------------------------------------

export abstract class BaseAgent implements EADKAgent {
  readonly config: EADKAgentConfig;
  abstract readonly type: AgentType;

  constructor(config: EADKAgentConfig) {
    this.config = config;
  }

  abstract run(input: string, config?: RunConfig): Promise<RunResult>;

  async *stream(input: string, config?: RunConfig): AsyncIterable<RunEvent> {
    // Default: wrap run() as a single event stream
    const startTime = Date.now();
    yield {
      type: 'agent_start',
      agentName: this.config.name,
      timestamp: startTime,
      data: { type: 'agent_start', turn: 0 },
    };

    const result = await this.run(input, config);

    yield {
      type: 'agent_end',
      agentName: this.config.name,
      timestamp: Date.now(),
      data: { type: 'agent_end', result },
    };
  }

  /**
   * Resolve model configuration.
   */
  protected resolveModel(override?: string | ModelConfig): ModelConfig {
    const base = this.config.model;
    if (override) {
      return typeof override === 'string' ? { modelId: override } : override;
    }
    if (base) {
      return typeof base === 'string' ? { modelId: base } : base;
    }
    return { modelId: 'default' };
  }

  /**
   * Resolve instructions (static or dynamic).
   */
  protected async resolveInstructions(ctx: AgentContext): Promise<string> {
    if (typeof this.config.instructions === 'function') {
      return this.config.instructions(ctx);
    }
    return this.config.instructions;
  }
}

// ---------------------------------------------------------------------------
// LLM Agent — Autonomous Reasoning Loop
// ---------------------------------------------------------------------------

export class LLMAgent extends BaseAgent {
  readonly type: AgentType = 'llm';

  constructor(config: EADKAgentConfig) {
    super(config);
  }

  async run(input: string, runConfig?: RunConfig): Promise<RunResult> {
    const startTime = Date.now();
    const session = runConfig?.session
      ? new Session(runConfig.session)
      : new Session();

    const ctx = createAgentContext({
      agentName: this.config.name,
      session,
      computePreference:
        runConfig?.computePreference ?? this.config.computePreference ?? 'auto',
      abortSignal: runConfig?.abortSignal,
    });

    const hooks = mergeHooks(
      this.config.callbacks
        ? callbacksToHooks(this.config.callbacks)
        : undefined,
      runConfig?.hooks
    );

    const maxTurns = runConfig?.maxTurns ?? this.config.maxTurns ?? 10;
    const maxSteps = runConfig?.maxSteps ?? this.config.maxSteps ?? 25;
    const modelConfig = this.resolveModel(runConfig?.model);

    // Build initial messages
    const instructions = await this.resolveInstructions(ctx);
    const messages: Message[] = [
      { role: 'system', content: instructions },
      { role: 'user', content: input, timestamp: Date.now() },
    ];
    ctx.messages = messages;

    // Run input guardrails
    const guardrailsTriggered: string[] = [];
    if (this.config.guardrails?.input) {
      for (const guardrail of this.config.guardrails.input) {
        const gCtx = createGuardrailContext(ctx, guardrail.name, 'input');
        const result = await guardrail.validate(input, gCtx);

        if (result.tripwireTriggered) {
          guardrailsTriggered.push(guardrail.name);
          if (hooks.onGuardrailTriggered) {
            const hCtx = createHookContext(ctx);
            await hooks.onGuardrailTriggered(hCtx, guardrail.name, result);
          }
          return createErrorResult(
            `Guardrail '${guardrail.name}' tripwire triggered`,
            messages,
            startTime,
            guardrailsTriggered
          );
        }

        if (!result.passed) {
          guardrailsTriggered.push(guardrail.name);
          if (result.replacement !== undefined) {
            // Replace input
            messages[messages.length - 1] = {
              role: 'user',
              content: String(result.replacement),
              timestamp: Date.now(),
            };
          }
        }
      }
    }

    // Notify agent start
    if (hooks.onAgentStart) {
      await hooks.onAgentStart(createHookContext(ctx));
    }

    // Get LLM provider
    const provider = getProvider(modelConfig.provider ?? 'default');
    if (!provider) {
      return createErrorResult(
        `No LLM provider registered for '${
          modelConfig.provider ?? 'default'
        }'. ` +
          'Register a provider with registerProvider() before running agents.',
        messages,
        startTime,
        guardrailsTriggered
      );
    }

    const allToolCalls: ToolCallResult[] = [];
    const totalUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    let turn = 0;
    let stepCount = 0;

    // Autonomous reasoning loop
    while (turn < maxTurns) {
      ctx.turn = turn;

      // Check abort
      if (ctx.abortSignal?.aborted) {
        return createErrorResult(
          'Agent run aborted',
          messages,
          startTime,
          guardrailsTriggered
        );
      }

      // Build LLM request
      const tools = this.config.tools ?? [];
      const handoffTools =
        this.config.handoffs?.map((h) => ({
          name: `handoff_to_${h.target.config.name}`,
          description:
            h.description ??
            `Hand off to ${h.target.config.name}${
              h.target.config.description
                ? ': ' + h.target.config.description
                : ''
            }`,
          parameters: {
            type: 'object' as const,
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for the handoff',
              },
            },
            required: ['reason'],
          },
        })) ?? [];

      const toolDefs = [...toolsToLLMDefinitions(tools), ...handoffTools];

      let llmRequest: LLMRequest = {
        model: modelConfig.modelId,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        topP: modelConfig.topP,
        topK: modelConfig.topK,
        stopSequences: modelConfig.stopSequences,
        responseFormat: this.config.outputSchema ? 'json' : 'text',
      };

      // Hook: onLLMStart
      if (hooks.onLLMStart) {
        const hookCtx = createHookContext(ctx);
        const modified = await hooks.onLLMStart(hookCtx, llmRequest);
        if (modified) llmRequest = modified;
      }

      // Call LLM
      let llmResponse: LLMResponse;
      try {
        llmResponse = await provider.chat(llmRequest);
      } catch (err) {
        return createErrorResult(
          `LLM call failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          messages,
          startTime,
          guardrailsTriggered
        );
      }

      // Hook: onLLMEnd
      if (hooks.onLLMEnd) {
        const hookCtx = createHookContext(ctx);
        const modified = await hooks.onLLMEnd(hookCtx, llmResponse);
        if (modified) llmResponse = modified;
      }

      // Accumulate usage
      totalUsage.promptTokens += llmResponse.usage.promptTokens;
      totalUsage.completionTokens += llmResponse.usage.completionTokens;
      totalUsage.totalTokens += llmResponse.usage.totalTokens;

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: llmResponse.content,
        toolCalls: llmResponse.toolCalls,
        agentName: this.config.name,
        timestamp: Date.now(),
      };
      messages.push(assistantMessage);

      // If no tool calls, we're done
      if (
        !llmResponse.toolCalls ||
        llmResponse.toolCalls.length === 0 ||
        llmResponse.finishReason === 'stop'
      ) {
        break;
      }

      // Process tool calls
      for (const toolCall of llmResponse.toolCalls) {
        if (stepCount >= maxSteps) break;
        stepCount++;

        // Check for handoff
        if (toolCall.name.startsWith('handoff_to_')) {
          const targetName = toolCall.name.replace('handoff_to_', '');
          const handoff = this.config.handoffs?.find(
            (h) => h.target.config.name === targetName
          );

          if (handoff) {
            // Hook: onHandoff
            if (hooks.onHandoff) {
              await hooks.onHandoff(
                createHookContext(ctx),
                this.config.name,
                targetName
              );
            }

            // Check experience
            if (handoff.experience) {
              const allowed = await handoff.experience(ctx);
              if (!allowed) {
                messages.push({
                  role: 'tool',
                  content: `Handoff to ${targetName} was not allowed by the experience.`,
                  toolCallId: toolCall.id,
                  timestamp: Date.now(),
                });
                continue;
              }
            }

            // Execute handoff
            const handoffInput = (toolCall.arguments as { reason: string })
              .reason;
            const handoffResult = await handoff.target.run(
              handoffInput,
              runConfig
            );

            // Notify agent end
            if (hooks.onAgentEnd) {
              await hooks.onAgentEnd(createHookContext(ctx));
            }

            return {
              output: handoffResult.output,
              messages: [...messages, ...handoffResult.messages],
              toolCalls: [...allToolCalls, ...handoffResult.toolCalls],
              usage: {
                promptTokens:
                  totalUsage.promptTokens + handoffResult.usage.promptTokens,
                completionTokens:
                  totalUsage.completionTokens +
                  handoffResult.usage.completionTokens,
                totalTokens:
                  totalUsage.totalTokens + handoffResult.usage.totalTokens,
              },
              durationMs: Date.now() - startTime,
              turns: turn + 1,
              maxTurnsReached: false,
              handoff: {
                targetAgent: targetName,
                result: handoffResult,
              },
              guardrailsTriggered,
            };
          }
        }

        // Regular tool call
        const tool = tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          messages.push({
            role: 'tool',
            content: `Error: Unknown tool '${toolCall.name}'`,
            toolCallId: toolCall.id,
            timestamp: Date.now(),
          });
          continue;
        }

        // Hook: onToolStart
        let toolArgs = toolCall.arguments;
        if (hooks.onToolStart) {
          const modified = await hooks.onToolStart(
            createHookContext(ctx),
            toolCall.name,
            toolArgs
          );
          if (modified !== undefined) toolArgs = modified;
        }

        // Execute tool
        const toolResult = await executeTool(tool, toolArgs, ctx);

        // Hook: onToolEnd
        let finalResult = toolResult.result;
        if (hooks.onToolEnd) {
          const modified = await hooks.onToolEnd(
            createHookContext(ctx),
            toolCall.name,
            finalResult
          );
          if (modified !== undefined) finalResult = modified;
        }

        const callResult: ToolCallResult = {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: finalResult,
          error: toolResult.error,
          durationMs: toolResult.durationMs,
        };
        allToolCalls.push(callResult);

        // Add tool result message
        messages.push({
          role: 'tool',
          content: toolResult.error
            ? `Error: ${toolResult.error}`
            : JSON.stringify(finalResult),
          toolCallId: toolCall.id,
          timestamp: Date.now(),
        });

        // Agent callbacks
        if (this.config.callbacks?.onToolCall) {
          this.config.callbacks.onToolCall(
            this.config.name,
            toolCall.name,
            toolArgs
          );
        }
        if (this.config.callbacks?.onToolResult) {
          this.config.callbacks.onToolResult(
            this.config.name,
            toolCall.name,
            finalResult
          );
        }
      }

      turn++;
    }

    // Run output guardrails
    const finalOutput = messages[messages.length - 1]?.content ?? '';
    let output = finalOutput;

    if (this.config.guardrails?.output) {
      for (const guardrail of this.config.guardrails.output) {
        const gCtx = createGuardrailContext(ctx, guardrail.name, 'output');
        const result = await guardrail.validate(output, gCtx);

        if (result.tripwireTriggered) {
          guardrailsTriggered.push(guardrail.name);
          if (hooks.onGuardrailTriggered) {
            const hCtx = createHookContext(ctx);
            await hooks.onGuardrailTriggered(hCtx, guardrail.name, result);
          }
          return createErrorResult(
            `Output guardrail '${guardrail.name}' tripwire triggered`,
            messages,
            startTime,
            guardrailsTriggered
          );
        }

        if (!result.passed) {
          guardrailsTriggered.push(guardrail.name);
          if (result.replacement !== undefined) {
            output = String(result.replacement);
          }
        }
      }
    }

    // Parse structured output if schema provided
    let structuredOutput: unknown;
    if (this.config.outputSchema) {
      try {
        const parsed = JSON.parse(output);
        const validated = this.config.outputSchema.safeParse(parsed);
        if (validated.success) {
          structuredOutput = validated.data;
        }
      } catch {
        // Not valid JSON — leave structuredOutput undefined
      }
    }

    // Notify agent end
    if (hooks.onAgentEnd) {
      await hooks.onAgentEnd(createHookContext(ctx));
    }

    return {
      output,
      structuredOutput,
      messages,
      toolCalls: allToolCalls,
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      turns: turn + 1,
      maxTurnsReached: turn >= maxTurns,
      guardrailsTriggered,
    };
  }
}

// ---------------------------------------------------------------------------
// Custom Agent (extend base class)
// ---------------------------------------------------------------------------

export class CustomAgent extends BaseAgent {
  readonly type: AgentType = 'custom';
  private readonly runFn: (
    input: string,
    ctx: AgentContext,
    config?: RunConfig
  ) => Promise<RunResult>;

  constructor(
    config: EADKAgentConfig,
    runFn: (
      input: string,
      ctx: AgentContext,
      config?: RunConfig
    ) => Promise<RunResult>
  ) {
    super(config);
    this.runFn = runFn;
  }

  async run(input: string, runConfig?: RunConfig): Promise<RunResult> {
    const session = runConfig?.session
      ? new Session(runConfig.session)
      : new Session();

    const ctx = createAgentContext({
      agentName: this.config.name,
      session,
      computePreference:
        runConfig?.computePreference ?? this.config.computePreference ?? 'auto',
      abortSignal: runConfig?.abortSignal,
    });

    return this.runFn(input, ctx, runConfig);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createErrorResult(
  error: string,
  messages: Message[],
  startTime: number,
  guardrailsTriggered: string[]
): RunResult {
  return {
    output: error,
    messages,
    toolCalls: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    durationMs: Date.now() - startTime,
    turns: 0,
    maxTurnsReached: false,
    guardrailsTriggered,
  };
}

function callbacksToHooks(
  callbacks: NonNullable<EADKAgentConfig['callbacks']>
): import('./types').RunHooks {
  return {
    onAgentStart: callbacks.onStart
      ? (ctx) => callbacks.onStart!(ctx.agentName)
      : undefined,
    onAgentEnd: callbacks.onEnd
      ? async (ctx) => {
          // Will be called with result in the runner
        }
      : undefined,
  };
}
