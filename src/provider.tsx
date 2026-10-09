'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createFetchTransport } from './transport.js';
import type { AITransport } from './types.js';

export interface AIEnvironment {
  transport: AITransport;
  basePrompt: string;
  context: Record<string, unknown>;
  enabled: boolean;
}
const Environment = createContext<AIEnvironment | null>(null);
export interface AIProviderProps {
  children: ReactNode;
  transport?: AITransport;
  endpoint?: string;
  basePrompt?: string;
  context?: Record<string, unknown>;
  enabled?: boolean;
}
/** Nested providers inherit transport and append instructions, merging context. */
export function AIProvider({
  children,
  transport,
  endpoint,
  basePrompt,
  context,
  enabled,
}: AIProviderProps) {
  const parent = useContext(Environment);
  const value = useMemo<AIEnvironment>(() => {
    const resolvedTransport =
      transport ??
      (endpoint ? createFetchTransport(endpoint) : (parent?.transport ?? createFetchTransport()));

    return {
      transport: resolvedTransport,
      basePrompt: [parent?.basePrompt, basePrompt].filter(Boolean).join('\n\n'),
      context: { ...parent?.context, ...context },
      enabled: (parent?.enabled ?? true) && (enabled ?? true),
    };
  }, [parent, transport, endpoint, basePrompt, context, enabled]);
  return <Environment.Provider value={value}>{children}</Environment.Provider>;
}
export function useAI() {
  const value = useContext(Environment);
  if (!value) throw new Error('AI components must be wrapped in <AIProvider>.');
  return value;
}
