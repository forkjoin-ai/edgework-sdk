#!/usr/bin/env bun

import { Command } from '@a0n/cli-kernel';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  runQualityAutopilot,
  formatQualityAutopilotReport,
} from '../src/deploy/quality';
import { resolveEdgeworkApiKey } from '../src/edgework-api-key';

function defaultWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'apps'))) {
    return cwd;
  }

  const monorepoRoot = resolve(cwd, '../..');
  if (existsSync(join(monorepoRoot, 'apps'))) {
    return monorepoRoot;
  }

  return cwd;
}

const program = new Command();

program
  .name('edgework quality')
  .description(
    'Autopilot quality linting for Aeon apps/processes (local routes + optional smoke checks)'
  )
  .option(
    '--source <source>',
    'Target source (workspace|gateway|all)',
    'workspace'
  )
  .option(
    '--workspace <dir>',
    'Workspace root directory',
    defaultWorkspaceRoot()
  )
  .option('--apps-dir <dir>', 'Apps directory relative to workspace', 'apps')
  .option('--targets <csv>', 'Comma-separated target names to include')
  .option('--exclude-targets <csv>', 'Comma-separated target names to exclude')
  .option('--paths <csv>', 'Comma-separated paths to lint instead of defaults')
  .option('--smoke', 'Run remote smoke checks for discovered targets')
  .option('--smoke-paths <csv>', 'Additional comma-separated smoke paths')
  .option('--smoke-timeout <ms>', 'Smoke timeout in ms', '10000')
  .option('--gateway <url>', 'Gateway URL', 'https://api.edgework.ai')
  .option('--owner <did>', 'Owner DID filter when source includes gateway')
  .option(
    '--process-url-map <json>',
    'JSON object mapping process name -> base URL'
  )
  .option('--api-key <key>', 'API key for gateway/smoke requests')
  .option('--json', 'Output machine-readable JSON report')
  .option('--no-strict', 'Do not exit non-zero when issues are found')
  .action(async (opts) => {
    const source = (opts.source || 'workspace') as
      | 'workspace'
      | 'gateway'
      | 'all';
    if (!['workspace', 'gateway', 'all'].includes(source)) {
      console.error(
        `Invalid --source: ${source}. Expected workspace|gateway|all`
      );
      process.exit(1);
    }

    let processUrlByName: Record<string, string> | undefined;
    if (opts.processUrlMap) {
      try {
        const parsed = JSON.parse(String(opts.processUrlMap)) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('process map is not an object');
        }

        processUrlByName = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            ([, value]) => typeof value === 'string'
          )
        ) as Record<string, string>;
      } catch {
        console.error(
          '--process-url-map must be a JSON object, e.g. {"demo":"https://demo.edgework.ai"}'
        );
        process.exit(1);
      }
    }

    const smokeTimeoutMs = Number.parseInt(String(opts.smokeTimeout), 10);

    const report = await runQualityAutopilot({
      source,
      workspaceRoot: opts.workspace,
      appsDir: opts.appsDir,
      targets: opts.targets,
      excludeTargets: opts.excludeTargets,
      paths: opts.paths,
      smoke: Boolean(opts.smoke),
      smokePaths: opts.smokePaths,
      smokeTimeoutMs: Number.isFinite(smokeTimeoutMs) ? smokeTimeoutMs : 10_000,
      processUrlByName,
      gatewayUrl: opts.gateway,
      owner: opts.owner,
      apiKey: opts.apiKey || resolveEdgeworkApiKey(),
      strict: opts.strict,
    });

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatQualityAutopilotReport(report));
    }

    const strict = opts.strict !== false;
    if (strict && !report.ok) {
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(
    `Quality lint failed: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
  );
  process.exit(1);
});
