'use client';
import { useSyncExternalStore } from 'react';
import { useAI } from './provider.js';
import {
  evaluateAIPolicies,
  type AIPredictionPolicy,
  type AIPredictionResult,
} from './prediction.js';
import type { AIMemoryValue } from './memory.js';

/** Reactive local policies. They produce review candidates, never execute or call a model. */
export function useAIPrediction<T extends AIMemoryValue>(options: {
  policies: readonly AIPredictionPolicy<T>[];
  context?: Record<string, unknown>;
  scope?: string;
  maxPredictions?: number;
  enabled?: boolean;
}): AIPredictionResult<T> {
  const environment = useAI();
  const snapshot = useSyncExternalStore(
    environment.memory.subscribe,
    environment.memory.getSnapshot,
    environment.memory.getSnapshot,
  );
  if (!environment.enabled || options.enabled === false) return { predictions: [], errors: [] };
  try {
    return evaluateAIPolicies({
      ...options,
      snapshot,
      scope: options.scope ?? environment.memoryScope,
      context: { ...environment.context, ...options.context },
    });
  } catch (cause) {
    return {
      predictions: [],
      errors: [
        {
          policy: 'configuration',
          message: cause instanceof Error ? cause.message : String(cause),
        },
      ],
    };
  }
}
