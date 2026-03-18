/**
 * MCP Client Adapter
 *
 * Consume any MCP server as agent tools.
 * Google ADK / OpenAI / Vercel / Claude pattern.
 */

import { z } from 'zod';
import type { Tool, ToolContext } from '../core/types';
import {
  GnosisClientRuntime,
  type GnosisTraceEvent,
} from '../core/gnosis-runtime';

export interface MCPServerConfig {
  /** MCP server URL or transport */
  url: string;
  /** Server name */
  name: string;
  /** Authentication headers */
  headers?: Record<string, string>;
  /** Tool filter (only expose these tools) */
  toolFilter?: string[];
  /** Timeout for tool calls */
  timeoutMs?: number;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Client that discovers and wraps MCP server tools as EADK tools.
 */
export class MCPClient {
  private config: MCPServerConfig;
  private tools: Map<string, MCPToolDefinition> = new Map();
  private runtime: GnosisClientRuntime;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.runtime = new GnosisClientRuntime(`mcp-client:${config.name}`);
  }

  getTopologyTrace(): readonly GnosisTraceEvent[] {
    return this.runtime.getTrace();
  }

  /**
   * Discover available tools from the MCP server.
   */
  async discover(): Promise<MCPToolDefinition[]> {
    return this.runtime.process('discover-tools', async () => {
      try {
        const data = await this.runtime.fetchJson<{
          result?: { tools?: MCPToolDefinition[] };
        }>('discover-tools:fetch', {
          url: `${this.config.url}/tools/list`,
          timeoutMs: this.config.timeoutMs,
          init: {
            method: 'POST',
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/list',
              id: 1,
            }),
          },
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.headers ?? {}),
          },
        });

        const serverTools = data.result?.tools ?? [];

        const filtered = this.config.toolFilter
          ? serverTools.filter((tool) =>
              this.config.toolFilter?.includes(tool.name)
            )
          : serverTools;

        for (const tool of filtered) {
          this.tools.set(tool.name, tool);
        }

        return filtered;
      } catch (error) {
        this.runtime.vent('discover-tools:failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    });
  }

  /**
   * Get EADK tools from discovered MCP tools.
   */
  getTools(): Tool[] {
    return [...this.tools.values()].map((mcpTool) => this.wrapMCPTool(mcpTool));
  }

  /**
   * Call a specific MCP tool.
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.runtime.process(`call-tool:${name}`, async () => {
      const data = await this.runtime.fetchJson<{
        result?: {
          content?: Array<{ text?: string }>;
        };
      }>(`call-tool:${name}:fetch`, {
        url: `${this.config.url}/tools/call`,
        timeoutMs: this.config.timeoutMs,
        init: {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name, arguments: args },
            id: Date.now(),
          }),
        },
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers ?? {}),
        },
      });
      return data.result?.content?.[0]?.text ?? data.result;
    });
  }

  private wrapMCPTool(mcpTool: MCPToolDefinition): Tool {
    return {
      name: `${this.config.name}__${mcpTool.name}`,
      description: mcpTool.description,
      inputSchema: z.any(),
      execute: async (input: unknown, _ctx: ToolContext) => {
        return this.callTool(mcpTool.name, input);
      },
      computeTarget: 'cloud',
    };
  }
}
