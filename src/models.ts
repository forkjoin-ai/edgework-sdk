/**
 * Model Configurations Stubs
 */

export const COG_CONFIG = {
  id: 'cog-360m',
  architecture: 'smollm',
  createdAt: '2025-01-01T00:00:00.000Z',
  hiddenDim: 960,
  intermediateDim: 2560,
  maxSeqLength: 2048,
  name: 'Cog',
  numHeads: 15,
  numKvHeads: 5,
  numLayers: 32,
  ropeTheta: 10000,
  version: '0.1.0',
  vocabSize: 49152,
} as const;

export const CYRANO_CONFIG = {
  id: 'cyrano-360m',
  architecture: 'smollm',
  createdAt: '2025-01-01T00:00:00.000Z',
  hiddenDim: 960,
  intermediateDim: 2560,
  maxSeqLength: 2048,
  name: 'Cyrano',
  numHeads: 15,
  numKvHeads: 5,
  numLayers: 32,
  ropeTheta: 10000,
  version: '0.1.0',
  vocabSize: 49152,
} as const;

export const MODELS = ['cog-360m', 'cyrano-360m'];

export function getModelConfig(modelId: string) {
  if (modelId === 'cog-360m') return COG_CONFIG;
  if (modelId === 'cyrano-360m') return CYRANO_CONFIG;
  return null;
}

export const SYSTEM_PROMPTS = {
  'cog-360m': 'You are Cog, a DevOps assistant.',
  'cyrano-360m': 'You are Cyrano, an emotional intelligence expert.',
};

export function getSystemPrompt(modelId: string) {
  return SYSTEM_PROMPTS[modelId as keyof typeof SYSTEM_PROMPTS] || '';
}

export const MODEL_SYNC_URLS = {
  'cog-360m': 'https://models.affectively.ai/cog',
  'cyrano-360m': 'https://models.affectively.ai/cyrano',
};
