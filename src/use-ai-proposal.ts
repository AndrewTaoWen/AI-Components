'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAITask } from './use-ai-task.js';
import type { AIConfig, AIRequest, AIResponse } from './types.js';

/** Shared lifecycle for components that review model output before applying it. */
export function useAIProposal<T>(ai: AIConfig, parse: (data: unknown, response: AIResponse) => T) {
  const task = useAITask(ai);
  const [proposal, setProposal] = useState<T | null>(null);
  const [validationError, setValidationError] = useState('');
  const reset = useCallback(() => {
    task.cancel();
    setProposal(null);
    setValidationError('');
  }, [task.cancel]);

  useEffect(reset, [task.environment, ai.enabled, ai.prompt, ai.context, parse, reset]);

  async function propose(input: Omit<AIRequest, 'prompt' | 'context'>) {
    setProposal(null);
    setValidationError('');
    const result = await task.run(input);
    if (!result) return;
    try {
      setProposal(parse(result.data, result));
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Invalid AI proposal.');
    }
  }

  return { task, proposal, reset, propose, error: validationError || task.error?.message || '' };
}
