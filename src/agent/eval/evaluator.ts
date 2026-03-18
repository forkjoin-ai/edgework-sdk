/**
 * EADK Evaluation Framework
 *
 * Trajectory + response evaluation for agent quality assessment.
 * Google ADK eval pattern.
 */

import type {
  EADKAgent,
  EvalCase,
  EvalResult,
  EvalMetric,
  EvalContext,
  RunConfig,
} from '../core/types';

export interface EvalConfig {
  /** Metrics to evaluate */
  metrics: EvalMetric[];
  /** Pass threshold (0-1, default: 0.7) */
  passThreshold?: number;
  /** Run config overrides for eval */
  runConfig?: RunConfig;
  /** Concurrency limit */
  concurrency?: number;
}

export interface EvalSuiteResult {
  cases: EvalResult[];
  averageScore: number;
  passRate: number;
  metricAverages: Record<string, number>;
  totalDurationMs: number;
}

/**
 * Evaluate an agent against a set of test cases.
 */
export async function evaluate(
  agent: EADKAgent,
  cases: EvalCase[],
  config: EvalConfig
): Promise<EvalSuiteResult> {
  const startTime = Date.now();
  const threshold = config.passThreshold ?? 0.7;
  const concurrency = config.concurrency ?? 5;
  const results: EvalResult[] = [];

  // Process in batches for concurrency control
  for (let i = 0; i < cases.length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((testCase) =>
        evaluateCase(agent, testCase, config.metrics, config.runConfig)
      )
    );
    results.push(...batchResults);
  }

  // Compute aggregate metrics
  const metricTotals: Record<string, number[]> = {};
  for (const result of results) {
    for (const [name, score] of Object.entries(result.metrics)) {
      if (!metricTotals[name]) metricTotals[name] = [];
      metricTotals[name].push(score);
    }
  }

  const metricAverages: Record<string, number> = {};
  for (const [name, values] of Object.entries(metricTotals)) {
    metricAverages[name] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  const averageScore =
    results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const passRate =
    results.filter((r) => r.score >= threshold).length / results.length;

  // Mark pass/fail
  for (const result of results) {
    result.passed = result.score >= threshold;
  }

  return {
    cases: results,
    averageScore,
    passRate,
    metricAverages,
    totalDurationMs: Date.now() - startTime,
  };
}

async function evaluateCase(
  agent: EADKAgent,
  testCase: EvalCase,
  metrics: EvalMetric[],
  runConfig?: RunConfig
): Promise<EvalResult> {
  const startTime = Date.now();

  // Run the agent
  const agentResult = await agent.run(testCase.input, runConfig);

  // Evaluate each metric
  const evalCtx: EvalContext = {
    case: testCase,
    toolCalls: agentResult.toolCalls,
    messages: agentResult.messages,
  };

  const metricScores: Record<string, number> = {};
  for (const metric of metrics) {
    metricScores[metric.name] = await metric.evaluate(
      testCase.expectedOutput,
      agentResult.output,
      evalCtx
    );
  }

  // Overall score is average of all metrics
  const scores = Object.values(metricScores);
  const score =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    case: testCase,
    actualOutput: agentResult.output,
    actualToolCalls: agentResult.toolCalls,
    score,
    metrics: metricScores,
    durationMs: Date.now() - startTime,
    passed: false, // Will be set by evaluate()
  };
}

// ---------------------------------------------------------------------------
// Built-in Metrics
// ---------------------------------------------------------------------------

/**
 * Exact match metric — checks if output exactly matches expected.
 */
export const exactMatch: EvalMetric = {
  name: 'exact_match',
  evaluate: async (expected, actual) => {
    if (!expected) return 0;
    return expected.trim() === actual.trim() ? 1 : 0;
  },
};

/**
 * Contains metric — checks if output contains expected substring.
 */
export const contains: EvalMetric = {
  name: 'contains',
  evaluate: async (expected, actual) => {
    if (!expected) return 0;
    return actual.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0;
  },
};

/**
 * Length ratio metric — penalizes outputs that are too short or too long.
 */
export const lengthRatio: EvalMetric = {
  name: 'length_ratio',
  evaluate: async (expected, actual) => {
    if (!expected) return actual.length > 0 ? 1 : 0;
    const ratio = actual.length / expected.length;
    // Score drops off as ratio deviates from 1
    return Math.max(0, 1 - Math.abs(1 - ratio));
  },
};

/**
 * Tool usage metric — checks if expected tools were called.
 */
export const toolUsage: EvalMetric = {
  name: 'tool_usage',
  evaluate: async (_expected, _actual, ctx) => {
    if (
      !ctx.case.expectedToolCalls ||
      ctx.case.expectedToolCalls.length === 0
    ) {
      return 1;
    }

    const expectedNames = new Set(
      ctx.case.expectedToolCalls.map((t) => t.name)
    );
    const actualNames = new Set(ctx.toolCalls.map((t) => t.name));

    let matches = 0;
    for (const name of expectedNames) {
      if (actualNames.has(name)) matches++;
    }

    return matches / expectedNames.size;
  },
};

/**
 * Create a custom regex-based metric.
 */
export function createRegexMetric(name: string, pattern: RegExp): EvalMetric {
  return {
    name,
    evaluate: async (_expected, actual) => {
      return pattern.test(actual) ? 1 : 0;
    },
  };
}
