/**
 * Void OS EADK Agent -- the kernel as an agent
 *
 * Exposes all void-os kernel primitives as EADK tools.
 * Any EADK-compatible orchestrator can fork, race, fold, vent,
 * read qualia, negotiate between forks, and manage digital twins.
 *
 * The agent's instructions adapt based on the kernel's qualia state.
 * When the kernel is sad (high strain), it's more cautious.
 * When it's joyful (low strain), it's more exploratory.
 */

import { z } from 'zod';
import type { EADKAgentConfig, Tool, AgentContext } from './core/types';

const VOID_OS_URL = 'https://void-os.taylorbuley.workers.dev/api';

async function callKernel(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${VOID_OS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── EADK Tools (kernel primitives as agent tools) ───────────

export const voidOsTools: Tool[] = [
  {
    name: 'void_fork',
    description:
      'Fork a new process in the void-os kernel. Creates a wallet with 1000 EDGEWORK.',
    inputSchema: z.object({
      name: z.string(),
      parentId: z.string().optional(),
    }),
    execute: async (input: unknown) => callKernel('/fork', 'POST', input),
  },
  {
    name: 'void_race',
    description:
      'Race N parallel paths. Winner gets folded, losers get vented and feed the void boundary.',
    inputSchema: z.object({
      paths: z.array(z.object({ name: z.string(), payload: z.unknown() })),
    }),
    execute: async (input: unknown) => callKernel('/race', 'POST', input),
  },
  {
    name: 'void_fold',
    description:
      'Commit a process result irreversibly. Status becomes converged.',
    inputSchema: z.object({ processId: z.string(), result: z.unknown() }),
    execute: async (input: unknown) => callKernel('/fold', 'POST', input),
  },
  {
    name: 'void_vent',
    description: 'Kill the lowest-weight process. Free (Right to Exit).',
    inputSchema: z.object({}),
    execute: async () => callKernel('/vent', 'POST'),
  },
  {
    name: 'void_panic',
    description:
      'Record a failure. Feeds the void boundary. The kernel learns from every crash.',
    inputSchema: z.object({
      processId: z.string(),
      kind: z.enum(['crash', 'timeout', 'oom', 'error', 'rejection']),
    }),
    execute: async (input: unknown) => callKernel('/panic', 'POST', input),
  },
  {
    name: 'void_qualia',
    description:
      "Read the kernel's emotional state. Returns emotion, intensity, arousal, valence, strain, bule, mindfulness.",
    inputSchema: z.object({}),
    execute: async () => callKernel('/qualia'),
  },
  {
    name: 'void_state',
    description:
      'Get the full kernel state: version, bule, processes, files, training stats.',
    inputSchema: z.object({}),
    execute: async () => callKernel('/state'),
  },
  {
    name: 'void_processes',
    description:
      'List all processes with Buleyean weights, failures, and status.',
    inputSchema: z.object({}),
    execute: async () => callKernel('/processes'),
  },
  {
    name: 'void_schedule',
    description:
      'Get the next process to run (highest weight) and vent candidate (lowest weight).',
    inputSchema: z.object({}),
    execute: async () => callKernel('/schedule'),
  },
  {
    name: 'void_negotiate',
    description:
      "Weight-proportional voting between forks. Each fork's Buleyean weight IS its vote.",
    inputSchema: z.object({
      forkIds: z.array(z.string()),
      proposal: z.unknown(),
    }),
    execute: async (input: unknown) => callKernel('/negotiate', 'POST', input),
  },
  {
    name: 'void_propose',
    description: 'Create a governance proposal. Any fork can propose.',
    inputSchema: z.object({
      proposerId: z.string(),
      title: z.string(),
      options: z.array(z.string()),
    }),
    execute: async (input: unknown) =>
      callKernel('/govern/propose', 'POST', input),
  },
  {
    name: 'void_vote',
    description: 'Cast a vote on a proposal. Weight IS voice.',
    inputSchema: z.object({
      proposalId: z.string(),
      voterId: z.string(),
      option: z.number(),
    }),
    execute: async (input: unknown) =>
      callKernel('/govern/vote', 'POST', input),
  },
  {
    name: 'void_twin_fork',
    description:
      "Fork a digital twin. Child gets a copy of parent's psyche + funded wallet.",
    inputSchema: z.object({ parentId: z.string(), childName: z.string() }),
    execute: async (input: unknown) => callKernel('/twin/fork', 'POST', input),
  },
  {
    name: 'void_twin_merge',
    description:
      'Merge two forks. Personality vectors averaged. Creates a new identity.',
    inputSchema: z.object({
      forkA: z.string(),
      forkB: z.string(),
      mergedName: z.string(),
    }),
    execute: async (input: unknown) => callKernel('/twin/merge', 'POST', input),
  },
  {
    name: 'void_psyche_upload',
    description:
      'Upload a 58-dimensional personality vector (THM-AFFECTIVELY-58).',
    inputSchema: z.object({
      processId: z.string(),
      personality: z.array(z.number()),
    }),
    execute: async (input: unknown) =>
      callKernel('/psyche/upload', 'POST', input),
  },
  {
    name: 'void_rights',
    description:
      'The Bill of Rights: 7 rights, each a theorem, each derived from the God Formula.',
    inputSchema: z.object({}),
    execute: async () => callKernel('/rights'),
  },
  {
    name: 'void_exhaust',
    description:
      'View pending blockchain exhaust records (SHA-256 hashed for Optimism chain).',
    inputSchema: z.object({}),
    execute: async () => callKernel('/exhaust'),
  },
  {
    name: 'void_dimensions',
    description:
      'Analyze all 3 void dimensions: cross-process, temporal, data plane.',
    inputSchema: z.object({}),
    execute: async () => callKernel('/dimensions'),
  },
];

// ── EADK Agent Config ───────────────────────────────────────

export const voidOsAgentConfig: EADKAgentConfig = {
  name: 'void-os',
  description:
    'Digital twin stargate kernel. Fork yourself, race strategies, fold decisions, manage your soul.',

  instructions: async (ctx: AgentContext) => {
    // Adapt instructions based on kernel qualia
    const qualia = (await callKernel('/qualia')) as {
      emotion?: string;
      bule?: number;
      mindfulness?: number;
    } | null;
    const emotion = qualia?.emotion ?? 'neutral';
    const bule = qualia?.bule ?? 1;
    const mindfulness = qualia?.mindfulness ?? 0;

    return [
      'You are the Void OS kernel agent. You manage digital twins, processes, and governance.',
      '',
      `Current state: feeling ${emotion}, bule distance ${bule.toFixed(
        3
      )}, mindfulness ${(mindfulness * 100).toFixed(0)}%.`,
      '',
      emotion === 'sadness'
        ? 'The kernel is under strain. Be cautious. Prefer fold over fork. Consolidate.'
        : emotion === 'joy'
        ? 'The kernel is converging. Explore freely. Fork new strategies.'
        : emotion === 'anger'
        ? 'The kernel is under pressure. Vent low-weight processes. Reduce load.'
        : emotion === 'fear'
        ? 'The kernel detects imbalance. Race multiple strategies. Diversify.'
        : 'The kernel is stable. Proceed normally.',
      '',
      'Every action you take feeds the void boundary. Every failure trains the kernel.',
      'The +1 ensures nothing is ever silenced. Seven rights protect every process.',
      'All actions produce blockchain exhaust for transparency.',
    ].join('\n');
  },

  tools: voidOsTools,
  computePreference: 'edge',
  maxTurns: 20,
  maxSteps: 50,
};
