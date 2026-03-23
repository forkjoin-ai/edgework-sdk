/**
 * EADK Core Types
 *
 * Shared type definitions for the Edgework Agent Development Kit.
 * Combines best primitives from Google ADK, OpenAI Agents SDK, Claude Agent SDK,
 * LangGraph, CrewAI, AutoGen, AWS Bedrock, and Vercel AI SDK — plus edge-native extensions.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Compute Preference (edge-unique)
// ---------------------------------------------------------------------------

export type ComputePreference = 'local' | 'edge' | 'cloud' | 'auto';

// ---------------------------------------------------------------------------
// Model Configuration
// ---------------------------------------------------------------------------

export interface ModelConfig {
  /** Model identifier (cloud API model ID or local model ref) */
  modelId: string;
  /** Provider name (openai, anthropic, google, local, edge) */
  provider?: string;
  /** Temperature override */
  temperature?: number;
  /** Max tokens override */
  maxTokens?: number;
  /** Top-p override */
  topP?: number;
  /** Top-k override */
  topK?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** API key (if provider-specific) */
  apiKey?: string;
  /** Base URL (if custom endpoint) */
  baseUrl?: string;
  /** Persistent custom headers sent with every request using this model */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

export interface EADKAgentConfig {
  /** Unique agent name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** System instructions — static string or dynamic function */
  instructions: string | ((ctx: AgentContext) => string | Promise<string>);
  /** Model configuration (string shorthand or full config) */
  model?: string | ModelConfig;
  /** Tools available to this agent */
  tools?: Tool[];
  /** Sub-agents this agent can delegate to */
  subAgents?: EADKAgent[];
  /** Handoff definitions for agent delegation */
  handoffs?: Handoff[];
  /** Input/output guardrails */
  guardrails?: {
    input?: Guardrail[];
    output?: Guardrail[];
  };
  /** Zod schema for structured output */
  outputSchema?: z.ZodSchema;
  /** Lifecycle callbacks */
  callbacks?: AgentCallbacks;
  /** Memory configuration */
  memory?: MemoryConfig;
  /** Where this agent prefers to run inference */
  computePreference?: ComputePreference;
  /** Max reasoning turns before stopping */
  maxTurns?: number;
  /** Max tool execution steps per turn */
  maxSteps?: number;
}

// ---------------------------------------------------------------------------
// Agent Types
// ---------------------------------------------------------------------------

export type AgentType =
  | 'llm'
  | 'sequential'
  | 'parallel'
  | 'loop'
  | 'graph'
  | 'crew'
  | 'edge'
  | 'peer'
  | 'custom';

// ---------------------------------------------------------------------------
// Tool Types
// ---------------------------------------------------------------------------

export interface Tool {
  /** Unique tool name */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Zod schema for input validation */
  inputSchema: z.ZodSchema;
  /** Optional Zod schema for output validation */
  outputSchema?: z.ZodSchema;
  /** Tool execution function */
  execute: (input: unknown, ctx: ToolContext) => Promise<unknown>;
  /** Whether tool requires human approval before execution */
  needsApproval?: boolean | ((input: unknown) => Promise<boolean>);
  /** Tool-level guardrails */
  guardrails?: {
    input?: ToolGuardrail[];
    output?: ToolGuardrail[];
  };
  /** Strict schema validation mode (Vercel AI SDK pattern) */
  strictMode?: boolean;
  /** Where this tool should execute */
  computeTarget?: ComputePreference;
}

export interface ToolGuardrail {
  name: string;
  validate: (value: unknown, ctx: ToolContext) => Promise<ToolGuardrailResult>;
}

export interface ToolGuardrailResult {
  passed: boolean;
  info?: Record<string, unknown>;
  replacement?: unknown;
}

// ---------------------------------------------------------------------------
// Guardrail Types
// ---------------------------------------------------------------------------

export interface Guardrail {
  /** Guardrail name */
  name: string;
  /** Validation function */
  validate: (input: unknown, ctx: GuardrailContext) => Promise<GuardrailResult>;
  /** Run in parallel with agent execution (optimistic) — OpenAI pattern */
  runInParallel?: boolean;
  /** Fail-fast halt on trigger — OpenAI tripwire pattern */
  tripwire?: boolean;
}

