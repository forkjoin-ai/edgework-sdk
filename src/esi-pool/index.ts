/**
 * ESIPool — Websites contribute idle compute back to the mesh
 *
 * @example
 * ```tsx
 * import { ESIPool } from '@a0n/edgework-sdk/esi-pool';
 *
 * <ESIPool maxCpuPercent={10} maxMemoryMB={50} onTokenEarned={(n) => console.log(n)}>
 *   <App />
 * </ESIPool>
 * ```
 */

export { ESIPool } from './ESIPool';
export { useESIPool } from './useESIPool';
export type { ESIPoolProps, ESIPoolStats, ESIPoolConfig } from './ESIPool';
