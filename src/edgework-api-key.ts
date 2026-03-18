/**
 * Shared Edgework API key helpers.
 */

export const EDGEWORK_API_KEY_ENV_VAR = 'EDGEWORK_API_KEY';
export const EDGEWORK_API_TOKEN_ENV_VAR = 'EDGEWORK_API_TOKEN';
export const EW_API_KEY_ENV_VAR = 'EW_API_KEY';

/**
 * Resolve API key from explicit value first, then environment variable.
 */
export function resolveEdgeworkApiKey(
  apiKey?: string | null
): string | undefined {
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    return apiKey;
  }

  if (typeof process !== 'undefined' && process.env) {
    const envCandidates = [
      EDGEWORK_API_KEY_ENV_VAR,
      EDGEWORK_API_TOKEN_ENV_VAR,
      EW_API_KEY_ENV_VAR,
    ];
    for (const envVarName of envCandidates) {
      const envApiKey = process.env[envVarName];
      if (typeof envApiKey === 'string' && envApiKey.trim().length > 0) {
        return envApiKey;
      }
    }
  }

  return undefined;
}

/**
 * Build Authorization header for Edgework gateway requests.
 */
export function createEdgeworkAuthHeader(
  apiKey?: string | null
): Record<string, string> {
  const resolvedApiKey = resolveEdgeworkApiKey(apiKey);
  if (!resolvedApiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${resolvedApiKey}`,
  };
}
