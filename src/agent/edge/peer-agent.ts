/**
 * Peer Agent
 *
 * Distributed agent that runs across peer compute nodes.
 * Leverages existing edgework gateway connector and compute node infrastructure.
 * UNIQUE to EADK — no other framework has this.
 */

import { BaseAgent } from '../core/agent';
import { createAgentContext, createHookContext } from '../core/context';
import { Session } from '../core/session';
import { mergeHooks } from '../core/hooks';
import type {
  AgentType,
  EADKAgentConfig,
  RunConfig,
  RunResult,
  RunEvent,
  Message,
} from '../core/types';

export interface PeerAgentConfig extends EADKAgentConfig {
  /** Peer discovery method */
  discovery?: 'gateway' | 'mdns' | 'manual';
  /** Known peer endpoints */
  peers?: string[];
  /** Timeout for peer communication */
  peerTimeoutMs?: number;
  /** Number of peers to fan out to */
  fanOut?: number;
  /** Strategy for aggregating peer results */
  aggregation?: 'first' | 'majority' | 'all' | 'custom';
  /** Custom aggregation function */
  aggregateFn?: (results: PeerResult[]) => string;
}

export interface PeerResult {
  peerId: string;
  output: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export class PeerAgent extends BaseAgent {
  readonly type: AgentType = 'peer';
  private peerConfig: PeerAgentConfig;

  constructor(config: PeerAgentConfig) {
    super({
      ...config,
      computePreference: 'edge',
    });
    this.peerConfig = config;
  }

  async run(input: string, runConfig?: RunConfig): Promise<RunResult> {
    const startTime = Date.now();
    const session = runConfig?.session
      ? new Session(runConfig.session)
      : new Session();

    const ctx = createAgentContext({
      agentName: this.config.name,
      session,
      computePreference: 'edge',
      abortSignal: runConfig?.abortSignal,
    });

    const hooks = mergeHooks(runConfig?.hooks);

    if (hooks.onAgentStart) {
      await hooks.onAgentStart(createHookContext(ctx));
    }

    const messages: Message[] = [
      { role: 'user', content: input, timestamp: Date.now() },
    ];

    const peers = this.peerConfig.peers ?? [];
    const fanOut = this.peerConfig.fanOut ?? peers.length;
    const timeoutMs = this.peerConfig.peerTimeoutMs ?? 10_000;
    const selectedPeers = peers.slice(0, fanOut);

    // Distribute to peers
    const peerResults = await Promise.allSettled(
      selectedPeers.map((peer) => this.queryPeer(peer, input, timeoutMs))
    );

    const results: PeerResult[] = peerResults.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        peerId: selectedPeers[i],
        output: '',
        latencyMs: 0,
        success: false,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });

    // Aggregate results
    const output = this.aggregateResults(results);

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
      structuredOutput: { peerResults: results },
      messages,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      durationMs: Date.now() - startTime,
      turns: 1,
      maxTurnsReached: false,
      guardrailsTriggered: [],
    };
  }

  private async queryPeer(
    peerUrl: string,
    input: string,
    timeoutMs: number
  ): Promise<PeerResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${peerUrl}/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: this.config.name,
          input,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Peer returned ${response.status}`);
      }

      const data = (await response.json()) as { output: string };

      return {
        peerId: peerUrl,
        output: data.output,
        latencyMs: Date.now() - startTime,
        success: true,
      };
    } catch (err) {
      return {
        peerId: peerUrl,
        output: '',
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private aggregateResults(results: PeerResult[]): string {
    const successful = results.filter((r) => r.success);

    if (successful.length === 0) {
      return `[PeerAgent:${this.config.name}] All peers failed to respond`;
    }

    if (this.peerConfig.aggregateFn) {
      return this.peerConfig.aggregateFn(results);
    }

    switch (this.peerConfig.aggregation) {
      case 'first':
        return successful[0].output;
      case 'majority': {
        // Return most common response
        const counts = new Map<string, number>();
        for (const r of successful) {
          counts.set(r.output, (counts.get(r.output) ?? 0) + 1);
        }
        let maxCount = 0;
        let majorityOutput = '';
        for (const [output, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            majorityOutput = output;
          }
        }
        return majorityOutput;
      }
      case 'all':
        return successful.map((r) => r.output).join('\n\n---\n\n');
      default:
        // Default: fastest response
        return successful.sort((a, b) => a.latencyMs - b.latencyMs)[0].output;
    }
  }
}
