/**
 * Aeon Deploy CLI — Command wrappers for the deploy module
 *
 * Canonical flow:
 *   edgework deploy scaffold aeon-foundation <dir>
 *   edgework deploy clone <source> <dir>
 *   edgework lift ... (alias for deploy)
 *   edgework shift <source> <dir> (alias for deploy clone)
 */

import { Command } from '@a0n/cli-kernel';
import {
  cloneDeploymentToDirectory,
  deploy,
  fetchAppByCid,
  formatQualityAutopilotReport,
  getStatus,
  list,
  logs,
  metrics,
  migrate,
  registerAeonPid,
  runQualityAutopilot,
  scaffoldAeonFoundation,
  scaffoldMcpServer,
  seed,
  seedContainerRepo,
  smokeTestSite,
  snapshotContainerWorkspace,
  start,
  stop,
} from './index';
import { resolveEdgeworkApiKey } from '../edgework-api-key';

export interface RegisterDeployCommandsOptions {
  includeLegacyTopLevelCommands?: boolean;
  includeAliasCommands?: boolean;
}

function resolveGateway(): string {
  return process.env.EDGEWORK_GATEWAY_URL || 'https://api.edgework.ai';
}

function resolveApiKey(): string | undefined {
  return resolveEdgeworkApiKey();
}

function resolveUcanToken(explicitToken?: string): string | undefined {
  return explicitToken || process.env.EDGEWORK_UCAN || process.env.UCAN_TOKEN;
}

function resolveOwnerDid(): string {
  return process.env.EDGEWORK_OWNER_DID || 'did:key:anonymous';
}

function parseRegisterEnv(raw?: string): 'dev' | 'staging' | 'production' {
  if (!raw || raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'dev' || raw === 'development') return 'dev';
  if (raw === 'staging' || raw === 'stage') return 'staging';
  throw new Error(
    `Invalid environment "${raw}". Expected dev, staging, or production`
  );
}

function normalizeCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function runDirectDeploy(
  dir: string | undefined,
  opts: {
    name?: string;
    cname?: string;
    gateway: string;
    owner: string;
    skipBuild?: boolean;
    smoketest?: boolean;
    smoketestTimeout?: string;
    apiKey?: string;
  }
): Promise<void> {
  const appDir = dir || '.';
  if (!opts.name) {
    throw new Error('Missing required option --name <name> for direct deploy');
  }

  console.log(`Deploying ${appDir} as ${opts.name}...`);

  const result = await deploy({
    appDir,
    name: opts.name,
    gatewayUrl: opts.gateway,
    ownerDid: opts.owner,
    cname: opts.cname,
    apiKey: opts.apiKey || resolveApiKey(),
    build: { skipBuild: opts.skipBuild },
  });

  console.log('Deployed successfully!');
  console.log(`  CID:      ${result.cid}`);
  console.log(`  URL:      ${result.url}`);
  console.log(`  R2:       ${result.r2Key}`);
  console.log(
    `  Install:  aeon://shell?action=command&cmd=shell.install_remote&args=${encodeURIComponent(
      JSON.stringify({ url: result.url + '/aeon-remote.json' })
    )}`
  );
  if (result.updated) {
    console.log('  (Updated existing deployment)');
  }

  if (opts.smoketest !== false) {
    const timeoutMs = Number.parseInt(String(opts.smoketestTimeout), 10);
    console.log(
      `Running smoke test: ${result.name}.edgework.ai (timeout ${timeoutMs}ms)...`
    );
    const smoke = await smokeTestSite(result.name, {
      apiKey: opts.apiKey || resolveApiKey(),
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 10_000,
    });
    if (!smoke.ok) {
      const details = smoke.details ? ` (${smoke.details})` : '';
      throw new Error(`Smoke test failed: ${smoke.status}${details}`);
    }
    console.log(`Smoke test passed: ${smoke.status}`);
  }
}

