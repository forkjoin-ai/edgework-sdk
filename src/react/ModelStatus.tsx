/**
 * ModelStatus - Display model download and inference status
 *
 * Shows download progress, model readiness, and inference stats.
 */

import React from 'react';

export interface ModelStatusProps {
  /** Model identifier */
  modelId: string;
  /** Download progress (0-100) */
  downloadProgress?: number;
  /** Whether the model is ready for inference */
  isReady: boolean;
  /** Whether currently generating */
  isGenerating?: boolean;
  /** Current inference speed (tokens/sec) */
  tokensPerSecond?: number;
  /** Storage used by the model (bytes) */
  storageUsed?: number;
  /** Inference backend being used */
  backend?: 'webgpu' | 'wasm' | 'cpu';
  /** Whether SIMD is enabled */
  simdEnabled?: boolean;
  /** Error message if any */
  error?: string;
  /** Compact display mode */
  compact?: boolean;
  /** Custom class names */
  className?: string;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Model status indicator component
 */
export function ModelStatus({
  modelId,
  downloadProgress,
  isReady,
  isGenerating = false,
  tokensPerSecond,
  storageUsed,
  backend,
  simdEnabled,
  error,
  compact = false,
  className = '',
}: ModelStatusProps): React.ReactElement {
  // Determine status
  const isDownloading =
    downloadProgress !== undefined && downloadProgress < 100;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 text-sm ${className}`}>
        {/* Status indicator */}
        <span
          className={`w-2 h-2 rounded-full ${
            error
              ? 'bg-red-500'
              : isGenerating
              ? 'bg-yellow-500 animate-pulse'
              : isReady
              ? 'bg-green-500'
              : isDownloading
              ? 'bg-blue-500 animate-pulse'
              : 'bg-gray-400'
          }`}
        />

        {/* Model name */}
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {modelId}
        </span>

        {/* Status text */}
        <span className="text-gray-500 dark:text-gray-400">
          {error
            ? 'Error'
            : isGenerating
            ? `${tokensPerSecond?.toFixed(1) ?? '?'} tok/s`
            : isReady
            ? 'Ready'
            : isDownloading
            ? `${downloadProgress}%`
            : 'Not loaded'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              error
                ? 'bg-red-500'
                : isGenerating
                ? 'bg-yellow-500 animate-pulse'
                : isReady
                ? 'bg-green-500'
                : isDownloading
                ? 'bg-blue-500 animate-pulse'
                : 'bg-gray-400'
            }`}
          />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {modelId}
          </h3>
        </div>

        {/* Backend badge */}
        {backend && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {backend.toUpperCase()}
            {simdEnabled && ' + SIMD'}
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Download progress */}
      {isDownloading && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>Downloading...</span>
            <span>{downloadProgress}%</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            {}
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              // eslint-disable-next-line no-restricted-syntax -- dynamic width requires inline style
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      {isReady && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {/* Inference speed */}
          <div className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
              Speed
            </div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {isGenerating
                ? `${tokensPerSecond?.toFixed(1) ?? '—'} tok/s`
                : 'Idle'}
            </div>
          </div>

          {/* Storage */}
          {storageUsed !== undefined && (
            <div className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Storage
              </div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {formatBytes(storageUsed)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status text for not loaded */}
      {!isReady && !isDownloading && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Model not loaded. Call{' '}
          <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
            init()
          </code>{' '}
          to start.
        </p>
      )}
    </div>
  );
}
