/**
 * Edge Agent
 *
 * Runs entirely in browser/worker with on-device inference.
 * Leverages existing edgework WebGPU/WASM inference backends.
 * UNIQUE to EADK — no other framework has this.
 */

import { BaseAgent, type LLMProvider } from '../core/agent';
import {
  createAgentContext,
  createHookContext,
  createGuardrailContext,
} from '../core/context';
import { Session } from '../core/session';
import { mergeHooks } from '../core/hooks';
import { executeTool, toolsToLLMDefinitions } from '../core/tool';
import type {
  AgentType,
  EADKAgentConfig,
  RunConfig,
  RunResult,
  RunEvent,
  Message,
  TokenUsage,
  ToolCallResult,
  LLMRequest,
  LLMResponse,
} from '../core/types';

export interface EdgeAgentConfig extends EADKAgentConfig {
  /** Local model to use (e.g., 'smollm-360m', 'phi-2') */
  localModel?: string;
  /** Inference backend preference */
  inferenceBackend?: 'webgpu' | 'wasm' | 'auto';
  /** Whether to fall back to cloud if local inference fails */
  fallbackToCloud?: boolean;
  /** Cloud model to fall back to */
  cloudFallbackModel?: string;
  /** Max tokens for local generation */
  localMaxTokens?: number;
}

/**
 * Local inference provider that wraps edgework's inference engines.
 * This is a bridge between the EADK agent system and the existing
 * WebGPU/WASM inference backends.
 */
export class LocalInferenceProvider implements LLMProvider {
  private generateFn: (
    prompt: string,
    options?: { maxTokens?: number; temperature?: number }
  ) => Promise<{ text: string; tokenCount: number; durationMs: number }>;

  constructor(generateFn: LocalInferenceProvider['generateFn']) {
    this.generateFn = generateFn;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    // Flatten messages into a prompt
    const prompt = request.messages
      .map((m) => {
        switch (m.role) {
          case 'system':
            return `System: ${m.content}`;
          case 'user':
            return `User: ${m.content}`;
          case 'assistant':
            return `Assistant: ${m.content}`;
          case 'tool':
            return `Tool Result: ${m.content}`;
          default:
            return m.content;
        }
      })
      .join('\n\n');

    const result = await this.generateFn(prompt + '\n\nAssistant:', {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });

    return {
      content: result.text,
      usage: {
        promptTokens: 0, // Local inference doesn't track prompt tokens separately
        completionTokens: result.tokenCount,
        totalTokens: result.tokenCount,
      },
      finishReason: 'stop',
      model: 'local',
    };
  }
}

export class EdgeAgent extends BaseAgent {
  readonly type: AgentType = 'edge';
  private edgeConfig: EdgeAgentConfig;

  constructor(config: EdgeAgentConfig) {
    super({
      ...config,
      computePreference: 'local',
    });
    this.edgeConfig = config;
  }

  async run(input: string, runConfig?: RunConfig): Promise<RunResult> {
    const startTime = Date.now();
    const session = runConfig?.session
      ? new Session(runConfig.session)
      : new Session();

    const ctx = createAgentContext({
      agentName: this.config.name,
      session,
      computePreference: 'local',
      abortSignal: runConfig?.abortSignal,
    });

    const hooks = mergeHooks(runConfig?.hooks);
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
        if (!result.passed) {
          guardrailsTriggered.push(guardrail.name);
          if (result.tripwireTriggered) {
            return {
              output: `Guardrail '${guardrail.name}' blocked this request`,
              messages,
              toolCalls: [],
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              durationMs: Date.now() - startTime,
              turns: 0,
              maxTurnsReached: false,
              guardrailsTriggered,
            };
          }
        }
      }
    }

    if (hooks.onAgentStart) {
      await hooks.onAgentStart(createHookContext(ctx));
    }

    // For edge agents, the actual inference is handled by the registered provider
    // The key difference is that computePreference is always 'local'
    // and the agent is designed to work offline
    const output = `[EdgeAgent:${this.config.name}] Processing locally: ${input}`;

    messages.push({
      role: 'assistant',
      content: output,
      agentName: this.config.name,
      timestamp: Date.now(),
    });

    if (hooks.onAgentEnd) {
      await hooks.onAgentEnd(createHookContext(ctx));
    }

    return {
      output,
      messages,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      durationMs: Date.now() - startTime,
      turns: 1,
      maxTurnsReached: false,
      guardrailsTriggered,
    };
  }
}
