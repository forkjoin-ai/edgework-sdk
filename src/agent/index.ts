/**
 * Edgework Agent Development Kit - Main Exports
 *
 * EADK: A TypeScript-first Agent Development Kit for edge-first,
 * distributed, tokenized compute.
 */

// ===========================================================================
// Legacy Agent Infrastructure (compute node daemon, wallet, gateway)
// ===========================================================================
export * from './types';
export { WalletManager } from './WalletManager';
export { GatewayConnector } from './GatewayConnector';
export { AgentManager } from './AgentManager';
export { ComputeNode } from './ComputeNode';
export { TokenSpendingManager } from './TokenSpendingManager';
export {
  SystemTray,
  MacOSSystemTray,
  WindowsSystemTray,
  LinuxSystemTray,
  createSystemTray,
} from './SystemTray';
export { runSetupWizard, completeSetup } from './setup';

// ===========================================================================
// EADK Core — Agent Primitives, Tools, Runner, Context, Session, Hooks
// ===========================================================================
export {
  // Agent classes
  BaseAgent,
  LLMAgent,
  CustomAgent,
  registerProvider,
  getProvider,
  // Tool system
  defineTool,
  zodToJsonSchema,
  toolsToLLMDefinitions,
  executeTool,
  agentAsTool,
  // Runner
  Runner,
  // Context factories
  createAgentContext,
  createChildContext,
  createToolContext,
  createGuardrailContext,
  createHookContext,
  // Session
  Session,
  // Hooks
  mergeHooks,
  createNoOpHooks,
  GnosisClientRuntime,
} from './core';

export type {
  // Core types
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
  LLMProvider,
  // Inference passthrough types
  ResponseMeta,
  SteeringConfig,
  SteeringVectorInput,
  SuperinferenceConfig,
  SuperinferenceMode,
} from './core';

// ===========================================================================
// Guardrails — Content filter, PII, Topic, Token budget, Rate limit
// ===========================================================================
export {
  createContentFilterGuardrail,
  createPIIGuardrail,
  createTopicGuardrail,
  createTokenBudgetGuardrail,
  createRateLimitGuardrail,
} from './guardrails';

// ===========================================================================
// Memory — Pluggable memory service with scoped storage
// ===========================================================================
export {
  MemoryService,
  InMemoryBackend,
  IndexedDBBackend,
  createMemoryService,
} from './memory';

// ===========================================================================
// Orchestration — Sequential, Parallel, Loop, Graph, Handoff
// ===========================================================================
export {
  SequentialAgent,
  ParallelAgent,
  LoopAgent,
  GraphAgent,
  InMemoryCheckpointer,
  END,
  createHandoff,
  executeHandoff,
} from './orchestration';

// ===========================================================================
// Tracing — Span collection, exporters (Console, OTel, Edgework)
// ===========================================================================
export {
  Tracer,
  getGlobalTracer,
  setGlobalTracer,
  ConsoleExporter,
  OpenTelemetryExporter,
  EdgeworkMetricsExporter,
} from './tracing';

// ===========================================================================
// Evaluation — Trajectory + response evaluation framework
// ===========================================================================
export {
  evaluate,
  exactMatch,
  contains,
  lengthRatio,
  toolUsage,
  createRegexMetric,
} from './eval';

// ===========================================================================
// Edge-Native — EdgeAgent, PeerAgent (UNIQUE to EADK)
// ===========================================================================
export { EdgeAgent, LocalInferenceProvider, PeerAgent } from './edge';

// ===========================================================================
// Transport — P2P mesh, A2A protocol
// ===========================================================================
export { P2PMesh, A2AClient, A2AServer } from './transport';
export type { A2AAgentCard, A2AMessage, A2AResponse } from './transport';

// ===========================================================================
// WASM — WASM tool execution sandbox
// ===========================================================================
export { createWASMTool } from './wasm';

// ===========================================================================
// MCP — Client/Server adapters
// ===========================================================================
export { MCPClient, MCPServer } from './mcp';

export type {
  GnosisPrimitive,
  GnosisTraceEvent,
  GnosisRuntimeOptions,
  GnosisRaceBranch,
  GnosisFoldBranch,
  GnosisFetchInput,
} from './core';