function configureQualityCommand(command: Command): void {
  command
    .description(
      'Autopilot quality lint for Aeon apps/processes (routes, well-known files, optional smoke checks)'
    )
    .option(
      '--source <source>',
      'Target source (workspace|gateway|all)',
      'workspace'
    )
    .option('--workspace <dir>', 'Workspace root directory', process.cwd())
    .option('--apps-dir <dir>', 'Apps directory relative to workspace', 'apps')
    .option(
      '--targets <csv>',
      'Comma-separated target names to include (default: all discovered)'
    )
    .option(
      '--exclude-targets <csv>',
      'Comma-separated target names to exclude'
    )
    .option(
      '--paths <csv>',
      'Comma-separated paths to lint instead of defaults'
    )
    .option(
      '--smoke-paths <csv>',
      'Additional comma-separated paths to smoke test'
    )
    .option('--smoke', 'Run remote smoke checks for discovered targets')
    .option('--smoke-timeout <ms>', 'Smoke timeout in ms', '10000')
    .option(
      '--process-url-map <json>',
      'JSON object mapping process name -> base URL'
    )
    .option('--owner <did>', 'Owner DID filter when source includes gateway')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .option('--json', 'Output machine-readable JSON report')
    .option('--no-strict', 'Do not exit non-zero when issues are found')
    .action(async (opts) => {
      try {
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
            if (
              parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed)
            ) {
              processUrlByName = Object.fromEntries(
                Object.entries(parsed as Record<string, unknown>).filter(
                  ([, value]) => typeof value === 'string'
                )
              ) as Record<string, string>;
            } else {
              throw new Error('not an object');
            }
          } catch {
            console.error(
              '--process-url-map must be a JSON object, e.g. {"demo":"https://demo.edgework.ai"}'
            );
            process.exit(1);
          }
        }

        const timeoutMs = Number.parseInt(String(opts.smokeTimeout), 10);

        const report = await runQualityAutopilot({
          source,
          workspaceRoot: opts.workspace,
          appsDir: opts.appsDir,
          targets: opts.targets,
          excludeTargets: opts.excludeTargets,
          paths: opts.paths,
          smokePaths: opts.smokePaths,
          smoke: Boolean(opts.smoke),
          smokeTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 10_000,
          processUrlByName,
          owner: opts.owner,
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
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
      } catch (err) {
        console.error(
          `Quality lint failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });
}

function registerLegacyTopLevelCommands(program: Command): void {
  program
    .command('smoketest <process>')
    .description(
      'Smoke test a process host and fail on workers.dev redirect stubs'
    )
    .option('--process-url <url>', 'Explicit process URL override')
    .option('--timeout <ms>', 'Request timeout in ms', '10000')
    .option('--api-key <key>', 'API key')
    .action(async (processName: string, opts) => {
      try {
        const timeoutMs = Number.parseInt(String(opts.timeout), 10);
        const result = await smokeTestSite(processName, {
          processUrl: opts.processUrl,
          apiKey: opts.apiKey || resolveApiKey(),
          timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 10_000,
        });

        if (!result.ok) {
          const details = result.details ? ` (${result.details})` : '';
          console.error(`Smoke test failed: ${result.status}${details}`);
          process.exit(1);
        }

        console.log(`Smoke test passed: ${result.url} (${result.status})`);
      } catch (err) {
        console.error(
          `Smoke test failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  configureQualityCommand(program.command('quality'));

  program
    .command('status <cid>')
    .description('Get process status')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      try {
        const status = await getStatus(cid, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
        });

        console.log(`Process: ${status.name}`);
        console.log(`  CID:      ${status.cid}`);
        console.log(`  State:    ${status.state}`);
        console.log(`  Tier:     ${status.tier}`);
        console.log(`  URL:      ${status.url}`);
        console.log(`  Requests: ${status.requestCount}`);
        console.log(`  Tokens:   ${status.tokensSpent}`);
        console.log(`  Created:  ${status.createdAt}`);
        console.log(`  Updated:  ${status.updatedAt}`);
      } catch (err) {
        console.error(
          `Status failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  program
    .command('stop <cid>')
    .description('Hibernate a running process')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      try {
        const result = await stop(cid, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
        });
        console.log(`Process ${result.cid} → ${result.state}`);
      } catch (err) {
        console.error(
          `Stop failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  program
    .command('start <cid>')
    .description('Wake a hibernated process')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      try {
        const result = await start(cid, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
        });
        console.log(`Process ${result.cid} → ${result.state}`);
      } catch (err) {
        console.error(
          `Start failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  program
    .command('migrate <cid>')
    .description('Migrate process to a different execution tier')
    .requiredOption('--to <tier>', 'Target tier (browser|peer|edge)')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      const validTiers = ['browser', 'peer', 'edge'] as const;
      if (!validTiers.includes(opts.to)) {
        console.error(
          `Invalid tier: ${opts.to}. Must be one of: ${validTiers.join(', ')}`
        );
        process.exit(1);
      }

      try {
        const result = await migrate(cid, opts.to, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
        });
        console.log(
          `Process ${result.cid} migrating to ${result.tier} (state: ${result.state})`
        );
      } catch (err) {
        console.error(
          `Migrate failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  program
    .command('logs <cid>')
    .description('View process logs')
    .option('--limit <n>', 'Number of log entries', '50')
    .option('--level <level>', 'Filter by level (info|warn|error|debug)')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      try {
        const result = await logs(cid, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
          limit: parseInt(opts.limit, 10),
          level: opts.level,
        });

        if (result.logs.length === 0) {
          console.log('No logs found.');
          return;
        }

        for (const log of result.logs) {
          const levelTag = `[${log.level.toUpperCase()}]`.padEnd(7);
          console.log(`${log.createdAt} ${levelTag} ${log.message}`);
        }
        console.log(`\n(${result.count} entries)`);
      } catch (err) {
        console.error(
          `Logs failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  program
    .command('metrics <cid>')
    .description('View process metrics')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      try {
        const result = await metrics(cid, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
        });

        console.log(`Metrics for ${result.cid}:`);
        console.log(`  State:          ${result.state}`);
        console.log(`  Tier:           ${result.tier}`);
        console.log(`  Requests:       ${result.requestCount}`);
        console.log(`  Tokens Spent:   ${result.tokensSpent}`);
        console.log(
          `  Uptime:         ${(result.uptimeMs / 3600000).toFixed(1)}h`
        );
        console.log(`  Req/min:        ${result.requestsPerMinute}`);
      } catch (err) {
        console.error(
          `Metrics failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  program
    .command('list')
    .description('List all deployments')
    .option('--owner <did>', 'Filter by owner DID')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (opts) => {
      try {
        const result = await list({
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
          owner: opts.owner,
        });

        if (result.processes.length === 0) {
          console.log('No deployments found.');
          return;
        }

        console.log(
          `${'NAME'.padEnd(25)} ${'STATE'.padEnd(12)} ${'TIER'.padEnd(
            8
          )} ${'REQUESTS'.padEnd(10)} CID`
        );
        console.log('-'.repeat(90));
        for (const processItem of result.processes) {
          console.log(
            `${processItem.name.padEnd(25)} ${processItem.state.padEnd(
              12
            )} ${processItem.tier.padEnd(8)} ${String(
              processItem.requestCount
            ).padEnd(10)} ${processItem.cid.slice(0, 16)}...`
          );
        }
        console.log(`\n${result.count} deployment(s)`);
      } catch (err) {
        console.error(
          `List failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  program
    .command('app <cid>')
    .description('Fetch app content through AeonPID/CID proxy')
    .option('--path <path>', 'App path to fetch', '/')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (cid: string, opts) => {
      try {
        const response = await fetchAppByCid(cid, {
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
          path: opts.path,
        });
        const body = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Content-Type: ${response.headers.get('content-type')}`);
        console.log('');
        console.log(body.slice(0, 2000));
      } catch (err) {
        console.error(
          `App fetch failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  program
    .command('seed <name>')
    .description('Seed D1/KV data for a deployed process')
    .requiredOption('--from <dir>', 'Directory containing seed files')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key')
    .action(async (name: string, opts) => {
      try {
        await seed({
          name,
          fromDir: opts.from,
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey || resolveApiKey(),
        });
        console.log(`Seeded data for ${name} from ${opts.from}`);
      } catch (err) {
        console.error(
          `Seed failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  program
    .command('container-seed <containerId>')
    .description('Seed repo content into aeon-container D1 index')
    .option(
      '--source <type>',
      'local-import|github-public|github-private',
      'local-import'
    )
    .option(
      '--from <dir>',
      'Local directory to ingest when source=local-import'
    )
    .option(
      '--repo-url <url>',
      'GitHub repository URL for github source ingest'
    )
    .option('--repo-ref <ref>', 'Repository ref/branch/tag', 'HEAD')
    .option('--endpoint <url>', 'Container API base URL', resolveGateway())
    .option('--ucan <token>', 'UCAN bearer token')
    .option('--api-key <key>', 'API key')
    .action(async (containerId: string, opts) => {
      try {
        const sourceType = String(opts.source || 'local-import') as
          | 'local-import'
          | 'github-public'
          | 'github-private';
        if (
          sourceType !== 'local-import' &&
          sourceType !== 'github-public' &&
          sourceType !== 'github-private'
        ) {
          throw new Error(
            `Invalid source type: ${sourceType}. Expected local-import|github-public|github-private`
          );
        }
        if (sourceType === 'local-import' && !opts.from) {
          throw new Error('--from <dir> is required when source=local-import');
        }
        if (sourceType !== 'local-import' && !opts.repoUrl) {
          throw new Error(
            '--repo-url <url> is required for github source ingest'
          );
        }

        const result = await seedContainerRepo({
          containerId,
          endpointBaseUrl: opts.endpoint,
          sourceType,
          fromDir: opts.from,
          repoUrl: opts.repoUrl,
          repoRef: opts.repoRef,
          ucanToken: resolveUcanToken(opts.ucan),
          apiKey: opts.apiKey || resolveApiKey(),
        });

        console.log(`Container seed complete for ${containerId}`);
        console.log(`  repo: ${result.repo_id}`);
        console.log(`  source: ${result.source_type}`);
        console.log(`  indexed: ${result.indexed_files}/${result.total_files}`);
        console.log(`  symbols: ${result.symbols}`);
      } catch (err) {
        console.error(
          `Container seed failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  program
    .command('container-snapshot <containerId>')
    .description('Create a workspace snapshot in aeon-container D1 metadata')
    .option('--endpoint <url>', 'Container API base URL', resolveGateway())
    .option('--ucan <token>', 'UCAN bearer token')
    .option('--api-key <key>', 'API key')
    .action(async (containerId: string, opts) => {
      try {
        const snapshot = await snapshotContainerWorkspace({
          containerId,
          endpointBaseUrl: opts.endpoint,
          ucanToken: resolveUcanToken(opts.ucan),
          apiKey: opts.apiKey || resolveApiKey(),
        });

        console.log(`Snapshot created for ${containerId}`);
        console.log(`  id: ${snapshot.snapshot_id}`);
        console.log(`  files: ${snapshot.files_count}`);
        console.log(`  manifest: ${snapshot.manifest_hash}`);
      } catch (err) {
        console.error(
          `Container snapshot failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });
}

export function registerDeployCommands(
  program: Command,
  options: RegisterDeployCommandsOptions = {}
): void {
  const includeLegacyTopLevelCommands =
    options.includeLegacyTopLevelCommands ?? true;
  const includeAliasCommands = options.includeAliasCommands ?? true;

  const deployCommand = program
    .command('deploy')
    .description('Package, scaffold, clone, and deploy Aeon apps')
    .argument('[dir]', 'App directory for direct deploy')
    .option('--name <name>', 'Process name (DNS-safe)')
    .option('--cname <domain>', 'Register custom domain')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--owner <did>', 'Owner DID', resolveOwnerDid())
    .option('--skip-build', 'Skip the build step')
    .option('--no-smoketest', 'Skip site smoke test after deployment')
    .option('--smoketest-timeout <ms>', 'Smoke test timeout (ms)', '10000')
    .option('--api-key <key>', 'API key for authentication')
    .action(async (dir: string | undefined, opts) => {
      try {
        await runDirectDeploy(dir, opts);
      } catch (err) {
        console.error(
          `Deploy failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  deployCommand
    .command('scaffold <template> <targetDir>')
    .description('Scaffold a production-ready demo app')
    .option('--preset <preset>', 'Preset (all|core|minimal)', 'all')
    .option('--config <path>', 'Path to aeon.toml overrides')
    .option('--enable <csv>', 'Enable feature toggles (comma-separated)')
    .option('--disable <csv>', 'Disable feature toggles (comma-separated)')
    .option('--install', 'Install dependencies after scaffolding')
    .option('--serve', 'Run local serve smoke check after scaffolding')
    .option('--deploy', 'Deploy immediately after scaffolding')
    .option('--name <name>', 'Process name for immediate deploy')
    .option('--cname <domain>', 'Register custom domain after deploy')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--owner <did>', 'Owner DID', resolveOwnerDid())
    .option('--skip-build', 'Skip build when immediate deploy is enabled')
    .option(
      '--no-smoketest',
      'Skip smoke test when immediate deploy is enabled'
    )
    .option(
      '--smoketest-timeout <ms>',
      'Smoke timeout for immediate deploy',
      '10000'
    )
    .option('--api-key <key>', 'API key for auth')
    .option('--no-quality', 'Skip strict scaffold quality baseline checks')
    .action(async (template: string, targetDir: string, opts) => {
      if (template !== 'aeon-foundation' && template !== 'mcp-server') {
        console.error(
          `Unsupported scaffold template: ${template}. Supported templates: aeon-foundation, mcp-server.`
        );
        process.exit(1);
      }

      try {
        let scaffold;
        if (template === 'mcp-server') {
          scaffold = await scaffoldMcpServer({
            targetDir,
            preset: opts.preset,
            configPath: opts.config,
            enable: normalizeCsv(opts.enable),
            disable: normalizeCsv(opts.disable),
            install: Boolean(opts.install),
            serve: Boolean(opts.serve),
            quality: opts.quality,
          });
        } else {
          scaffold = await scaffoldAeonFoundation({
            targetDir,
            preset: opts.preset,
            configPath: opts.config,
            enable: normalizeCsv(opts.enable),
            disable: normalizeCsv(opts.disable),
            install: Boolean(opts.install),
            serve: Boolean(opts.serve),
            quality: opts.quality,
          });
        }

        console.log(`Scaffold complete: ${scaffold.targetDir}`);
        console.log(`  preset: ${scaffold.config.preset}`);
        console.log(`  files: ${scaffold.filesWritten.length}`);
        console.log(`  install: ${scaffold.installed ? 'ok' : 'skipped'}`);
        console.log(`  serve: ${scaffold.served ? 'ok' : 'skipped'}`);

        if (opts.deploy) {
          await runDirectDeploy(targetDir, {
            name: opts.name || scaffold.config.project.name,
            cname: opts.cname,
            gateway: opts.gateway,
            owner: opts.owner,
            skipBuild: opts.skipBuild,
            smoketest: opts.smoketest,
            smoketestTimeout: opts.smoketestTimeout,
            apiKey: opts.apiKey,
          });
        }
      } catch (err) {
        console.error(
          `Scaffold failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  deployCommand
    .command('clone <source> <targetDir>')
    .description('Lift-and-shift a deployed site into a local project')
    .option('--mode <mode>', 'Clone mode (full)', 'full')
    .option('--install', 'Install dependencies after clone')
    .option('--serve', 'Run local serve smoke check after clone')
    .option('--env-template-only', 'Only write env template and clone manifest')
    .option('--gateway <url>', 'Gateway URL', resolveGateway())
    .option('--api-key <key>', 'API key for auth')
    .action(async (source: string, targetDir: string, opts) => {
      try {
        const result = await cloneDeploymentToDirectory({
          source,
          targetDir,
          mode: opts.mode,
          install: Boolean(opts.install),
          serve: Boolean(opts.serve),
          envTemplateOnly: Boolean(opts.envTemplateOnly),
          gatewayUrl: opts.gateway,
          apiKey: opts.apiKey,
        });

        console.log(`Clone complete: ${result.targetDir}`);
        console.log(`  source: ${result.source.input}`);
        console.log(`  resolved-kind: ${result.source.kind}`);
        if (result.source.processName) {
          console.log(`  process: ${result.source.processName}`);
        }
        if (result.source.cid) {
          console.log(`  cid: ${result.source.cid}`);
        }
        console.log(`  downloaded-paths: ${result.downloadedPaths.length}`);
        console.log(`  install: ${result.installed ? 'ok' : 'skipped'}`);
        console.log(`  serve: ${result.served ? 'ok' : 'skipped'}`);
      } catch (err) {
        console.error(
          `Clone failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
        process.exit(1);
      }
    });

  deployCommand
    .command('register <app-name> [env]')
    .description('Register an app with the Edgework deploy gateway (AeonPID)')
    .option('--gateway <url>', 'Gateway URL', 'https://api.edgework.ai')
    .option(
      '--owner-did <did>',
      'Owner DID',
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    )
    .option('--api-key <key>', 'API key (falls back to EDGEWORK_API_KEY env)')
    .option('--dry-run', 'Preview without registering')
    .option(
      '--app-dir <dir>',
      'App directory (default: apps/<app-name> relative to cwd)'
    )
    .action(
      async (
        appName: string,
        env: string | undefined,
        opts: {
          gateway: string;
          ownerDid: string;
          apiKey?: string;
          dryRun?: boolean;
          appDir?: string;
        }
      ) => {
        try {
          const resolvedEnv = parseRegisterEnv(env);
          const result = await registerAeonPid({
            appName,
            env: resolvedEnv,
            gatewayUrl: opts.gateway,
            ownerDid: opts.ownerDid,
            apiKey: opts.apiKey || resolveApiKey(),
            appDir: opts.appDir,
            dryRun: Boolean(opts.dryRun),
          });

          console.log(`\nRegistration result:`);
          console.log(`  CID:          ${result.cid}`);
          console.log(`  Process:      ${result.processName}`);
          console.log(`  Site Host:    ${result.siteHost}`);
          console.log(`  State:        ${result.state}`);
        } catch (err) {
          console.error(
            `Register failed: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
          process.exit(1);
        }
      }
    );

  const deployQualityCommand = deployCommand
    .command('quality')
    .description('Quality autopilot under deploy namespace');
  configureQualityCommand(deployQualityCommand);

  if (includeAliasCommands) {
    deployCommand.alias('lift');

    program
      .command('shift <source> <targetDir>')
      .description('Alias for edgework deploy clone <source> <targetDir>')
      .option('--mode <mode>', 'Clone mode (full)', 'full')
      .option('--install', 'Install dependencies after clone')
      .option('--serve', 'Run local serve smoke check after clone')
      .option(
        '--env-template-only',
        'Only write env template and clone manifest'
      )
      .option('--gateway <url>', 'Gateway URL', resolveGateway())
      .option('--api-key <key>', 'API key for auth')
      .action(async (source: string, targetDir: string, opts) => {
        try {
          const result = await cloneDeploymentToDirectory({
            source,
            targetDir,
            mode: opts.mode,
            install: Boolean(opts.install),
            serve: Boolean(opts.serve),
            envTemplateOnly: Boolean(opts.envTemplateOnly),
            gatewayUrl: opts.gateway,
            apiKey: opts.apiKey,
          });

          console.log(`Shift complete: ${result.targetDir}`);
          console.log(`  source: ${result.source.input}`);
          console.log(`  downloaded-paths: ${result.downloadedPaths.length}`);
        } catch (err) {
          console.error(
            `Shift failed: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
          process.exit(1);
        }
      });
  }

  if (includeLegacyTopLevelCommands) {
    registerLegacyTopLevelCommands(program);
  }
}
