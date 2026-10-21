'use client';

import { useEffect, useRef, useState } from 'react';
import { useAITask } from './use-ai-task.js';
import type { AIConfig } from './types.js';

export interface AISuggestionField {
  key: string;
  label: string;
}
export interface AIChange {
  field: string;
  label: string;
  before: string;
  after: string;
  reason?: string;
}
export interface AISuggestionSource {
  name: string;
  description: string;
}
export interface AISuggestionOptions<T extends Record<string, string>> {
  value: T;
  onValueChange(value: NoInfer<T>): void;
  /** Only these top-level string fields may be proposed or changed. */
  fields: readonly (AISuggestionField & { key: keyof NoInfer<T> & string })[];
  ai?: AIConfig;
}
interface Proposal {
  changes: readonly AIChange[];
  sources: readonly AISuggestionSource[];
}

function parseChanges(
  data: unknown,
  value: Record<string, string>,
  fields: readonly AISuggestionField[],
): AIChange[] {
  if (!data || typeof data !== 'object' || !('changes' in data) || !Array.isArray(data.changes))
    throw new Error('Expected a changes array.');
  const allowed = new Map(fields.map((field) => [field.key, field.label]));
  if (allowed.size !== fields.length) throw new Error('Suggestion field keys must be unique.');
  const seen = new Set<string>();
  return data.changes.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid suggested change.');
    const { field, value: after, reason } = item as Record<string, unknown>;
    if (
      typeof field !== 'string' ||
      !allowed.has(field) ||
      !Object.hasOwn(value, field) ||
      typeof value[field] !== 'string' ||
      typeof after !== 'string' ||
      seen.has(field) ||
      (reason !== undefined && typeof reason !== 'string')
    )
      throw new Error('Suggestions must contain unique, allowed string fields.');
    seen.add(field);
    return value[field] === after
      ? []
      : [
          {
            field,
            label: allowed.get(field)!,
            before: value[field],
            after,
            ...(typeof reason === 'string' ? { reason } : {}),
          },
        ];
  });
}

/** Review one transaction over controlled string fields. No changes are applied during generation. */
export function useAISuggestion<T extends Record<string, string>>({
  value,
  onValueChange,
  fields,
  ai = {},
}: AISuggestionOptions<T>) {
  const task = useAITask(ai);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [undoChanges, setUndoChanges] = useState<readonly AIChange[] | null>(null);
  const sequence = useRef(0);
  const undoBinding = useRef(ai.remember);
  const latest = useRef(value);
  latest.current = value;
  // Compare contents so callers can pass inline field arrays and controlled objects.
  const valueSignature = JSON.stringify(value);
  const fieldSignature = JSON.stringify(fields);
  useEffect(() => {
    sequence.current++;
    task.cancel();
    setProposal(null);
    setError('');
  }, [
    valueSignature,
    fieldSignature,
    task.environment,
    task.contextVersion,
    ai.enabled,
    ai.prompt,
    ai.context,
    ai.recipe,
    task.cancel,
  ]);
  useEffect(() => {
    setUndoChanges(null);
  }, [task.environment, fieldSignature]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );

  function dismiss() {
    sequence.current++;
    task.cancel();
    setProposal(null);
    setError('');
  }

  async function suggest(instruction: string) {
    dismiss();
    if (!task.enabled) return;
    const requestId = sequence.current;
    const baseline = { ...value };
    try {
      if (
        new Set(fields.map((field) => field.key)).size !== fields.length ||
        fields.some(
          (field) => !Object.hasOwn(baseline, field.key) || typeof baseline[field.key] !== 'string',
        )
      )
        throw new Error('Suggestion fields must have unique keys and existing string values.');
      const input = {
        action: 'extract' as const,
        text: JSON.stringify({
          values: Object.fromEntries(fields.map(({ key }) => [key, baseline[key]])),
          fields,
        }),
        instruction: `${instruction}\nReturn data as {"changes":[{"field":"allowed field key","value":"new string value","reason":"brief explanation"}]}. Only change the supplied fields. Omit unchanged fields.`,
      };
      const prepared = task.prepare(input);
      const result = await task.run(input);
      if (
        !result ||
        requestId !== sequence.current ||
        JSON.stringify(latest.current) !== valueSignature
      )
        return;
      const changes = parseChanges(result.data, baseline, fields);
      const metadata = prepared.context?._ai as { sources?: Record<string, string> } | undefined;
      // Provenance comes from the developer's recipe, never a model's citation claims.
      const sources = Object.entries(metadata?.sources ?? {}).map(([name, description]) => ({
        name,
        description,
      }));
      setProposal({ changes, sources });
    } catch (cause) {
      if (requestId === sequence.current)
        setError(cause instanceof Error ? cause.message : 'Invalid suggestions.');
    }
  }

  function accept(selectedFields?: readonly string[]): boolean {
    if (!task.enabled || !proposal) return false;
    const selected = selectedFields ? new Set(selectedFields) : null;
    const changes = proposal.changes.filter((change) => !selected || selected.has(change.field));
    if (!changes.length) return false;
    if (changes.some((change) => latest.current[change.field] !== change.before)) {
      dismiss();
      setError('These fields changed. Generate fresh suggestions.');
      return false;
    }
    const next = { ...latest.current };
    for (const change of changes)
      Object.defineProperty(next, change.field, {
        value: change.after,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    // Recording may invalidate borrowed context. Save the transaction after that invalidation.
    task.remember(next);
    dismiss();
    undoBinding.current = ai.remember;
    setUndoChanges(changes);
    latest.current = next;
    onValueChange(next);
    return true;
  }

  const canUndo =
    !!undoChanges && undoChanges.every((change) => value[change.field] === change.after);
  function undo(): boolean {
    if (!undoChanges || undoChanges.some((change) => latest.current[change.field] !== change.after))
      return false;
    const next = { ...latest.current };
    for (const change of undoChanges)
      Object.defineProperty(next, change.field, {
        value: change.before,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    const binding = undoBinding.current;
    if (binding) {
      task.environment.memory.remember(
        binding.scope ?? task.environment.memoryScope,
        binding.key,
        binding.project ? binding.project(next) : next,
        {
          type: `${binding.action ?? `${binding.key}.accepted`}.undone`,
          source: binding.source,
        },
      );
    }
    dismiss();
    setUndoChanges(null);
    latest.current = next;
    onValueChange(next);
    return true;
  }

  return {
    changes: proposal?.changes ?? null,
    sources: proposal?.sources ?? [],
    suggest,
    accept,
    dismiss,
    undo,
    canUndo,
    status: task.status,
    error: error || task.error?.message || '',
    enabled: task.enabled,
    prepare: task.prepare,
  };
}
