'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAI } from './provider.js';
import { resolveAIContext, type AIContextRecipe } from './context-recipe.js';
import { cloneAIMemoryValue, type AIMemoryValue } from './memory.js';
import {
  validateAIActionProposal,
  type AIActionEvidence,
  type AIActionProposal,
} from './actions.js';
import { evaluateAIPolicies, type AIPrediction } from './prediction.js';
export interface AIAsyncPredictionLimits {
  maxInputCharacters: number;
  maxOutputCharacters: number;
  maxProposals: number;
  maxSteps: number;
  /** The application generator/backend must enforce this token cap. */
  maxOutputTokens: number;
  timeoutMs: number;
}
export interface AIAsyncPredictionOptions<T extends AIMemoryValue> extends Pick<
  AIContextRecipe,
  'name' | 'purpose' | 'borrow'
> {
  actionType: string;
  scope?: string;
  context?: Record<string, unknown>;
  enabled?: boolean;
  auto?: boolean;
  debounceMs?: number;
  limits?: Partial<AIAsyncPredictionLimits>;
  /** Developer-provided evidence replaces any model citation claims. */
  evidence: readonly AIActionEvidence[];
  validatePayload(payload: T): void;
  generate(input: {
    scope: string;
    borrowed: Readonly<Record<string, AIMemoryValue>>;
    signal: AbortSignal;
    limits: AIAsyncPredictionLimits;
  }): Promise<unknown>;
}
const defaults: AIAsyncPredictionLimits = {
  maxInputCharacters: 16000,
  maxOutputCharacters: 64000,
  maxProposals: 10,
  maxSteps: 50,
  maxOutputTokens: 2048,
  timeoutMs: 30000,
};
export function useAIAsyncPrediction<T extends AIMemoryValue>(
  options: AIAsyncPredictionOptions<T>,
) {
  const environment = useAI();
  const snapshot = useSyncExternalStore(
    environment.memory.subscribe,
    environment.memory.getSnapshot,
    environment.memory.getSnapshot,
  );
  const enabled = environment.enabled && options.enabled !== false;
  let frame: {
    borrowed: Readonly<Record<string, AIMemoryValue>>;
    sources: Record<string, string>;
    scope: string;
    limits: AIAsyncPredictionLimits;
    evidence: readonly AIActionEvidence[];
  } | null = null;
  let preparationError = '';
  try {
    const limits = { ...defaults, ...options.limits };
    if (
      Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      !Number.isFinite(options.debounceMs ?? 500) ||
      (options.debounceMs ?? 500) < 0
    )
      throw new Error('Prediction limits must be positive integers and debounce nonnegative.');
    const scope = options.scope ?? environment.memoryScope;
    const resolved = resolveAIContext(
      options,
      { action: 'extract', text: '' },
      { context: { ...environment.context, ...options.context }, memoryScope: scope, snapshot },
    );
    const borrowed = cloneAIMemoryValue(resolved.view.borrowed) as Readonly<
      Record<string, AIMemoryValue>
    >;
    const evidence = cloneAIMemoryValue(options.evidence) as unknown as readonly AIActionEvidence[];
    if (JSON.stringify(borrowed).length > limits.maxInputCharacters)
      throw new Error('Selected prediction context exceeds its input limit.');
    frame = { borrowed, sources: resolved.sources, scope, limits, evidence };
  } catch (cause) {
    preparationError = cause instanceof Error ? cause.message : String(cause);
  }
  const signature = JSON.stringify([
    options.name,
    options.purpose,
    options.actionType,
    frame,
    preparationError,
    enabled,
  ]);
  const latest = useRef({ options, frame, signature, enabled, memory: environment.memory });
  latest.current = { options, frame, signature, enabled, memory: environment.memory };
  const mounted = useRef(true),
    sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [predictions, setPredictions] = useState<readonly AIPrediction<T>[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    if (mounted.current) {
      setPredictions([]);
      setStatus('idle');
      setError('');
    }
  }, []);
  const predict = useCallback(async (): Promise<readonly AIPrediction<T>[] | null> => {
    const owner = latest.current;
    if (!owner.enabled) return null;
    if (!owner.frame) {
      setStatus('error');
      setError('Invalid or oversized prediction context.');
      return null;
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const id = ++sequence.current;
    const current = owner.frame;
    const stale = () =>
      !mounted.current ||
      id !== sequence.current ||
      owner.signature !== latest.current.signature ||
      owner.memory !== latest.current.memory ||
      active.signal.aborted;
    setStatus('loading');
    setError('');
    setPredictions([]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () =>
          reject(new DOMException('Prediction cancelled or timed out.', 'AbortError'));
        active.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => active.abort(), current.limits.timeoutMs);
      });
      const raw = await Promise.race([
        owner.options.generate({
          scope: current.scope,
          borrowed: current.borrowed,
          signal: active.signal,
          limits: current.limits,
        }),
        aborted,
      ]);
      if (stale()) return null;
      const value = cloneAIMemoryValue(raw);
      if (
        !Array.isArray(value) ||
        value.length > current.limits.maxProposals ||
        JSON.stringify(value).length > current.limits.maxOutputCharacters
      )
        throw new Error('Prediction output exceeds its shape or size limit.');
      const proposals = value.map((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
          throw new Error('Invalid generated proposal.');
        const proposal = validateAIActionProposal<T>({
          ...candidate,
          evidence: current.evidence,
        } as unknown as AIActionProposal<T>);
        if (proposal.steps.length > current.limits.maxSteps)
          throw new Error('Too many proposed steps.');
        proposal.steps.forEach((step) => owner.options.validatePayload(step.payload));
        return proposal;
      });
      const result = evaluateAIPolicies<T>({
        policies: [
          {
            name: owner.options.name,
            purpose: owner.options.purpose,
            actionType: owner.options.actionType,
            predict: () => proposals,
          },
        ],
        snapshot: owner.memory.getSnapshot(),
        scope: current.scope,
        maxPredictions: current.limits.maxProposals,
      });
      if (result.errors.length) throw new Error(result.errors[0].message);
      const next = Object.freeze(
        result.predictions.map((prediction) =>
          Object.freeze({
            ...prediction,
            inspection: Object.freeze({
              name: owner.options.name,
              purpose: owner.options.purpose,
              scope: current.scope,
              sources: current.sources,
              borrowed: current.borrowed,
            }),
          }),
        ),
      );
      if (stale()) return null;
      setPredictions(next);
      setStatus('success');
      return next;
    } catch (cause) {
      if (!stale()) {
        setStatus('error');
        setError(cause instanceof Error ? cause.message : String(cause));
      } else if (
        mounted.current &&
        id === sequence.current &&
        owner.signature === latest.current.signature &&
        active.signal.aborted
      ) {
        setStatus('error');
        setError('Prediction cancelled or timed out.');
      }
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) active.signal.removeEventListener('abort', onAbort);
    }
  }, []);
  useEffect(() => {
    cancel();
    if (!options.auto || !enabled || !frame) return;
    const timer = setTimeout(() => {
      void predict();
    }, options.debounceMs ?? 500);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [signature, options.auto, options.debounceMs, environment.memory, cancel, predict]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
      controller.current?.abort();
    };
  }, []);
  return {
    predictions,
    status,
    error: preparationError || error,
    enabled: enabled && !!frame,
    predict,
    cancel,
  };
}
