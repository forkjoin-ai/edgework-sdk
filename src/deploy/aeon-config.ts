import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AeonConfig, FeatureToggles } from './types';

const FEATURE_KEYS: Array<keyof FeatureToggles> = [
  'analytics',
  'sitemap',
  'robots',
  'metadata',
  'esi',
  'dashrelay',
  'dash',
  'neural',
  'presence',
  'ucan',
  'zk',
  'd1',
  'r2',
  'kv',
  'mcp',
];

const DEFAULT_FEATURES: FeatureToggles = {
  analytics: true,
  sitemap: true,
  robots: true,
  metadata: true,
  esi: true,
  dashrelay: true,
  dash: true,
  neural: true,
  presence: true,
  ucan: true,
  zk: true,
  d1: true,
  r2: true,
  kv: true,
  mcp: true,
};

const PRESET_FEATURES: Record<AeonConfig['preset'], FeatureToggles> = {
  all: { ...DEFAULT_FEATURES },
  core: {
    ...DEFAULT_FEATURES,
    zk: false,
    neural: false,
    r2: false,
  },
  minimal: {
    ...DEFAULT_FEATURES,
    esi: false,
    dashrelay: false,
    dash: false,
    neural: false,
    presence: false,
    ucan: false,
    zk: false,
    d1: false,
    r2: false,
    kv: false,
    mcp: false,
  },
  'mcp-server': {
    ...DEFAULT_FEATURES,
    esi: false,
    dashrelay: false,
    dash: false,
    neural: false,
    presence: false,
    ucan: false,
    zk: false,
    d1: false,
    r2: false,
    kv: false,
    mcp: true,
  },
};
export function detectFeatureKey(input: string): keyof FeatureToggles | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const map: Record<string, keyof FeatureToggles> = {
    analytics: 'analytics',
    sitemap: 'sitemap',
    robots: 'robots',
    metadata: 'metadata',
    esi: 'esi',
    dashrelay: 'dashrelay',
    dash: 'dash',
    neural: 'neural',
    presence: 'presence',
    ucan: 'ucan',
    zk: 'zk',
    d1: 'd1',
    r2: 'r2',
    kv: 'kv',
    mcp: 'mcp',
  };
  return map[normalized] || null;
}

function cloneDefaultConfig(projectName?: string): AeonConfig {
  const safeName = sanitizeProjectName(projectName || 'aeon-foundation');
  return {
    project: {
      name: safeName,
      runtime: 'cloudflare-worker',
      deploymentTarget: 'aeon',
    },
    preset: 'all',
    features: { ...DEFAULT_FEATURES },
    quality: {
      staticThreshold: 100,
      interactiveThreshold: 95,
      crawlFromSitemap: true,
      strict: true,
      ratchetToHundred: true,
    },
    integrations: {
      dashrelayChannels: ['presence', 'collective', 'deploy'],
      analyticsId: 'GTM-XXXXXXX',
      observabilitySink: 'dash',
      mcpServerCommand: 'npx @emotions-app/edgework-mcp',
    },
    storage: {
      d1Binding: 'AEON_D1',
      kvBinding: 'AEON_KV',
      r2Binding: 'AEON_R2',
      migrationStrategy: 'safe',
    },
    security: {
      ucanIssuer: 'did:key:aeon-foundation',
      ucanAudience: 'did:web:aeon.local',
      zkVerificationMode: 'strict',
    },
    performance: {
      esiMode: 'deep',
      prefetch: true,
      speculation: true,
      cacheControl:
        'public, max-age=300, s-maxage=900, stale-while-revalidate=300',
    },
  };
}

function sanitizeProjectName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'aeon-foundation';
}

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      return line.slice(0, index);
    }
  }
  return line;
}

function splitArrayValues(raw: string): string[] {
  const values: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (char === ',' && !inSingle && !inDouble) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim().length > 0) {
    values.push(current.trim());
  }

  return values;
}

function parseTomlScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value) return '';

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value === 'true' || value === 'false') {
    return value === 'true';
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitArrayValues(inner).map((item) => parseTomlScalar(item));
  }

  return value;
}

