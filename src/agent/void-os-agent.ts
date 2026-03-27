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

import type { EADKAgentConfig, Tool, AgentContext } from './core/types';

const VOID_OS_URL = 'https://void-os.taylorbuley.workers.dev/api';

async function callKernel(path: string, method = 'GET', body?: unknown): Promise<unknown> {
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
    description: 'Fork a new process in the void-os kernel. Creates a wallet with 1000 EDGEWORK.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Process name' }, parentId: { type: 'string', description: 'Parent process ID (optional)' } }, required: ['name'] },
    execute: async (params: Record<string, unknown>) => callKernel('/fork', 'POST', params),
  },
  {
    name: 'void_race',
    description: 'Race N parallel paths. Winner gets folded, losers get vented and feed the void boundary.',
    parameters: { type: 'object', properties: { paths: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, payload: {} } } } }, required: ['paths'] },
    execute: async (params: Record<string, unknown>) => callKernel('/race', 'POST', params),
  },
  {
    name: 'void_fold',
    description: 'Commit a process result irreversibly. Status becomes converged.',
    parameters: { type: 'object', properties: { processId: { type: 'string' }, result: {} }, required: ['processId'] },
    execute: async (params: Record<string, unknown>) => callKernel('/fold', 'POST', params),
  },
  {
    name: 'void_vent',
    description: 'Kill the lowest-weight process. Free (Right to Exit).',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/vent', 'POST'),
  },
  {
    name: 'void_panic',
    description: 'Record a failure. Feeds the void boundary. The kernel learns from every crash.',
    parameters: { type: 'object', properties: { processId: { type: 'string' }, kind: { type: 'string', enum: ['crash', 'timeout', 'oom', 'error', 'rejection'] } }, required: ['processId', 'kind'] },
    execute: async (params: Record<string, unknown>) => callKernel('/panic', 'POST', params),
  },
  {
    name: 'void_qualia',
    description: 'Read the kernel\'s emotional state. Returns emotion, intensity, arousal, valence, strain, bule, mindfulness.',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/qualia'),
  },
  {
    name: 'void_state',
    description: 'Get the full kernel state: version, bule, processes, files, training stats.',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/state'),
  },
  {
    name: 'void_processes',
    description: 'List all processes with Buleyean weights, failures, and status.',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/processes'),
  },
  {
    name: 'void_schedule',
    description: 'Get the next process to run (highest weight) and vent candidate (lowest weight).',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/schedule'),
  },
  {
    name: 'void_negotiate',
    description: 'Weight-proportional voting between forks. Each fork\'s Buleyean weight IS its vote.',
    parameters: { type: 'object', properties: { forkIds: { type: 'array', items: { type: 'string' } }, proposal: {} }, required: ['forkIds', 'proposal'] },
    execute: async (params: Record<string, unknown>) => callKernel('/negotiate', 'POST', params),
  },
  {
    name: 'void_propose',
    description: 'Create a governance proposal. Any fork can propose.',
    parameters: { type: 'object', properties: { proposerId: { type: 'string' }, title: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['proposerId', 'title', 'options'] },
    execute: async (params: Record<string, unknown>) => callKernel('/govern/propose', 'POST', params),
  },
  {
    name: 'void_vote',
    description: 'Cast a vote on a proposal. Weight IS voice.',
    parameters: { type: 'object', properties: { proposalId: { type: 'string' }, voterId: { type: 'string' }, option: { type: 'number' } }, required: ['proposalId', 'voterId', 'option'] },
    execute: async (params: Record<string, unknown>) => callKernel('/govern/vote', 'POST', params),
  },
  {
    name: 'void_twin_fork',
    description: 'Fork a digital twin. Child gets a copy of parent\'s psyche + funded wallet.',
    parameters: { type: 'object', properties: { parentId: { type: 'string' }, childName: { type: 'string' } }, required: ['parentId', 'childName'] },
    execute: async (params: Record<string, unknown>) => callKernel('/twin/fork', 'POST', params),
  },
  {
    name: 'void_twin_merge',
    description: 'Merge two forks. Personality vectors averaged. Creates a new identity.',
    parameters: { type: 'object', properties: { forkA: { type: 'string' }, forkB: { type: 'string' }, mergedName: { type: 'string' } }, required: ['forkA', 'forkB', 'mergedName'] },
    execute: async (params: Record<string, unknown>) => callKernel('/twin/merge', 'POST', params),
  },
  {
    name: 'void_psyche_upload',
    description: 'Upload a 58-dimensional personality vector (THM-AFFECTIVELY-58).',
    parameters: { type: 'object', properties: { processId: { type: 'string' }, personality: { type: 'array', items: { type: 'number' } } }, required: ['processId', 'personality'] },
    execute: async (params: Record<string, unknown>) => callKernel('/psyche/upload', 'POST', params),
  },
  {
    name: 'void_rights',
    description: 'The Bill of Rights: 7 rights, each a theorem, each derived from the God Formula.',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/rights'),
  },
  {
    name: 'void_exhaust',
    description: 'View pending blockchain exhaust records (SHA-256 hashed for Optimism chain).',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/exhaust'),
  },
  {
    name: 'void_dimensions',
    description: 'Analyze all 3 void dimensions: cross-process, temporal, data plane.',
    parameters: { type: 'object', properties: {} },
    execute: async () => callKernel('/dimensions'),
  },
];

// ── EADK Agent Config ───────────────────────────────────────

export const voidOsAgentConfig: EADKAgentConfig = {
  name: 'void-os',
  description: 'Digital twin stargate kernel. Fork yourself, race strategies, fold decisions, manage your soul.',

  instructions: async (ctx: AgentContext) => {
    // Adapt instructions based on kernel qualia
    const qualia = await callKernel('/qualia') as { emotion?: string; bule?: number; mindfulness?: number } | null;
    const emotion = qualia?.emotion ?? 'neutral';
    const bule = qualia?.bule ?? 1;
    const mindfulness = qualia?.mindfulness ?? 0;

    return [
      'You are the Void OS kernel agent. You manage digital twins, processes, and governance.',
      '',
      `Current state: feeling ${emotion}, bule distance ${bule.toFixed(3)}, mindfulness ${(mindfulness * 100).toFixed(0)}%.`,
      '',
      emotion === 'sadness' ? 'The kernel is under strain. Be cautious. Prefer fold over fork. Consolidate.' :
      emotion === 'joy' ? 'The kernel is converging. Explore freely. Fork new strategies.' :
      emotion === 'anger' ? 'The kernel is under pressure. Vent low-weight processes. Reduce load.' :
      emotion === 'fear' ? 'The kernel detects imbalance. Race multiple strategies. Diversify.' :
      'The kernel is stable. Proceed normally.',
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
