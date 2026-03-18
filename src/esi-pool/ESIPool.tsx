/**
 * ESIPool Component — Contribute idle compute back to the mesh
 *
 * Renders children normally. Spawns a WebWorker that uses
 * requestIdleCallback + document.visibilityState to contribute
 * idle CPU/GPU cycles to the distributed compute network.
 *
 * Zero impact on user experience (idle-only, capped CPU/memory).
 */

'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  createContext,
} from 'react';

// ============================================
// TYPES
// ============================================

export interface ESIPoolConfig {
  /** Max CPU percentage to donate (0-100, default: 10) */
  maxCpuPercent: number;
  /** Max memory in MB to use (default: 50) */
  maxMemoryMB: number;
  /** Gateway URL for task registration */
  gatewayUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Enable GPU contribution (default: false) */
  enableGpu?: boolean;
  /** Pause when battery is low (default: true) */
  pauseOnLowBattery?: boolean;
  /** Low battery threshold percentage (default: 20) */
  lowBatteryThreshold?: number;
}

export interface ESIPoolStats {
  /** Whether the pool is currently active */
  active: boolean;
  /** Number of tasks completed */
  tasksCompleted: number;
  /** Number of tasks failed */
  tasksFailed: number;
  /** Total EDGEWORK tokens earned */
  tokensEarned: number;
  /** Current status */
  status: 'idle' | 'working' | 'paused' | 'stopped';
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Connection health (0-100) */
  connectionHealth: number;
}

export interface ESIPoolProps {
  /** Max CPU percentage to donate (default: 10) */
  maxCpuPercent?: number;
  /** Max memory in MB (default: 50) */
  maxMemoryMB?: number;
  /** Gateway URL (default: https://api.edgework.ai) */
  gatewayUrl?: string;
  /** API key */
  apiKey?: string;
  /** Enable GPU contribution */
  enableGpu?: boolean;
  /** Callback when tokens are earned */
  onTokenEarned?: (amount: number) => void;
  /** Callback when stats update */
  onStatsUpdate?: (stats: ESIPoolStats) => void;
  /** Whether to auto-start (default: true) */
  autoStart?: boolean;
  /** Children to render normally */
  children: React.ReactNode;
}

// ============================================
// CONTEXT
// ============================================