function parseTomlDocument(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentPath: string[] = [];

  for (const lineRaw of text.split(/\r?\n/)) {
    const line = stripTomlComment(lineRaw).trim();
    if (!line) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentPath = line
        .slice(1, -1)
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean);
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    const value = parseTomlScalar(rawValue);

    let cursor: Record<string, unknown> = root;
    for (const segment of currentPath) {
      const existing = cursor[segment];
      if (
        !existing ||
        typeof existing !== 'object' ||
        Array.isArray(existing)
      ) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[key] = value;
  }

  return root;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return out.length > 0 ? out : fallback;
}

function mergeConfig(base: AeonConfig, patch: Partial<AeonConfig>): AeonConfig {
  const merged: AeonConfig = {
    ...base,
    ...patch,
    project: {
      ...base.project,
      ...(patch.project || {}),
      name: sanitizeProjectName(
        patch.project?.name || base.project.name || 'aeon-foundation'
      ),
    },
    features: {
      ...base.features,
      ...(patch.features || {}),
    },
    quality: {
      ...base.quality,
      ...(patch.quality || {}),
    },
    integrations: {
      ...base.integrations,
      ...(patch.integrations || {}),
      dashrelayChannels:
        patch.integrations?.dashrelayChannels ||
        base.integrations.dashrelayChannels,
    },
    storage: {
      ...base.storage,
      ...(patch.storage || {}),
    },
    security: {
      ...base.security,
      ...(patch.security || {}),
    },
    performance: {
      ...base.performance,
      ...(patch.performance || {}),
    },
  };
  return merged;
}

function partialConfigFromToml(
  raw: Record<string, unknown>
): Partial<AeonConfig> {
  const project = asRecord(raw.project);
  const features = asRecord(raw.features);
  const quality = asRecord(raw.quality);
  const integrations = asRecord(raw.integrations);
  const storage = asRecord(raw.storage);
  const security = asRecord(raw.security);
  const performance = asRecord(raw.performance);

  const featurePatch: Partial<FeatureToggles> = {};
  for (const key of FEATURE_KEYS) {
    if (typeof features[key] === 'boolean') {
      featurePatch[key] = features[key] as boolean;
    }
  }

  const presetRaw = asString(raw.preset, 'all');
  const preset: AeonConfig['preset'] =
    presetRaw === 'core' ||
    presetRaw === 'minimal' ||
    presetRaw === 'mcp-server'
      ? presetRaw
      : 'all';

  return {
    preset,
    project: {
      name: asString(project.name, 'aeon-foundation'),
      runtime: 'cloudflare-worker',
      deploymentTarget: asString(project.deploymentTarget, 'aeon'),
    },
    features: featurePatch as FeatureToggles,
    quality: {
      staticThreshold: asNumber(quality.staticThreshold, 100),
      interactiveThreshold: asNumber(quality.interactiveThreshold, 95),
      crawlFromSitemap: asBoolean(quality.crawlFromSitemap, true),
      strict: asBoolean(quality.strict, true),
      ratchetToHundred: asBoolean(quality.ratchetToHundred, true),
    },
    integrations: {
      dashrelayChannels: asStringArray(integrations.dashrelayChannels, [
        'presence',
        'collective',
        'deploy',
      ]),
      analyticsId: asString(integrations.analyticsId, 'GTM-XXXXXXX'),
      observabilitySink: asString(integrations.observabilitySink, 'dash'),
      mcpServerCommand: asString(
        integrations.mcpServerCommand,
        'npx @emotions-app/edgework-mcp'
      ),
    },
    storage: {
      d1Binding: asString(storage.d1Binding, 'AEON_D1'),
      kvBinding: asString(storage.kvBinding, 'AEON_KV'),
      r2Binding: asString(storage.r2Binding, 'AEON_R2'),
      migrationStrategy: 'safe',
    },
    security: {
      ucanIssuer: asString(security.ucanIssuer, 'did:key:aeon-foundation'),
      ucanAudience: asString(security.ucanAudience, 'did:web:aeon.local'),
      zkVerificationMode:
        asString(security.zkVerificationMode, 'strict') === 'permissive'
          ? 'permissive'
          : 'strict',
    },
    performance: {
      esiMode:
        asString(performance.esiMode, 'deep') === 'light' ? 'light' : 'deep',
      prefetch: asBoolean(performance.prefetch, true),
      speculation: asBoolean(performance.speculation, true),
      cacheControl: asString(
        performance.cacheControl,
        'public, max-age=300, s-maxage=900, stale-while-revalidate=300'
      ),
    },
  };
}

