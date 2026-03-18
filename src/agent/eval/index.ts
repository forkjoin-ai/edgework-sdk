/**
 * EADK Evaluation — Public API
 */

export {
  evaluate,
  exactMatch,
  contains,
  lengthRatio,
  toolUsage,
  createRegexMetric,
} from './evaluator';
export type { EvalConfig, EvalSuiteResult } from './evaluator';

// Re-export eval types from core
export type {
  EvalCase,
  EvalResult,
  EvalMetric,
  EvalContext,
} from '../core/types';
