#!/usr/bin/env bun
/**
 * Edgework Agent - Setup Command
 */

import { runSetupWizard, completeSetup } from '../src/agent/setup.js';

const nonInteractive = process.argv.includes('--non-interactive');

async function main() {
  try {
    const answers = await runSetupWizard(nonInteractive);
    await completeSetup(answers);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

main();