export interface GuardrailResult {
  /** Whether the input passed the guardrail */
  passed: boolean;
  /** Whether tripwire was triggered (causes immediate halt) */
  tripwireTriggered?: boolean;
  /** Additional info about the guardrail result */
  info?: Record<string, unknown>;
  /** Substitute value if blocked */
  replacement?: unknown;
}

// ---------------------------------------------------------------------------
// Memory Types
// ---------------------------------------------------------------------------

export type MemoryScope = 'temp' | 'session' | 'user' | 'app';

export type MemoryBackend =
  | 'memory'
  | 'opfs'
  | 'indexeddb'
  | 'sqlite'
  | 'postgres';

export interface MemoryConfig {
  /** Enable working context within session */
  shortTerm?: boolean;
  /** Enable cross-session semantic memory */
  longTerm?: boolean;
  /** Enable entity tracking (CrewAI pattern) */
  entity?: boolean;
  /** Storage backend */
  backend: MemoryBackend;
}

export interface MemoryEntry {
  key: string;
  value: unknown;
  scope: MemoryScope;
  embedding?: Float32Array;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

// ---------------------------------------------------------------------------
// Session & State
// ---------------------------------------------------------------------------

export interface SessionConfig {
  /** Unique session ID */
  id?: string;
  /** Initial state values */
  initialState?: Record<string, unknown>;
  /** Session timeout in ms */
  timeoutMs?: number;
}

export interface SessionState {
  /** Scoped state access */
  get(key: string, scope?: MemoryScope): unknown;
  set(key: string, value: unknown, scope?: MemoryScope): void;
  delete(key: string, scope?: MemoryScope): void;
  /** Get all state for a scope */
  getAll(scope?: MemoryScope): Record<string, unknown>;
  /** Clear all state for a scope */
  clear(scope?: MemoryScope): void;
}

// ---------------------------------------------------------------------------
// Handoff Types (OpenAI Agents SDK pattern)
// ---------------------------------------------------------------------------

export interface Handoff {
  /** Target agent to hand off to */
  target: EADKAgent;
  /** Description for the LLM to know when to hand off */
  description?: string;
  /** Filter to transform context before handoff */
  contextFilter?: (ctx: AgentContext) => AgentContext;
  /** experience that must be true for handoff to be available */
  experience?: (ctx: AgentContext) => boolean | Promise<boolean>;
}

export interface HandoffResult {
  /** Which agent was handed off to */
  targetAgent: string;
  /** Result from the target agent */
  result: RunResult;
  /** Metadata about the handoff */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Context Types
// ---------------------------------------------------------------------------

export interface AgentContext {
  /** Current session */
  session: SessionState;
  /** Agent name */
  agentName: string;
  /** Current turn number */
  turn: number;
  /** Conversation history */
  messages: Message[];
  /** Parent agent context (for sub-agent chains) */
  parent?: AgentContext;
  /** Compute preference resolved for this context */
  computePreference: ComputePreference;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

export interface ToolContext extends AgentContext {
  /** The tool being executed */
  toolName: string;
  /** Whether this is a retry */
  isRetry: boolean;
  /** Retry count */
  retryCount: number;
}

export interface GuardrailContext extends AgentContext {
  /** The guardrail being evaluated */
  guardrailName: string;
  /** Phase: input or output */
  phase: 'input' | 'output';
}

export interface HookContext extends AgentContext {
  /** Current span for tracing */
  spanId?: string;
  /** Timing info */
  startTime: number;
}

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  /** Tool call ID (for tool messages) */
  toolCallId?: string;
  /** Tool calls requested (for assistant messages) */
  toolCalls?: ToolCall[];
  /** Name of the agent that produced this message */
  agentName?: string;
  /** Timestamp */
  timestamp?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Runner Types
// ---------------------------------------------------------------------------

export interface RunConfig {
  /** Override agent model */
  model?: string | ModelConfig;
  /** Max reasoning turns */
  maxTurns?: number;
  /** Max tool execution steps per turn */
  maxSteps?: number;
  /** Lifecycle hooks */
  hooks?: RunHooks;
  /** Enable tracing */
  tracing?: boolean;
  /** Enable streaming */
  streaming?: boolean;
  /** Override compute preference */
  computePreference?: ComputePreference;
  /** Session configuration */
  session?: SessionConfig;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Enable debug mode — sends X-Debug header, returns verbose response metadata */
  debug?: boolean;
  /** Custom headers merged into every LLM request for this run */
  headers?: Record<string, string>;
  /** Activation steering config applied to every LLM request for this run */
  steering?: SteeringConfig;
}

export interface RunResult {
  /** Final output text */
  output: string;
  /** Structured output (if outputSchema was provided) */
  structuredOutput?: unknown;
  /** All messages in the conversation */
  messages: Message[];
  /** Tool calls that were made */
  toolCalls: ToolCallResult[];
  /** Total token usage */
  usage: TokenUsage;
  /** Duration in ms */
  durationMs: number;
  /** Number of turns used */
  turns: number;
  /** Whether max turns was reached */
  maxTurnsReached: boolean;
  /** Handoff result (if agent handed off) */
  handoff?: HandoffResult;
  /** Guardrails that were triggered */
  guardrailsTriggered: string[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Streaming Event Types
// ---------------------------------------------------------------------------

export type RunEventType =
  | 'agent_start'
  | 'agent_end'
  | 'llm_start'
  | 'llm_chunk'
  | 'llm_end'
  | 'tool_start'
  | 'tool_end'
  | 'handoff'
  | 'guardrail_triggered'
  | 'checkpoint'
  | 'error';

export interface RunEvent {
  type: RunEventType;
  agentName: string;
  timestamp: number;
  data: RunEventData;
}

export type RunEventData =
  | { type: 'agent_start'; turn: number }
  | { type: 'agent_end'; result: RunResult }
  | { type: 'llm_start'; model: string }
  | { type: 'llm_chunk'; text: string; tokenIndex: number }
  | { type: 'llm_end'; usage: TokenUsage }
  | { type: 'tool_start'; toolName: string; args: unknown }
  | { type: 'tool_end'; toolName: string; result: unknown; durationMs: number }
  | { type: 'handoff'; from: string; to: string }
  | {
      type: 'guardrail_triggered';
      guardrailName: string;
      result: GuardrailResult;
    }
  | { type: 'checkpoint'; state: unknown }
  | { type: 'error'; error: Error };

// ---------------------------------------------------------------------------
// Lifecycle Hook Types
// ---------------------------------------------------------------------------

export interface RunHooks {
  onAgentStart?: (ctx: HookContext) => void | Promise<void>;
  onAgentEnd?: (ctx: HookContext) => void | Promise<void>;
  onLLMStart?: (
    ctx: HookContext,
    request: LLMRequest
  ) => LLMRequest | void | Promise<LLMRequest | void>;
  onLLMEnd?: (
    ctx: HookContext,
    response: LLMResponse
  ) => LLMResponse | void | Promise<LLMResponse | void>;
  onToolStart?: (
    ctx: HookContext,
    name: string,
    args: unknown
  ) => unknown | void | Promise<unknown | void>;
  onToolEnd?: (
    ctx: HookContext,
    name: string,
    result: unknown
  ) => unknown | void | Promise<unknown | void>;
  onHandoff?: (
    ctx: HookContext,
    from: string,
    to: string
  ) => void | Promise<void>;
  onGuardrailTriggered?: (
    ctx: HookContext,
    guardrailName: string,
    result: GuardrailResult
  ) => void | Promise<void>;
  onCheckpoint?: (ctx: HookContext, state: unknown) => void | Promise<void>;
}

export interface LLMRequest {
  model: string;
  messages: Message[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json';
  /** Override tool_choice (default: 'auto' when tools present) */
  toolChoice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
  /** Custom headers merged into the inference request */
  headers?: Record<string, string>;
  /** Arbitrary metadata forwarded to the inference gateway */
  metadata?: Record<string, unknown>;
  /** Activation steering configuration */
  steering?: SteeringConfig;
  /** Superinference (quantum-inspired) query mode */
  superinference?: SuperinferenceConfig;
  /** Enable debug mode on the inference gateway */
  debug?: boolean;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: 'stop' | 'tool_calls' | 'max_tokens' | 'error';
  model: string;
  /** Response headers from the inference gateway (X-* headers, rate limits, billing, etc.) */
  responseHeaders?: Record<string, string>;
  /** Response metadata from the inference gateway */
  responseMeta?: ResponseMeta;
}

// ---------------------------------------------------------------------------
// Inference Passthrough Types
// ---------------------------------------------------------------------------

/** Response metadata captured from the inference gateway */
export interface ResponseMeta {
  /** Inference type (in-worker, distributed-coordinator, workers-ai, etc.) */
  inferenceType?: string;
  /** Inference duration in ms */
  durationMs?: number;
  /** Model actually used (may differ from requested due to model matching) */
  modelUsed?: string;
  /** Whether model was substituted */
  modelSubstituted?: boolean;
  /** Rate limit info */
  rateLimit?: {
    limit?: number;
    remaining?: number;
    reset?: number;
  };
  /** Credit/billing info */
  credits?: {
    remaining?: number;
    cost?: number;
    used?: number;
  };
  /** Whether steering was applied */
  steeringApplied?: boolean;
  /** Layers that were steered */
  steeredLayers?: number[];
  /** Superinference mode that was used */
  superinferenceMode?: string;
  /** Cache status (HIT/MISS) */
  cacheStatus?: string;
}

/** Activation steering configuration for emotional/behavioral concept tuning */
export interface SteeringConfig {
  /** Concept shorthand strings: "empathy:strong", "truthfulness:moderate", etc. */
  concepts?: string[];
  /** Raw steering vectors for advanced use */
  vectors?: SteeringVectorInput[];
  /** Normalize vectors (default: true) */
  normalize?: boolean;
  /** Global scale factor (default: 1.0) */
  globalScale?: number;
  /** Clamp activation range */
  clampRange?: { min: number; max: number };
}

/** Raw steering vector input for advanced/custom steering */
export interface SteeringVectorInput {
  name: string;
  direction: number[];
  targetLayers: number[];
  alpha: number;
  hiddenDim: number;
}

/** Superinference (quantum-inspired) query configuration */
export interface SuperinferenceConfig {
  /** Query mode */
  mode: SuperinferenceMode;
  /** Models to use (for superposition, interference, measurement, search) */
  models?: string[];

  // -- Superposition --
  /** Selection strategy for superposition mode */
  selectionStrategy?: 'best' | 'consensus' | 'fastest';

  // -- Entanglement --
  /** Cache prefix for entanglement mode */
  prefix?: string;
  /** TTL in seconds for entanglement cache */
  ttlSeconds?: number;

  // -- Tunneling --
  /** Confidence threshold for tunneling mode */
  confidenceThreshold?: number;
  /** Max probe depth for tunneling */
  maxProbeDepth?: number;

  // -- Interference --
  /** Minimum model agreement for interference mode */
  minAgreement?: number;
  /** Interference type */
  sliverType?: 'constructive' | 'destructive';

  // -- Measurement --
  /** Whether to collapse the wave function in measurement mode */
  collapse?: boolean;

  // -- Search (Grover-style) --
  /** Search space type */
  searchSpace?: 'permutation' | 'combination' | 'parameter' | 'prompt';
  /** Parallel evaluation width */
  superpositionWidth?: number;
  /** Max search iterations */
  maxIterations?: number;
  /** Optimization objective */
  objective?: 'maximize' | 'minimize';
  /** Iteration strategy */
  iterationStrategy?: 'amplify-mutate' | 'oracle-guided' | 'filter';
  /** Convergence threshold */
  convergenceThreshold?: number;
  /** Interference threshold for search elimination */
  sliverThreshold?: number;
}

export type SuperinferenceMode =
  | 'superposition'
  | 'entanglement'
  | 'tunneling'
  | 'sliver'
  | 'measurement'
  | 'search';

// ---------------------------------------------------------------------------
// Agent Callbacks (convenience subset of hooks)
// ---------------------------------------------------------------------------

export interface AgentCallbacks {
  onStart?: (agentName: string) => void;
  onEnd?: (agentName: string, result: RunResult) => void;
  onToolCall?: (agentName: string, toolName: string, args: unknown) => void;
  onToolResult?: (agentName: string, toolName: string, result: unknown) => void;
  onError?: (agentName: string, error: Error) => void;
}

// ---------------------------------------------------------------------------
// Live Session (bidirectional streaming)
// ---------------------------------------------------------------------------

export interface LiveSession {
  /** Send a message to the agent */
  send(message: string): void;
  /** Send audio data */
  sendAudio?(data: ArrayBuffer): void;
  /** Receive events */
  events: AsyncIterable<RunEvent>;
  /** Close the session */
  close(): void;
  /** Whether the session is active */
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Graph Types (LangGraph-inspired)
// ---------------------------------------------------------------------------

export interface GraphConfig {
  /** Graph nodes keyed by name */
  nodes: Record<string, GraphNode>;
  /** Edges defining flow */
  edges: GraphEdge[];
  /** Entry point node name */
  entryPoint: string;
  /** Checkpointer for durable execution */
  checkpointer?: Checkpointer;
}

export interface GraphNode {
  /** Agent to run at this node */
  agent?: EADKAgent;
  /** Custom function to run at this node */
  fn?: (state: unknown, ctx: AgentContext) => Promise<unknown>;
}

export interface GraphEdge {
  /** Source node name */
  from: string;
  /** Target node name (string) or conditional routing function */
  to: string | ((state: unknown) => string | Promise<string>);
}

export interface Checkpointer {
  /** Save a checkpoint */
  save(id: string, state: unknown): Promise<void>;
  /** Load a checkpoint */
  load(id: string): Promise<unknown | null>;
  /** List available checkpoints */
  list(): Promise<string[]>;
  /** Delete a checkpoint */
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Crew Agent Types (CrewAI-inspired)
// ---------------------------------------------------------------------------

export interface CrewAgentConfig extends EADKAgentConfig {
  /** Agent's role */
  role: string;
  /** Agent's goal */
  goal: string;
  /** Agent's backstory for personality */
  backstory?: string;
  /** Allow delegation to other agents */
  allowDelegation?: boolean;
}

// ---------------------------------------------------------------------------
// Evaluation Types
// ---------------------------------------------------------------------------

export interface EvalCase {
  /** Input to the agent */
  input: string;
  /** Expected output (for response evaluation) */
  expectedOutput?: string;
  /** Expected tool calls (for trajectory evaluation) */
  expectedToolCalls?: Array<{ name: string; args?: unknown }>;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface EvalResult {
  /** The eval case */
  case: EvalCase;
  /** Actual agent output */
  actualOutput: string;
  /** Actual tool calls */
  actualToolCalls: ToolCallResult[];
  /** Score (0-1) */
  score: number;
  /** Per-metric scores */
  metrics: Record<string, number>;
  /** Duration */
  durationMs: number;
  /** Pass/fail */
  passed: boolean;
}

export interface EvalMetric {
  name: string;
  evaluate: (
    expected: string | undefined,
    actual: string,
    ctx: EvalContext
  ) => number | Promise<number>;
}

export interface EvalContext {
  case: EvalCase;
  toolCalls: ToolCallResult[];
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Tracing Types
// ---------------------------------------------------------------------------

export type SpanType =
  | 'agent'
  | 'llm'
  | 'tool'
  | 'guardrail'
  | 'handoff'
  | 'memory'
  | 'graph_node';

export interface Span {
  id: string;
  parentId?: string;
  traceId: string;
  type: SpanType;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  status: 'ok' | 'error' | 'unset';
  error?: Error;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface TraceExporter {
  exportSpan(span: Span): void;
  flush(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Abstract Agent Interface
// ---------------------------------------------------------------------------

export interface EADKAgent {
  /** Agent configuration */
  readonly config: EADKAgentConfig;
  /** Agent type identifier */
  readonly type: AgentType;
  /** Run the agent with input and return result */
  run(input: string, config?: RunConfig): Promise<RunResult>;
  /** Stream events from the agent */
  stream(input: string, config?: RunConfig): AsyncIterable<RunEvent>;
}
