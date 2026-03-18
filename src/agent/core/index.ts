/**
 * EADK Core — Public API
 *
 * Core agent primitives: Agent, Tool, Runner, Context, Session, Hooks.
 */

// Types (re-export everything)
export type {
  ComputePreference,
  ModelConfig,
  EADKAgentConfig,
  AgentType,
  Tool,
  ToolGuardrail,
  ToolGuardrailResult,
  Guardrail,
  GuardrailResult,
  MemoryScope,
  MemoryBackend,
  MemoryConfig,
  MemoryEntry,
  MemorySearchResult,
  SessionConfig,
  SessionState,
  Handoff,
  HandoffResult,
  AgentContext,
  ToolContext,
  GuardrailContext,
  HookContext,
  MessageRole,
  Message,
  ToolCall,
  ToolCallResult,
  RunConfig,
  RunResult,
  TokenUsage,
  RunEventType,
  RunEvent,
  RunEventData,
  RunHooks,
  LLMRequest,
  LLMResponse,
  LLMToolDefinition,
  AgentCallbacks,
  LiveSession,
  GraphConfig,
  GraphNode,
  GraphEdge,
  Checkpointer,
  CrewAgentConfig,
  EvalCase,
  EvalResult,
  EvalMetric,
  EvalContext,
  SpanType,
  Span,
  SpanEvent,
  TraceExporter,
  EADKAgent,
  // Inference passthrough types
  ResponseMeta,
  SteeringConfig,
  SteeringVectorInput,
  SuperinferenceConfig,
  SuperinferenceMode,
} from './types';

// Agent classes
export { BaseAgent, LLMAgent, CustomAgent } from './agent';
export type { LLMProvider } from './agent';
export { registerProvider, getProvider } from './agent';

// Tool system
export {
  defineTool,
  zodToJsonSchema,
  toolsToLLMDefinitions,
  executeTool,
  agentAsTool,
} from './tool';

// Runner
export { Runner } from './runner';

// Context factories
export {
  createAgentContext,
  createChildContext,
  createToolContext,
  createGuardrailContext,
  createHookContext,
} from './context';

// Session
export { Session } from './session';

// Hooks
export { mergeHooks, createNoOpHooks } from './hooks';

// Gnosis topology runtime for client orchestration
export {
  GnosisClientRuntime,
  type GnosisPrimitive,
  type GnosisTraceEvent,
  type GnosisRuntimeOptions,
  type GnosisRaceBranch,
  type GnosisFoldBranch,
  type GnosisFetchInput,
} from './gnosis-runtime';
