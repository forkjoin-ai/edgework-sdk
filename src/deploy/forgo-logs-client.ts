/**
 * Forgo Logs — Remote API Client
 *
 * Client SDK for MCP tools to consume the Forgo Logs worker API.
 */

import type {
  ForgoLogEntry,
  ForgoLogQuery,
  ForgoRollupQuery,
  ForgoRollup,
  ForgoArchiveManifest,
  ForgoQuotaStatus,
} from '../types/forgo-logs-types';
import {
  GnosisClientRuntime,
  type GnosisTraceEvent,
} from '../agent/core/gnosis-runtime';

export interface ForgoLogsClientConfig {
  baseUrl: string;
  orgId: string;
  authToken?: string;
}

export class ForgoLogsClient {
  private _baseUrl: string;
  private _orgId: string;
  private _authToken?: string;
  private _runtime: GnosisClientRuntime;

  constructor(config: ForgoLogsClientConfig) {
    this._baseUrl = config.baseUrl.replace(/\/$/, '');
    this._orgId = config.orgId;
    this._authToken = config.authToken;
    this._runtime = new GnosisClientRuntime(
      `forgo-logs-client:${config.orgId}`
    );
  }

  getTopologyTrace(): readonly GnosisTraceEvent[] {
    return this._runtime.getTrace();
  }

  /** Query logs with filtering */
  async queryLogs(
    query?: Partial<ForgoLogQuery>
  ): Promise<{ logs: ForgoLogEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.source) params.set('source', query.source);
    if (query?.level) params.set('level', query.level);
    if (query?.category) params.set('category', query.category);
    if (query?.workerName) params.set('workerName', query.workerName);
    if (query?.traceId) params.set('traceId', query.traceId);
    if (query?.search) params.set('search', query.search);
    if (query?.since) params.set('since', String(query.since));
    if (query?.until) params.set('until', String(query.until));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    if (query?.sortBy) params.set('sortBy', query.sortBy);
    if (query?.sortOrder) params.set('sortOrder', query.sortOrder);

    return this._fetch(`/logs?${params.toString()}`);
  }

  /** Get latest N logs (tail) */
  async tail(count = 50): Promise<{ logs: ForgoLogEntry[]; total: number }> {
    return this.queryLogs({ limit: count, sortOrder: 'desc' });
  }

  /** Follow distributed trace by ID */
  async trace(
    traceId: string
  ): Promise<{ traceId: string; logs: ForgoLogEntry[]; count: number }> {
    return this._fetch(`/logs/${encodeURIComponent(traceId)}`);
  }

  /** Get analytics dashboard */
  async dashboard(): Promise<any> {
    return this._fetch('/analytics/dashboard');
  }

  /** Query pre-aggregated rollups */
  async rollups(
    query: ForgoRollupQuery
  ): Promise<{ rollups: ForgoRollup[]; count: number }> {
    const params = new URLSearchParams();
    params.set('granularity', query.granularity);
    if (query.metricName) params.set('metricName', query.metricName);
    if (query.since) params.set('since', String(query.since));
    if (query.until) params.set('until', String(query.until));

    return this._fetch(`/analytics/rollups?${params.toString()}`);
  }

  /** List R2 log archives */
  async listArchives(
    limit = 50
  ): Promise<{ archives: ForgoArchiveManifest[]; count: number }> {
    return this._fetch(`/archives?limit=${limit}`);
  }

  /** Search archived logs */
  async searchArchives(
    query: string
  ): Promise<{ results: ForgoLogEntry[]; count: number }> {
    return this._fetch(`/archives/search?q=${encodeURIComponent(query)}`);
  }

  /** Get pipeline health */
  async health(): Promise<any> {
    return this._fetch('/health');
  }

  /** Get org quota usage */
  async quota(): Promise<ForgoQuotaStatus> {
    return this._fetch('/quota');
  }

  /** Ingest a single log entry */
  async ingestLog(
    entry: Omit<ForgoLogEntry, 'id' | 'createdAt' | 'orgId'>
  ): Promise<{ id: string; status: string }> {
    return this._fetch('/logs', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }

  /** Ingest a batch of log entries */
  async ingestBatch(
    entries: Array<Omit<ForgoLogEntry, 'id' | 'createdAt' | 'orgId'>>
  ): Promise<{ accepted: number; ids: string[] }> {
    return this._fetch('/logs/batch', {
      method: 'POST',
      body: JSON.stringify(entries),
    });
  }

  /** Export logs as JSON or CSV */
  async exportLogs(
    query?: Partial<ForgoLogQuery>,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const result = await this.queryLogs(query);
    if (format === 'csv') {
      if (result.logs.length === 0) return '';
      const headers = Object.keys(result.logs[0]);
      const rows = result.logs.map((log) =>
        headers
          .map((h) => {
            const val = (log as any)[h];
            if (val == null) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
          })
          .join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }
    return JSON.stringify(result.logs, null, 2);
  }

  // ─── Private ─────────────────────────────────────────────

  private async _fetch(path: string, init?: RequestInit): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Org-Id': this._orgId,
    };
    if (this._authToken) {
      headers['Authorization'] = `Bearer ${this._authToken}`;
    }

    return this._runtime.fetchJson<any>(`forgo-fetch:${path}`, {
      url: `${this._baseUrl}${path}`,
      init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
    });
  }
}
