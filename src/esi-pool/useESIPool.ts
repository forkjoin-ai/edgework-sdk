/**
 * useESIPool — React hook for accessing ESIPool context
 *
 * @example
 * ```tsx
 * function StatusBar() {
 *   const { stats, pause, resume } = useESIPool();
 *   return <div>Tasks: {stats.tasksCompleted} | Earned: {stats.tokensEarned}</div>;
 * }
 * ```
 */

'use client';

import { useContext } from 'react';
import { ESIPoolContext } from './ESIPool';
import type { ESIPoolContextValue } from './ESIPool';

export function useESIPool(): ESIPoolContextValue {
  const ctx = useContext(ESIPoolContext);
  if (!ctx) {
    throw new Error('useESIPool must be used within an <ESIPool> provider');
  }
  return ctx;
}
