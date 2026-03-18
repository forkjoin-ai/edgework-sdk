/**
 * EADK Lifecycle Hooks
 *
 * Hook system for intercepting and modifying agent execution at key points.
 * Combines patterns from OpenAI Agents SDK, Google ADK, and Claude Agent SDK.
 */

import type {
  RunHooks,
  HookContext,
  LLMRequest,
  LLMResponse,
  GuardrailResult,
} from './types';

/**
 * Merge multiple hook sets into a single composite hook set.
 * When multiple hooks exist for the same event, they run sequentially.
 * Transform hooks (onLLMStart, onLLMEnd, onToolStart, onToolEnd) chain their results.
 */
export function mergeHooks(...hookSets: (RunHooks | undefined)[]): RunHooks {
  const defined = hookSets.filter(Boolean) as RunHooks[];
  if (defined.length === 0) return {};
  if (defined.length === 1) return defined[0];

  return {
    onAgentStart: async (ctx: HookContext) => {
      for (const hooks of defined) {
        if (hooks.onAgentStart) await hooks.onAgentStart(ctx);
      }
    },

    onAgentEnd: async (ctx: HookContext) => {
      for (const hooks of defined) {
        if (hooks.onAgentEnd) await hooks.onAgentEnd(ctx);
      }
    },

    onLLMStart: async (ctx: HookContext, request: LLMRequest) => {
      let req = request;
      for (const hooks of defined) {
        if (hooks.onLLMStart) {
          const result = await hooks.onLLMStart(ctx, req);
          if (result) req = result;
        }
      }
      return req;
    },

    onLLMEnd: async (ctx: HookContext, response: LLMResponse) => {
      let res = response;
      for (const hooks of defined) {
        if (hooks.onLLMEnd) {
          const result = await hooks.onLLMEnd(ctx, res);
          if (result) res = result;
        }
      }
      return res;
    },

    onToolStart: async (ctx: HookContext, name: string, args: unknown) => {
      let currentArgs = args;
      for (const hooks of defined) {
        if (hooks.onToolStart) {
          const result = await hooks.onToolStart(ctx, name, currentArgs);
          if (result !== undefined) currentArgs = result;
        }
      }
      return currentArgs;
    },

    onToolEnd: async (ctx: HookContext, name: string, result: unknown) => {
      let currentResult = result;
      for (const hooks of defined) {
        if (hooks.onToolEnd) {
          const modified = await hooks.onToolEnd(ctx, name, currentResult);
          if (modified !== undefined) currentResult = modified;
        }
      }
      return currentResult;
    },

    onHandoff: async (ctx: HookContext, from: string, to: string) => {
      for (const hooks of defined) {
        if (hooks.onHandoff) await hooks.onHandoff(ctx, from, to);
      }
    },

    onGuardrailTriggered: async (
      ctx: HookContext,
      guardrailName: string,
      result: GuardrailResult
    ) => {
      for (const hooks of defined) {
        if (hooks.onGuardrailTriggered) {
          await hooks.onGuardrailTriggered(ctx, guardrailName, result);
        }
      }
    },

    onCheckpoint: async (ctx: HookContext, state: unknown) => {
      for (const hooks of defined) {
        if (hooks.onCheckpoint) await hooks.onCheckpoint(ctx, state);
      }
    },
  };
}

/**
 * Create a no-op hook context for testing.
 */
export function createNoOpHooks(): RunHooks {
  return {};
}
