/**
 * MCP Server Adapter
 *
 * Expose EADK agents and tools as an MCP server.
 * Google ADK pattern — makes agents consumable by any MCP client.
 */

import { z } from 'zod';
import type { EADKAgent, Tool } from '../core/types';
import { zodToJsonSchema } from '../core/tool';

export interface MCPServerOptions {
  /** Server name */
  name: string;
  /** Server description */
  description?: string;
  /** Agents to expose as tools */
  agents?: EADKAgent[];
  /** Additional tools to expose */
  tools?: Tool[];
}

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string };
  id?: string | number;
}

/**
 * MCP Server that exposes EADK agents and tools.
 */
export class MCPServer {
  private options: MCPServerOptions;
  private tools: Map<string, Tool> = new Map();

  constructor(options: MCPServerOptions) {
    this.options = options;

    // Register agent tools
    if (options.agents) {
      for (const agent of options.agents) {
        const agentTool: Tool = {
          name: `agent_${agent.config.name}`,
          description:
            agent.config.description ?? `Run the ${agent.config.name} agent`,
          inputSchema: z.object({
            input: z.string(),
          }),
          execute: async (input: unknown) => {
            const typedInput = input as { input: string };
            const result = await agent.run(typedInput.input);
            return result.output;
          },
        } as Tool;
        this.tools.set(agentTool.name, agentTool);
      }
    }

    // Register additional tools
    if (options.tools) {
      for (const tool of options.tools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  /**
   * Handle an MCP JSON-RPC request.
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: this.options.name,
              version: '0.1.0',
            },
          },
          id: request.id,
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          result: {
            tools: [...this.tools.values()].map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: zodToJsonSchema(tool.inputSchema),
            })),
          },
          id: request.id,
        };

      case 'tools/call': {
        const params = request.params as {
          name: string;
          arguments?: unknown;
        };
        const tool = this.tools.get(params.name);

        if (!tool) {
          return {
            jsonrpc: '2.0',
            error: { code: -32601, message: `Unknown tool: ${params.name}` },
            id: request.id,
          };
        }

        try {
          const result = await tool.execute(params.arguments, {} as any);
          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text:
                    typeof result === 'string'
                      ? result
                      : JSON.stringify(result),
                },
              ],
            },
            id: request.id,
          };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: err instanceof Error ? err.message : String(err),
            },
            id: request.id,
          };
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
          id: request.id,
        };
    }
  }
}
