'use client';
import { useEffect, useRef, useState } from 'react';
import { useAITask } from './use-ai-task.js';
import type { WritingConfig } from './types.js';
export interface AICompletionOptions {
  value: string;
  selection: { start: number; end: number };
  focused: boolean;
  composing?: boolean;
  enabled?: boolean;
  ai?: WritingConfig;
  maxInputCharacters?: number;
}
/** Single-line insertion at a collapsed end-of-line caret. No mutation until accept. */
export function useAICompletion(options: AICompletionOptions) {
  const task = useAITask(options.ai);
  const [suggestion, setSuggestion] = useState('');
  const latest = useRef(options);
  latest.current = options;
  const baseline = useRef<{ value: string; start: number; end: number } | null>(null);
  const sequence = useRef(0);
  const atLineEnd =
    options.selection.start === options.selection.end &&
    (options.selection.start === options.value.length ||
      options.value[options.selection.start] === '\n');
  const available = task.enabled && options.enabled !== false && options.ai?.autocomplete !== false;
  useEffect(() => {
    const id = ++sequence.current;
    task.cancel();
    setSuggestion('');
    baseline.current = null;
    if (
      !available ||
      !options.focused ||
      options.composing ||
      !atLineEnd ||
      options.selection.start < (options.ai?.minLength ?? 3)
    )
      return;
    const maximum = options.maxInputCharacters ?? 8000;
    if (!Number.isSafeInteger(maximum) || maximum < 1) return;
    const base = {
      value: options.value,
      start: options.selection.start,
      end: options.selection.end,
    };
    const timer = setTimeout(() => {
      void task
        .run({ action: 'complete', text: base.value.slice(0, base.start).slice(-maximum) })
        .then((result) => {
          const current = latest.current;
          if (
            !result ||
            sequence.current !== id ||
            current.value !== base.value ||
            current.selection.start !== base.start ||
            current.selection.end !== base.end ||
            !current.focused ||
            current.composing
          )
            return;
          // Only a single visible line is accepted; multiline drafts belong in explicit review.
          const suffix = result.text.split(/\r?\n/)[0].slice(0, 256);
          if (!suffix) return;
          baseline.current = base;
          setSuggestion(suffix);
        });
    }, options.ai?.debounceMs ?? 600);
    return () => {
      sequence.current++;
      clearTimeout(timer);
      task.cancel();
    };
  }, [
    options.value,
    options.selection.start,
    options.selection.end,
    options.focused,
    options.composing,
    available,
    options.ai?.debounceMs,
    options.ai?.minLength,
    options.ai?.prompt,
    options.ai?.context,
    options.ai?.recipe,
    options.maxInputCharacters,
    atLineEnd,
    task.environment,
    task.contextVersion,
    task.cancel,
  ]);
  function dismiss() {
    sequence.current++;
    baseline.current = null;
    task.cancel();
    setSuggestion('');
  }
  function accept(): { value: string; caret: number } | null {
    const base = baseline.current,
      current = latest.current;
    if (
      !available ||
      !suggestion ||
      !base ||
      current.composing ||
      !current.focused ||
      current.value !== base.value ||
      current.selection.start !== base.start ||
      current.selection.end !== base.end
    )
      return null;
    const value = base.value.slice(0, base.start) + suggestion + base.value.slice(base.end);
    const caret = base.start + suggestion.length;
    task.remember(value);
    dismiss();
    return { value, caret };
  }
  return {
    suggestion,
    accept,
    dismiss,
    enabled: available,
    status: task.status,
    error: task.error?.message ?? '',
  };
}
