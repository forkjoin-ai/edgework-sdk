/**
 * EADK Context
 *
 * Provides runtime context objects for agents, tools, guardrails, and hooks.
 */

import type {
  AgentContext,
  ToolContext,
  GuardrailContext,
  HookContext,
  ComputePreference,
  Message,
  SessionState,
} from './types';
import { Session } from './session';

/**
 * Create a new root agent context.
 */
export function createAgentContext(options: {
  agentName: string;
  session?: SessionState;
  computePreference?: ComputePreference;
  messages?: Message[];
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
  parent?: AgentContext;
}): AgentContext {
  return {
    session: options.session ?? new Session(),
    agentName: options.agentName,
    turn: 0,
    messages: options.messages ?? [],
    parent: options.parent,
    computePreference: options.computePreference ?? 'auto',
    abortSignal: options.abortSignal,
    metadata: options.metadata ?? {},
  };
}

/**
 * Create a child context for sub-agent delegation.
 */
export function createChildContext(
  parent: AgentContext,
  childAgentName: string,
  overrides?: Partial<AgentContext>
): AgentContext {
  return {
    ...parent,
    agentName: childAgentName,
    turn: 0,
    parent,
    metadata: { ...parent.metadata },
    ...overrides,
  };
}

/**
 * Create a tool execution context from an agent context.
 */
export function createToolContext(
  agentCtx: AgentContext,
  toolName: string,
  retryCount = 0
): ToolContext {
  return {
    ...agentCtx,
    toolName,
    isRetry: retryCount > 0,
    retryCount,
  };
}

/**
 * Create a guardrail evaluation context.
 */
export function createGuardrailContext(
  agentCtx: AgentContext,
  guardrailName: string,
  phase: 'input' | 'output'
): GuardrailContext {
  return {
    ...agentCtx,
    guardrailName,
    phase,
  };
}

/**
 * Create a hook execution context.
 */
export function createHookContext(
  agentCtx: AgentContext,
  spanId?: string
): HookContext {
  return {
    ...agentCtx,
    spanId,
    startTime: Date.now(),
  };
}
