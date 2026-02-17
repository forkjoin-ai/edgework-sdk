/**
 * Sync Factory
 *
 * Creates ModelSync instances.
 */

import { ModelSync } from './model-sync';
import type { BaseStorage } from '../storage/base-storage';
import type { DownloadProgress } from '../../types';

export interface SyncOptions {
  /** Sync server URL */
  syncUrl: string;
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Create a model sync service
 */
export function createModelSync(
  storage: BaseStorage,
  options: SyncOptions
): ModelSync {
  return new ModelSync(storage, options.syncUrl, options.onProgress);
}

/**
 * Default sync server URLs
 */
export const DEFAULT_SYNC_URLS = {
  production: 'https://models.affectively.ai',
  development: 'http://localhost:8787',
} as const;