export function loadAeonConfigFromFile(
  configPath: string
): Partial<AeonConfig> {
  const absolutePath = resolve(configPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`aeon.toml not found: ${absolutePath}`);
  }

  const rawText = readFileSync(absolutePath, 'utf8');
  const parsed = parseTomlDocument(rawText);
  return partialConfigFromToml(parsed);
}

export function resolveAeonConfig(options: {
  projectName: string;
  preset?: AeonConfig['preset'];
  configPath?: string;
  enable?: string[];
  disable?: string[];
}): AeonConfig {
  const preset = options.preset || 'all';
  const projectName = sanitizeProjectName(options.projectName);

  const defaults = cloneDefaultConfig(projectName);
  defaults.preset = preset;
  defaults.features = { ...PRESET_FEATURES[preset] };

  let merged = defaults;
  if (options.configPath) {
    const fileConfig = loadAeonConfigFromFile(options.configPath);
    const filePreset = fileConfig.preset || merged.preset;
    const presetBase = {
      ...merged,
      preset: filePreset,
      features: { ...PRESET_FEATURES[filePreset] },
    };
    merged = mergeConfig(presetBase, fileConfig);
  }

  for (const featureInput of options.enable || []) {
    const key = detectFeatureKey(featureInput);
    if (key) {
      merged.features[key] = true;
    }
  }

  for (const featureInput of options.disable || []) {
    const key = detectFeatureKey(featureInput);
    if (key) {
      merged.features[key] = false;
    }
  }

  return merged;
}

export function serializeAeonToml(config: AeonConfig): string {
  const lines: string[] = [
    '# aeon.toml',
    '# Generated by edgework deploy scaffold aeon-foundation',
    '',
    '[project]',
    `name = "${config.project.name}"`,
    `runtime = "${config.project.runtime}"`,
    `deploymentTarget = "${config.project.deploymentTarget}"`,
    '',
    `preset = "${config.preset}"`,
    '',
    '[features]',
    ...FEATURE_KEYS.map(
      (feature) => `${feature} = ${config.features[feature]}`
    ),
    '',
    '[quality]',
    `staticThreshold = ${config.quality.staticThreshold}`,
    `interactiveThreshold = ${config.quality.interactiveThreshold}`,
    `crawlFromSitemap = ${config.quality.crawlFromSitemap}`,
    `strict = ${config.quality.strict}`,
    `ratchetToHundred = ${config.quality.ratchetToHundred}`,
    '',
    '[integrations]',
    `dashrelayChannels = [${config.integrations.dashrelayChannels
      .map((channel) => `"${channel}"`)
      .join(', ')}]`,
    `analyticsId = "${config.integrations.analyticsId}"`,
    `observabilitySink = "${config.integrations.observabilitySink}"`,
    `mcpServerCommand = "${config.integrations.mcpServerCommand}"`,
    '',
    '[storage]',
    `d1Binding = "${config.storage.d1Binding}"`,
    `kvBinding = "${config.storage.kvBinding}"`,
    `r2Binding = "${config.storage.r2Binding}"`,
    `migrationStrategy = "${config.storage.migrationStrategy}"`,
    '',
    '[security]',
    `ucanIssuer = "${config.security.ucanIssuer}"`,
    `ucanAudience = "${config.security.ucanAudience}"`,
    `zkVerificationMode = "${config.security.zkVerificationMode}"`,
    '',
    '[performance]',
    `esiMode = "${config.performance.esiMode}"`,
    `prefetch = ${config.performance.prefetch}`,
    `speculation = ${config.performance.speculation}`,
    `cacheControl = "${config.performance.cacheControl}"`,
    '',
  ];

  return lines.join('\n');
}
