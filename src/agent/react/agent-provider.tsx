/**
 * AgentProvider
 *
 * React context provider for sharing agent configuration across components.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { EADKAgent, RunConfig } from '../core/types';

export interface AgentContextValue {
  /** Registered agents by name */
  agents: Record<string, EADKAgent>;
  /** Default run configuration */
  defaultConfig?: RunConfig;
  /** Get an agent by name */
  getAgent: (name: string) => EADKAgent | undefined;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export interface AgentProviderProps {
  /** Agents to make available */
  agents: EADKAgent[];
  /** Default run configuration */
  defaultConfig?: RunConfig;
  /** Children */
  children: React.ReactNode;
}

export function AgentProvider({
  agents,
  defaultConfig,
  children,
}: AgentProviderProps) {
  const value = useMemo<AgentContextValue>(() => {
    const agentMap: Record<string, EADKAgent> = {};
    for (const agent of agents) {
      agentMap[agent.config.name] = agent;
    }

    return {
      agents: agentMap,
      defaultConfig,
      getAgent: (name: string) => agentMap[name],
    };
  }, [agents, defaultConfig]);

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

/**
 * Hook to access agent context.
 */
export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error('useAgentContext must be used within an AgentProvider');
  }
  return ctx;
}

/**
 * Hook to get a specific agent by name from the provider.
 */
export function useAgentByName(name: string): EADKAgent | undefined {
  const ctx = useAgentContext();
  return ctx.getAgent(name);
}
