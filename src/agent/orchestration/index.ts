/**
 * EADK Orchestration — Public API
 */

export { SequentialAgent } from './sequential';
export type { SequentialAgentConfig } from './sequential';

export { ParallelAgent } from './parallel';
export type { ParallelAgentConfig } from './parallel';

export { LoopAgent } from './loop';
export type { LoopAgentConfig } from './loop';

export { GraphAgent, InMemoryCheckpointer, END } from './graph';
export type { GraphAgentConfig } from './graph';

export { createHandoff, executeHandoff } from './handoff';

// Re-export graph types from core
export type {
  GraphConfig,
  GraphNode,
  GraphEdge,
  Checkpointer,
} from '../core/types';
