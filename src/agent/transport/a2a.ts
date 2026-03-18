/**
 * A2A Protocol
 *
 * Agent-to-Agent protocol for cross-framework interoperability.
 * Google ADK A2A pattern — allows agents from different frameworks to communicate.
 */

import {
  GnosisClientRuntime,
  type GnosisTraceEvent,
} from '../core/gnosis-runtime';

export interface A2AAgentCard {
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Supported capabilities */
  capabilities: string[];
  /** Agent endpoint URL */
  endpoint: string;
  /** Protocol version */
  version: string;
  /** Supported input/output formats */
  formats: string[];
}

export interface A2AMessage {
  /** Message ID */
  id: string;
  /** Sender agent card */
  from: A2AAgentCard;
  /** Task to perform */
  task: string;
  /** Input data */
  input: unknown;
  /** Expected output format */
  outputFormat?: string;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface A2AResponse {
  /** Original message ID */
  messageId: string;
  /** Response status */
  status: 'success' | 'error' | 'partial';
  /** Output data */
  output: unknown;
  /** Error message if status is error */
  error?: string;
  /** Processing time in ms */
  processingMs: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A2A Client — sends tasks to remote agents.
 */
export class A2AClient {
  private agentCard: A2AAgentCard;
  private runtime: GnosisClientRuntime;

  constructor(agentCard: A2AAgentCard) {
    this.agentCard = agentCard;
    this.runtime = new GnosisClientRuntime(`a2a-client:${agentCard.name}`);
  }

  getTopologyTrace(): readonly GnosisTraceEvent[] {
    return this.runtime.getTrace();
  }

  /**
   * Discover remote agents at an endpoint.
   */
  async discover(endpointUrl: string): Promise<A2AAgentCard[]> {
    return this.runtime.process('discover-agents', async () => {
      try {
        return await this.runtime.fetchJson<A2AAgentCard[]>(
          'discover-agents:fetch',
          {
            url: `${endpointUrl}/.well-known/a2a`,
          }
        );
      } catch (error) {
        this.runtime.vent('discover-agents:failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    });
  }

  /**
   * Send a task to a remote agent.
   */
  async sendTask(
    target: A2AAgentCard,
    task: string,
    input: unknown,
    options?: { timeoutMs?: number; outputFormat?: string }
  ): Promise<A2AResponse> {
    const message: A2AMessage = {
      id: crypto.randomUUID(),
      from: this.agentCard,
      task,
      input,
      outputFormat: options?.outputFormat,
      timeoutMs: options?.timeoutMs,
    };

    return this.runtime.process(`send-task:${task}`, async () => {
      try {
        return await this.runtime.fetchJson<A2AResponse>(`send-task:${task}:fetch`, {
          url: `${target.endpoint}/a2a/task`,
          timeoutMs: options?.timeoutMs,
          init: {
            method: 'POST',
            body: JSON.stringify(message),
          },
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        this.runtime.vent(`send-task:${task}:failed`, {
          reason: error instanceof Error ? error.message : String(error),
          target: target.endpoint,
        });
        return {
          messageId: message.id,
          status: 'error',
          output: null,
          error: error instanceof Error ? error.message : String(error),
          processingMs: 0,
        };
      }
    });
  }
}

/**
 * A2A Server — receives tasks from remote agents.
 */
export class A2AServer {
  private agentCard: A2AAgentCard;
  private handler: (
    message: A2AMessage
  ) => Promise<{ output: unknown; metadata?: Record<string, unknown> }>;

  constructor(agentCard: A2AAgentCard, handler: A2AServer['handler']) {
    this.agentCard = agentCard;
    this.handler = handler;
  }

  /**
   * Get the agent card for discovery.
   */
  getAgentCard(): A2AAgentCard {
    return this.agentCard;
  }

  /**
   * Handle an incoming A2A task.
   */
  async handleTask(message: A2AMessage): Promise<A2AResponse> {
    const startTime = Date.now();

    try {
      const result = await this.handler(message);
      return {
        messageId: message.id,
        status: 'success',
        output: result.output,
        processingMs: Date.now() - startTime,
        metadata: result.metadata,
      };
    } catch (err) {
      return {
        messageId: message.id,
        status: 'error',
        output: null,
        error: err instanceof Error ? err.message : String(err),
        processingMs: Date.now() - startTime,
      };
    }
  }
}
