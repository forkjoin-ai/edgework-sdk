/**
 * Shared AFFECTIVELY API key helpers.
 *
 * Mirrors edgework-api-key.ts pattern.
 * Key prefixes: af_, af_live_, af_test_, af_dev_
 */

export const AFFECTIVELY_API_KEY_ENV_VAR = 'AFFECTIVELY_API_KEY';
export const AFFECTIVELY_API_KEY_VITE_ENV_VAR = 'VITE_AFFECTIVELY_API_KEY';

const VALID_PREFIXES = ['af_', 'af_live_', 'af_test_', 'af_dev_'];
type ProcessEnvRecord = Record<string, string | undefined>;

function readNodeStyleEnv(key: string): string | undefined {
  const maybeProcess = (globalThis as { process?: { env?: ProcessEnvRecord } })
    .process;
  const value = maybeProcess?.env?.[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

/**
 * Check whether a string looks like a valid AFFECTIVELY API key.
 */
export function isValidAffectivelyApiKey(value: string): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  return VALID_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Resolve API key from explicit value first, then environment variables,
 * then Vite env.
 */
export function resolveAffectivelyApiKey(
  apiKey?: string | null
): string | undefined {
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    return apiKey;
  }

  const envApiKey = readNodeStyleEnv(AFFECTIVELY_API_KEY_ENV_VAR);
  if (envApiKey) {
    return envApiKey;
  }

  const viteEnvApiKey = readNodeStyleEnv(AFFECTIVELY_API_KEY_VITE_ENV_VAR);
  if (viteEnvApiKey) {
    return viteEnvApiKey;
  }

  // Browser env via import.meta.env
  try {
    const meta = import.meta as { env?: Record<string, unknown> };
    const viteValue = meta.env?.[AFFECTIVELY_API_KEY_VITE_ENV_VAR];
    if (typeof viteValue === 'string' && viteValue.trim().length > 0) {
      return viteValue;
    }
  } catch {
    // Not in a Vite context — skip.
  }

  return undefined;
}

/**
 * Build Authorization header for AFFECTIVELY API requests.
 */
export function createAffectivelyAuthHeader(
  apiKey?: string | null
): Record<string, string> {
  const resolvedApiKey = resolveAffectivelyApiKey(apiKey);
  if (!resolvedApiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${resolvedApiKey}`,
  };
}

/**
 * Check whether AFFECTIVELY integration is available (key is resolvable).
 */
export function isAffectivelyAvailable(apiKey?: string | null): boolean {
  return resolveAffectivelyApiKey(apiKey) !== undefined;
}