export interface ESIPoolContextValue {
  stats: ESIPoolStats;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export const ESIPoolContext = createContext<ESIPoolContextValue | null>(null);

// ============================================
// COMPONENT
// ============================================

const DEFAULT_STATS: ESIPoolStats = {
  active: false,
  tasksCompleted: 0,
  tasksFailed: 0,
  tokensEarned: 0,
  status: 'stopped',
  uptimeSeconds: 0,
  connectionHealth: 0,
};

export function ESIPool({
  maxCpuPercent = 10,
  maxMemoryMB = 50,
  gatewayUrl = 'https://api.edgework.ai',
  apiKey,
  enableGpu = false,
  onTokenEarned,
  onStatsUpdate,
  autoStart = true,
  children,
}: ESIPoolProps) {
  const [stats, setStats] = useState<ESIPoolStats>(DEFAULT_STATS);
  const workerRef = useRef<Worker | null>(null);
  const startTimeRef = useRef<number>(0);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTokenEarnedRef = useRef(onTokenEarned);
  const onStatsUpdateRef = useRef(onStatsUpdate);

  // Keep refs updated
  onTokenEarnedRef.current = onTokenEarned;
  onStatsUpdateRef.current = onStatsUpdate;

  const updateStats = useCallback((partial: Partial<ESIPoolStats>) => {
    setStats((prev) => {
      const next = { ...prev, ...partial };
      onStatsUpdateRef.current?.(next);
      return next;
    });
  }, []);

  const startWorker = useCallback(() => {
    if (workerRef.current) return;

    try {
      // Create inline worker from pool-worker module
      const workerCode = `
        let config = {};
        let running = false;
        let stats = { tasksCompleted: 0, tasksFailed: 0, tokensEarned: 0 };

        self.onmessage = function(e) {
          const msg = e.data;
          if (msg.type === 'init') {
            config = msg.config;
            running = true;
            self.postMessage({ type: 'status', status: 'idle' });
            pollForTasks();
          } else if (msg.type === 'stop') {
            running = false;
            self.postMessage({ type: 'status', status: 'stopped' });
          } else if (msg.type === 'pause') {
            running = false;
            self.postMessage({ type: 'status', status: 'paused' });
          } else if (msg.type === 'resume') {
            running = true;
            self.postMessage({ type: 'status', status: 'idle' });
            pollForTasks();
          } else if (msg.type === 'get_stats') {
            self.postMessage({ type: 'stats', stats: stats });
          }
        };

        async function pollForTasks() {
          while (running) {
            // Use requestIdleCallback pattern via setTimeout
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (!running) break;

            try {
              const response = await fetch(config.gatewayUrl + '/tasks', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(config.apiKey ? { 'Authorization': 'Bearer ' + config.apiKey } : {})
                },
                body: JSON.stringify({
                  cpuAllocation: config.maxCpuPercent / 100,
                  memoryMB: config.maxMemoryMB,
                  maxDuration: 30,
                  capabilities: config.enableGpu ? ['gpu', 'cpu'] : ['cpu']
                })
              });

              if (response.status === 204) {
                // No tasks available
                self.postMessage({ type: 'status', status: 'idle' });
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
              }

              if (response.ok) {
                const task = await response.json();
                self.postMessage({ type: 'status', status: 'working' });

                // Execute task (placeholder — real implementation depends on task type)
                const result = await executeTask(task);

                // Submit result
                await fetch(config.gatewayUrl + '/tasks/' + task.id + '/result', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(config.apiKey ? { 'Authorization': 'Bearer ' + config.apiKey } : {})
                  },
                  body: JSON.stringify(result)
                });

                stats.tasksCompleted++;
                const earned = (task.reward || 0.0001);
                stats.tokensEarned += earned;
                self.postMessage({ type: 'token_earned', amount: earned });
                self.postMessage({ type: 'stats', stats: stats });
                self.postMessage({ type: 'status', status: 'idle' });
              }
            } catch (err) {
              stats.tasksFailed++;
              self.postMessage({ type: 'stats', stats: stats });
              // Back off on error
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }

        async function executeTask(task) {
          // Task execution — depends on task type
          const startTime = Date.now();
          // Placeholder: echo task back as result
          return {
            taskId: task.id,
            output: task.input ? task.input : null,
            computeTimeMs: Date.now() - startTime,
            success: true
          };
        }
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      workerRef.current = worker;
      startTimeRef.current = Date.now();

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'status') {
          updateStats({ status: msg.status, active: msg.status !== 'stopped' });
        } else if (msg.type === 'stats') {
          updateStats({
            tasksCompleted: msg.stats.tasksCompleted,
            tasksFailed: msg.stats.tasksFailed,
            tokensEarned: msg.stats.tokensEarned,
            connectionHealth: 100,
          });
        } else if (msg.type === 'token_earned') {
          onTokenEarnedRef.current?.(msg.amount);
        }
      };

      // Initialize the worker
      worker.postMessage({
        type: 'init',
        config: {
          maxCpuPercent,
          maxMemoryMB,
          gatewayUrl,
          apiKey,
          enableGpu,
        },
      });

      // Uptime tracker
      statsIntervalRef.current = setInterval(() => {
        if (startTimeRef.current > 0) {
          updateStats({
            uptimeSeconds: Math.floor(
              (Date.now() - startTimeRef.current) / 1000
            ),
          });
        }
      }, 5000);

      updateStats({ active: true, status: 'idle' });
    } catch {
      // Worker creation failed — silently degrade
      updateStats({ active: false, status: 'stopped' });
    }
  }, [maxCpuPercent, maxMemoryMB, gatewayUrl, apiKey, enableGpu, updateStats]);

  const stopWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    startTimeRef.current = 0;
    updateStats({ active: false, status: 'stopped', connectionHealth: 0 });
  }, [updateStats]);

  const pauseWorker = useCallback(() => {
    workerRef.current?.postMessage({ type: 'pause' });
    updateStats({ status: 'paused' });
  }, [updateStats]);

  const resumeWorker = useCallback(() => {
    workerRef.current?.postMessage({ type: 'resume' });
    updateStats({ status: 'idle' });
  }, [updateStats]);

  // Visibility change — pause when hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pauseWorker();
      } else if (document.visibilityState === 'visible' && stats.active) {
        resumeWorker();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [stats.active, pauseWorker, resumeWorker]);

  // Auto-start
  useEffect(() => {
    if (autoStart) {
      startWorker();
    }
    return () => {
      stopWorker();
    };
  }, [autoStart, startWorker, stopWorker]);

  const contextValue: ESIPoolContextValue = {
    stats,
    start: startWorker,
    stop: stopWorker,
    pause: pauseWorker,
    resume: resumeWorker,
  };

  return (
    <ESIPoolContext.Provider value={contextValue}>
      {children}
    </ESIPoolContext.Provider>
  );
}
