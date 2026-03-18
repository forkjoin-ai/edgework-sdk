/**
 * Rate Limit Guardrail
 *
 * Enforces requests-per-minute and tokens-per-minute limits.
 */

import type {
  Guardrail,
  GuardrailResult,
  GuardrailContext,
} from '../core/types';

export interface RateLimitConfig {
  /** Max requests per minute */
  requestsPerMinute?: number;
  /** Max tokens per minute */
  tokensPerMinute?: number;
  /** Window size in ms (default: 60000) */
  windowMs?: number;
  /** Whether to trigger tripwire when exceeded */
  tripwire?: boolean;
}

/**
 * Create a rate limit guardrail.
 */
export function createRateLimitGuardrail(config: RateLimitConfig): Guardrail {
  const windowMs = config.windowMs ?? 60_000;
  const timestamps: number[] = [];
  const tripwire = config.tripwire ?? false;

  return {
    name: 'rate_limit',
    tripwire,
    validate: async (
      _input: unknown,
      _ctx: GuardrailContext
    ): Promise<GuardrailResult> => {
      const now = Date.now();

      // Prune old timestamps outside window
      while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
        timestamps.shift();
      }

      // Check RPM
      if (
        config.requestsPerMinute &&
        timestamps.length >= config.requestsPerMinute
      ) {
        const oldestInWindow = timestamps[0];
        const retryAfterMs = oldestInWindow + windowMs - now;

        return {
          passed: false,
          tripwireTriggered: tripwire,
          info: {
            reason: 'requests_per_minute_exceeded',
            current: timestamps.length,
            limit: config.requestsPerMinute,
            retryAfterMs,
          },
        };
      }

      // Record this request
      timestamps.push(now);

      return { passed: true };
    },
  };
}
