'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAI } from './provider.js';
import { readMemory, type AIMemoryActionInput, type AIMemoryData } from './memory.js';

/** Read and deliberately update shared or workflow-scoped session memory. */
export function useAIMemory(scope?: string) {
  const environment = useAI();
  const store = environment.memory;
  const resolvedScope = scope ?? environment.memoryScope;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const updateMemory = useCallback(
    (patch: AIMemoryData | ((current: AIMemoryData) => AIMemoryData)) =>
      store.update(resolvedScope, patch),
    [store, resolvedScope],
  );
  const recordAction = useCallback(
    (action: AIMemoryActionInput) => store.recordAction(resolvedScope, action),
    [store, resolvedScope],
  );
  const remember = useCallback(
    (key: string, value: unknown, action: { type: string; source?: string }) =>
      store.remember(resolvedScope, key, value, action),
    [store, resolvedScope],
  );
  const clearMemory = useCallback(() => store.clear(resolvedScope), [store, resolvedScope]);
  const actions = useMemo(
    () => snapshot.actions.filter((action) => action.scope === resolvedScope),
    [snapshot, resolvedScope],
  );
  return {
    memory: readMemory(snapshot, resolvedScope),
    actions,
    scope: resolvedScope,
    updateMemory,
    recordAction,
    remember,
    clearMemory,
  };
}
