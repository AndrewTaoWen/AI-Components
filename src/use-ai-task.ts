'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAI } from './provider.js';
import type { AIConfig, AIRequest, AIResponse } from './types.js';
import { prepareAIRequest, type AITaskInput } from './context-recipe.js';

type AITaskStatus = 'idle' | 'loading' | 'success' | 'error';

/** One active request per hook. Late responses never replace newer results. */
export function useAITask(config: AIConfig = {}) {
  const environment = useAI();
  const [status, setStatus] = useState<AITaskStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const borrowedRequest = useRef<{ input: AITaskInput; signature: string } | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const enabled = environment.enabled && config.enabled !== false;
  const cancel = useCallback(() => {
    requestSequence.current++;
    activeController.current?.abort();
    activeController.current = null;
    borrowedRequest.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  const prepare = useCallback(
    (input: AITaskInput): AIRequest =>
      prepareAIRequest(
        input,
        {
          basePrompt: environment.basePrompt,
          context: environment.context,
          memoryScope: environment.memoryScope,
          snapshot: environment.memory.getSnapshot(),
        },
        config,
      ),
    [environment, config.prompt, config.context, config.recipe],
  );

  // Memory is external to provider configuration: unrelated updates do not reset requests.
  useEffect(() => {
    if (!config.recipe) return;
    return environment.memory.subscribe(() => {
      const previous = borrowedRequest.current;
      if (!previous) return;
      try {
        if (JSON.stringify(prepare(previous.input)) === previous.signature) return;
      } catch {
        // A source that can no longer be read also makes its previous proposal stale.
      }
      cancel();
      setContextVersion((version) => version + 1);
    });
  }, [environment.memory, config.recipe, prepare, cancel]);
  useEffect(
    () => () => {
      requestSequence.current++;
      activeController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    cancel();
  }, [environment, config.prompt, config.context, config.recipe, config.enabled, cancel]);
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
      borrowedRequest.current = null;
      const request = prepare(input);
      borrowedRequest.current = config.recipe
        ? { input, signature: JSON.stringify(request) }
        : null;
      const result = await environment.transport.generate(request, {
        signal: requestController.signal,
      });
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

  function remember(value: unknown) {
    const binding = config.remember;
    if (!binding) return;
    environment.memory.remember(
      binding.scope ?? environment.memoryScope,
      binding.key,
      binding.project ? binding.project(value) : value,
      {
        type: binding.action ?? `${binding.key}.accepted`,
        source: binding.source,
      },
    );
  }

  return { run, prepare, remember, cancel, status, error, enabled, environment, contextVersion };
}
