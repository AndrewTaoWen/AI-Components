'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAI } from './provider.js';
import type { AIConfig, AIRequest, AIResponse } from './types.js';

type AITaskStatus = 'idle' | 'loading' | 'success' | 'error';

/** One active request per hook. Late responses never replace newer results. */
export function useAITask(config: AIConfig = {}) {
  const environment = useAI();
  const [status, setStatus] = useState<AITaskStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const enabled = environment.enabled && config.enabled !== false;
  const cancel = useCallback(() => {
    requestSequence.current++;
    activeController.current?.abort();
    activeController.current = null;
    setStatus('idle');
    setError(null);
  }, []);
  useEffect(
    () => () => {
      requestSequence.current++;
      activeController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    cancel();
  }, [environment, config.prompt, config.context, config.enabled, cancel]);
  async function run(input: Omit<AIRequest, 'prompt' | 'context'>): Promise<AIResponse | null> {
    if (!enabled) return null;
    activeController.current?.abort();
    const requestId = ++requestSequence.current;
    const requestController = new AbortController();
    const isStale = () => requestSequence.current !== requestId || requestController.signal.aborted;
    activeController.current = requestController;
    setStatus('loading');
    setError(null);
    try {
      const result = await environment.transport.generate(
        {
          ...input,
          prompt: [environment.basePrompt, config.prompt].filter(Boolean).join('\n\n'),
          context: { ...environment.context, ...config.context },
        },
        { signal: requestController.signal },
      );
      if (isStale()) return null;
      setStatus('success');
      return result;
    } catch (cause) {
      if (isStale()) return null;
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setStatus('error');
      return null;
    }
  }
  return { run, cancel, status, error, enabled, environment };
}
