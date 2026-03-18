import { z } from 'zod';
import type { Tool } from '../agent/core/types';
import { ForgoLogsClient } from './forgo-logs-client';

/**
 * MCP Tools for ForgoCD Deployment Engine
 */
export function createForgoMCPTools(
  routerUrl = 'http://localhost:3334'
): Tool[] {
  return [
    {
      name: 'forgo_status',
      description:
        'Get the status of all processes running on the local ForgoCD engine',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const res = await fetch(`${routerUrl}/__forgo/status`);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const processes = await res.json();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(processes, null, 2),
              },
            ],
          };
        } catch (err: any) {
          throw new Error(
            `Failed to connect to ForgoCD engine at ${routerUrl}: ${err.message}`
          );
        }
      },
    } as unknown as Tool,
    {
      name: 'forgo_stop',
      description: 'Stop a running ForgoCD process by name',
      inputSchema: z.object({
        name: z.string().describe('The name of the process to stop'),
      }),
      execute: async (input: unknown) => {
        const { name } = input as { name: string };
        return {
          content: [
            {
              type: 'text',
              text: `To stop process "${name}", please use the CLI: bun run forge:stop ${name} or connect to the deploy engine.`,
            },
          ],
        };
      },
    } as unknown as Tool,
  ];
}

/**
 * MCP Tools for Forgo Logs Observability Platform
 */
export function createForgoLogsMCPTools(
  logsUrl = 'http://localhost:8787',
  orgId = 'default'
): Tool[] {
  const client = new ForgoLogsClient({ baseUrl: logsUrl, orgId });

  return [
    {
      name: 'forgo_logs_query',
      description:
        'Search/filter logs by source, level, category, worker, trace, or text',
      inputSchema: z.object({
        source: z
          .string()
          .optional()
          .describe('Log source: forgo-cd, workflow, worker, app, system'),
        level: z
          .string()
          .optional()
          .describe('Log level: debug, info, warn, error, fatal'),
        category: z
          .string()
          .optional()
          .describe('Category: deploy, health, request, build, cron, general'),
        workerName: z.string().optional().describe('Worker name filter'),
        search: z.string().optional().describe('Text search in message'),
        limit: z.number().optional().describe('Max results (default 100)'),
      }),
      execute: async (input: unknown) => {
        const query = input as any;
        const result = await client.queryLogs(query);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_logs_tail',
      description: 'Get the latest N log entries (real-time tail)',
      inputSchema: z.object({
        count: z.number().optional().describe('Number of entries (default 50)'),
      }),
      execute: async (input: unknown) => {
        const { count } = input as { count?: number };
        const result = await client.tail(count ?? 50);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_logs_trace',
      description: 'Follow a distributed trace by trace ID',
      inputSchema: z.object({
        traceId: z.string().describe('The trace ID to follow'),
      }),
      execute: async (input: unknown) => {
        const { traceId } = input as { traceId: string };
        const result = await client.trace(traceId);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_analytics_dashboard',
      description: 'Get summary metrics for log analytics dashboard',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await client.dashboard();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_analytics_rollups',
      description: 'Query pre-aggregated rollups from R2 storage',
      inputSchema: z.object({
        granularity: z
          .enum(['hourly', 'daily', 'weekly'])
          .describe('Rollup granularity'),
        metricName: z.string().optional().describe('Filter by metric name'),
        since: z.number().optional().describe('Start timestamp (ms)'),
        until: z.number().optional().describe('End timestamp (ms)'),
      }),
      execute: async (input: unknown) => {
        const query = input as any;
        const result = await client.rollups({ orgId, ...query });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_analytics_export',
      description: 'Export logs/events as JSON or CSV',
      inputSchema: z.object({
        format: z
          .enum(['json', 'csv'])
          .optional()
          .describe('Export format (default json)'),
        source: z.string().optional().describe('Log source filter'),
        level: z.string().optional().describe('Log level filter'),
        limit: z.number().optional().describe('Max entries'),
      }),
      execute: async (input: unknown) => {
        const { format, ...query } = input as any;
        const result = await client.exportLogs(query, format ?? 'json');
        return {
          content: [{ type: 'text', text: result }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_archives_list',
      description: 'List R2 log archive manifests',
      inputSchema: z.object({
        limit: z.number().optional().describe('Max archives (default 50)'),
      }),
      execute: async (input: unknown) => {
        const { limit } = input as { limit?: number };
        const result = await client.listArchives(limit ?? 50);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_archives_search',
      description: 'Search archived logs (decrypt + decompress)',
      inputSchema: z.object({
        query: z.string().describe('Search query text'),
      }),
      execute: async (input: unknown) => {
        const { query } = input as { query: string };
        const result = await client.searchArchives(query);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_health',
      description: 'Get pipeline health: buffer stats, archive status',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await client.health();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,

    {
      name: 'forgo_quota',
      description: 'Get org quota usage and remaining capacity',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await client.quota();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    } as unknown as Tool,
  ];
}
