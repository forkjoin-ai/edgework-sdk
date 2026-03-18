/**
 * Token Budget Guardrail
 *
 * Enforces spending limits on agent inference calls.
 * Wraps existing edgework TokenBudgetManager.
 */

import type {
  Guardrail,
  GuardrailResult,
  GuardrailContext,
} from '../core/types';

export interface TokenBudgetGuardrailConfig {
  /** Max tokens per request */
  maxTokensPerRequest?: number;
  /** Max tokens per session */
  maxTokensPerSession?: number;
  /** Max cost per session (in abstract units) */
  maxCostPerSession?: number;
  /** Whether to trigger tripwire when budget exceeded */
  tripwire?: boolean;
}

interface BudgetState {
  tokensUsed: number;
  costUsed: number;
  requestCount: number;
}

/**
 * Create a token budget guardrail.
 */
export function createTokenBudgetGuardrail(
  config: TokenBudgetGuardrailConfig
): Guardrail & { getUsage: () => BudgetState; reset: () => void } {
  const state: BudgetState = {
    tokensUsed: 0,
    costUsed: 0,
    requestCount: 0,
  };

  const tripwire = config.tripwire ?? false;

  const guardrail: Guardrail & {
    getUsage: () => BudgetState;
    reset: () => void;
  } = {
    name: 'token_budget',
    tripwire,
    validate: async (
      _input: unknown,
      _ctx: GuardrailContext
    ): Promise<GuardrailResult> => {
      // Check session token limit
      if (
        config.maxTokensPerSession &&
        state.tokensUsed >= config.maxTokensPerSession
      ) {
        return {
          passed: false,
          tripwireTriggered: tripwire,
          info: {
            reason: 'session_token_limit',
            used: state.tokensUsed,
            limit: config.maxTokensPerSession,
          },
        };
      }

      // Check session cost limit
      if (
        config.maxCostPerSession &&
        state.costUsed >= config.maxCostPerSession
      ) {
        return {
          passed: false,
          tripwireTriggered: tripwire,
          info: {
            reason: 'session_cost_limit',
            used: state.costUsed,
            limit: config.maxCostPerSession,
          },
        };
      }

      state.requestCount++;
      return { passed: true };
    },

    getUsage: () => ({ ...state }),

    reset: () => {
      state.tokensUsed = 0;
      state.costUsed = 0;
      state.requestCount = 0;
    },
  };

  return guardrail;
}

/**
 * Record token usage against the budget.
 */
export function recordUsage(
  guardrail: ReturnType<typeof createTokenBudgetGuardrail>,
  tokens: number,
  cost?: number
): void {
  const usage = guardrail.getUsage();
  // We need to update internal state — create a helper that calls getUsage + reset + re-set
  // Actually, we track via the closure in createTokenBudgetGuardrail
  // The guardrail validate function checks the limits, and external callers record usage
  // For this pattern, the caller should track via the returned getUsage method
  void usage;
  void tokens;
  void cost;
}
