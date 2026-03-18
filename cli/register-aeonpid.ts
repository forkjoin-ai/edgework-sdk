#!/usr/bin/env bun
/**
 * Standalone AeonPID registration script.
 *
 * Usage:
 *   bun cli/register-aeonpid.ts <app-name> [dev|staging|production] [--dry-run]
 *
 * Examples:
 *   bun cli/register-aeonpid.ts them-yoga production
 *   bun cli/register-aeonpid.ts fractal-todo staging --dry-run
 *   bun cli/register-aeonpid.ts aeon-foundation
 */

import { registerAeonPid } from '../src/deploy/index';

type DeployEnvironment = 'dev' | 'staging' | 'production';

function parseArgs(argv: string[]): {
  appName: string;
  env: DeployEnvironment;
  dryRun: boolean;
} {
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  if (positional.length === 0) {
    throw new Error(
      'Missing app name. Usage: bun cli/register-aeonpid.ts <app-name> [env] [--dry-run]'
    );
  }

  const appName = positional[0];
  const rawEnv = positional[1];

  let env: DeployEnvironment = 'production';
  if (rawEnv) {
    if (rawEnv === 'production' || rawEnv === 'prod') {
      env = 'production';
    } else if (rawEnv === 'dev' || rawEnv === 'development') {
      env = 'dev';
    } else if (rawEnv === 'staging' || rawEnv === 'stage') {
      env = 'staging';
    } else {
      throw new Error(
        `Invalid environment "${rawEnv}". Expected dev, staging, or production`
      );
    }
  }

  return { appName, env, dryRun: argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { appName, env, dryRun } = parseArgs(rawArgs);

  const result = await registerAeonPid({
    appName,
    env,
    dryRun,
  });

  console.log(`\nDone.`);
  console.log(`  CID:       ${result.cid}`);
  console.log(`  Process:   ${result.processName}`);
  console.log(`  Site Host: ${result.siteHost}`);
  console.log(`  State:     ${result.state}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AeonPID registration failed: ${message}`);
  process.exit(1);
});
