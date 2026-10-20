'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createFetchTransport } from './transport.js';
import type { AITransport } from './types.js';
import { createAIMemory, type AIMemoryStore } from './memory.js';

export interface AIEnvironment {
  transport: AITransport;
  basePrompt: string;
  context: Record<string, unknown>;
  enabled: boolean;
  memory: AIMemoryStore;
  memoryScope: string;
}
const Environment = createContext<AIEnvironment | null>(null);
export interface AIProviderProps {
  children: ReactNode;
  transport?: AITransport;
  endpoint?: string;
  basePrompt?: string;
  context?: Record<string, unknown>;
  enabled?: boolean;
  memory?: AIMemoryStore;
  memoryScope?: string;
}
/** Nested providers inherit transport and append instructions, merging context. */
export function AIProvider({
  children,
  transport,
  endpoint,
  basePrompt,
  context,
  enabled,
  memory,
  memoryScope,
}: AIProviderProps) {
  const parent = useContext(Environment);
  const [localMemory] = useState(() => memory ?? parent?.memory ?? createAIMemory());
  const value = useMemo<AIEnvironment>(() => {
    const resolvedTransport =
      transport ??
      (endpoint ? createFetchTransport(endpoint) : (parent?.transport ?? createFetchTransport()));

    return {
      transport: resolvedTransport,
      basePrompt: [parent?.basePrompt, basePrompt].filter(Boolean).join('\n\n'),
      context: { ...parent?.context, ...context },
      enabled: (parent?.enabled ?? true) && (enabled ?? true),
      memory: memory ?? parent?.memory ?? localMemory,
      memoryScope: memoryScope ?? parent?.memoryScope ?? 'shared',
    };
  }, [parent, transport, endpoint, basePrompt, context, enabled, memory, memoryScope, localMemory]);
  return <Environment.Provider value={value}>{children}</Environment.Provider>;
}
export function useAI() {
  const value = useContext(Environment);
  if (!value) throw new Error('AI components must be wrapped in <AIProvider>.');
  return value;
}
