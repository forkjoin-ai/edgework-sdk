/**
 * Graph Agent
 *
 * Cyclic directed graph with conditional edges, checkpointing, and time travel.
 * LangGraph-inspired orchestration engine.
 */

import { BaseAgent } from '../core/agent';
import { createAgentContext } from '../core/context';
import { Session } from '../core/session';
import type {
  AgentType,
  AgentContext,
  EADKAgentConfig,
  RunConfig,
  RunResult,
  RunEvent,
  GraphConfig,
  GraphNode,
  GraphEdge,
  Checkpointer,
  Message,
  TokenUsage,
  ToolCallResult,
} from '../core/types';

export interface GraphAgentConfig extends EADKAgentConfig {
  name: string;
  description?: string;
  instructions: string | ((ctx: AgentContext) => string | Promise<string>);
  /** Graph configuration */
  graph: GraphConfig;
}

/**
 * In-memory checkpointer for graph state persistence.
 */
export class InMemoryCheckpointer implements Checkpointer {
  private store = new Map<string, unknown>();

  async save(id: string, state: unknown): Promise<void> {
    this.store.set(id, structuredClone(state));
  }

  async load(id: string): Promise<unknown | null> {
    const data = this.store.get(id);
    return data ? structuredClone(data) : null;
  }

  async list(): Promise<string[]> {
    return [...this.store.keys()];
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

/**
 * Special node names for graph control flow.
 */
export const END = '__end__';

export class GraphAgent extends BaseAgent {
  readonly type: AgentType = 'graph';
  private readonly graph: GraphConfig;

  constructor(config: GraphAgentConfig) {
    super(config);
    this.graph = config.graph;
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

    // Graph state
    let state: Record<string, unknown> = { input, output: '' };
    let currentNode = this.graph.entryPoint;
    let stepCount = 0;
    const maxSteps = runConfig?.maxSteps ?? 50;
    const visitedNodes: string[] = [];

    while (currentNode !== END && stepCount < maxSteps) {
      // Check abort
      if (ctx.abortSignal?.aborted) break;

      const node = this.graph.nodes[currentNode];
      if (!node) {
        throw new Error(`Graph node '${currentNode}' not found`);
      }

      visitedNodes.push(currentNode);

      // Execute node
      if (node.agent) {
        const nodeInput =
          typeof state.output === 'string' && state.output
            ? state.output
            : input;
        const result = await node.agent.run(nodeInput, runConfig);

        allMessages.push(...result.messages);
        allToolCalls.push(...result.toolCalls);
        totalUsage.promptTokens += result.usage.promptTokens;
        totalUsage.completionTokens += result.usage.completionTokens;
        totalUsage.totalTokens += result.usage.totalTokens;
        guardrailsTriggered.push(...result.guardrailsTriggered);

        state.output = result.output;
        state[`${currentNode}_result`] = result;
      } else if (node.fn) {
        const result = await node.fn(state, ctx);
        if (typeof result === 'string') {
          state.output = result;
        } else if (result && typeof result === 'object') {
          state = { ...state, ...(result as Record<string, unknown>) };
        }
      }

      // Checkpoint if configured
      if (this.graph.checkpointer) {
        const checkpointId = `${session.id}:step-${stepCount}`;
        await this.graph.checkpointer.save(checkpointId, {
          state,
          currentNode,
          stepCount,
          visitedNodes: [...visitedNodes],
        });
      }

      // Find next node via edges
      const edge = this.graph.edges.find((e) => e.from === currentNode);
      if (!edge) {
        // No outgoing edge — end
        break;
      }

      // Resolve next node (may be conditional)
      if (typeof edge.to === 'function') {
        currentNode = await edge.to(state);
      } else {
        currentNode = edge.to;
      }

      stepCount++;
    }

    const output =
      typeof state.output === 'string'
        ? state.output
        : JSON.stringify(state.output);

    return {
      output,
      structuredOutput: state,
      messages: allMessages,
      toolCalls: allToolCalls,
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      turns: stepCount,
      maxTurnsReached: stepCount >= maxSteps,
      guardrailsTriggered,
    };
  }

  /**
   * Resume graph execution from a checkpoint.
   */
  async resumeFrom(
    checkpointId: string,
    runConfig?: RunConfig
  ): Promise<RunResult> {
    if (!this.graph.checkpointer) {
      throw new Error('Cannot resume without a checkpointer');
    }

    const checkpoint = (await this.graph.checkpointer.load(checkpointId)) as {
      state: Record<string, unknown>;
      currentNode: string;
      stepCount: number;
      visitedNodes: string[];
    } | null;

    if (!checkpoint) {
      throw new Error(`Checkpoint '${checkpointId}' not found`);
    }

    // Re-run from the checkpoint state
    return this.run(checkpoint.state.input as string, runConfig);
  }
}
