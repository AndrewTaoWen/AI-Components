'use client';

import { forwardRef, useEffect, useId, useMemo, useState, type SelectHTMLAttributes } from 'react';
import { useAITask } from './use-ai-task.js';
import type { AIConfig } from './types.js';

export interface AISelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface AISelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'defaultValue' | 'onChange' | 'children' | 'multiple'
> {
  value: string;
  onValueChange(value: string): void;
  options: readonly AISelectOption[];
  ai?: AIConfig;
  placeholder?: string;
  searchLabel?: string;
  wrapperClassName?: string;
}

/** An ordinary select with optional semantic matching against its existing options. */
export const AISelect = forwardRef<HTMLSelectElement, AISelectProps>(function AISelect(
  {
    value,
    onValueChange,
    options,
    ai = {},
    placeholder = 'Choose an option',
    searchLabel = 'Describe an option',
    wrapperClassName,
    ...nativeProps
  },
  ref,
) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<string[] | null>(null);
  const [validationError, setValidationError] = useState('');
  const context = useMemo(
    () => ({
      ...ai.context,
      options: options
        .filter((option) => !option.disabled)
        .map(({ value, label, description }) => ({ value, label, description })),
    }),
    [ai.context, options],
  );
  const task = useAITask({ ...ai, context });
  const available = task.enabled && !nativeProps.disabled;
  const isLoading = task.status === 'loading';

  useEffect(() => {
    task.cancel();
    setMatches(null);
    setValidationError('');
  }, [
    query,
    value,
    options,
    available,
    task.environment,
    task.contextVersion,
    ai.prompt,
    ai.context,
    ai.recipe,
    task.cancel,
  ]);

  async function findMatches() {
    if (!available || !query.trim()) return;
    setMatches(null);
    setValidationError('');
    const result = await task.run({
      action: 'select',
      text: query,
      instruction:
        'Return data as { values: string[] }, ordered by relevance. Use only values from context.options. Return an empty array if nothing matches.',
    });
    if (!result) return;

    try {
      setMatches(parseMatches(result.data, options));
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Invalid option suggestions.');
    }
  }

  function selectValue(nextValue: string) {
    task.cancel();
    setMatches(null);
    setValidationError('');
    onValueChange(nextValue);
  }

  return (
    <div className={`aic-select ${wrapperClassName ?? ''}`}>
      <select
        {...nativeProps}
        ref={ref}
        value={value}
        onChange={(event) => selectValue(event.target.value)}
        aria-describedby={[nativeProps['aria-describedby'], `${id}-status`]
          .filter(Boolean)
          .join(' ')}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      {available && (
        <div className="aic-select-assistance">
          <label htmlFor={`${id}-query`}>{searchLabel}</label>
          <div className="aic-control-row">
            <input
              id={`${id}-query`}
              value={query}
              onChange={(event) => {
                task.cancel();
                setMatches(null);
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void findMatches();
                }
                if (event.key === 'Escape') {
                  task.cancel();
                  setMatches(null);
                  setValidationError('');
                }
              }}
            />
            <button type="button" disabled={isLoading || !query.trim()} onClick={findMatches}>
              {isLoading ? 'Finding…' : 'Find options'}
            </button>
          </div>
          {matches !== null && matches.length > 0 && (
            <ul className="aic-options" aria-label="Suggested options">
              {matches.map((match) => {
                const option = options.find((option) => option.value === match && !option.disabled);
                if (!option) return null;
                return (
                  <li key={match}>
                    <button
                      type="button"
                      onClick={() => {
                        task.remember(match);
                        selectValue(match);
                      }}
                    >
                      <strong>{option.label}</strong>
                      {option.description && <span>{option.description}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div id={`${id}-status`} role="status" className="aic-status">
        {validationError ||
          task.error?.message ||
          (matches?.length === 0 ? 'No matching options. Choose from the list.' : '')}
      </div>
    </div>
  );
});

function parseMatches(data: unknown, options: readonly AISelectOption[]): string[] {
  if (!data || typeof data !== 'object' || !('values' in data) || !Array.isArray(data.values)) {
    throw new Error('Expected a list of option values.');
  }
  const allowed = new Set(
    options.filter((option) => !option.disabled).map((option) => option.value),
  );
  const values: string[] = [];
  for (const value of data.values) {
    if (typeof value !== 'string' || !allowed.has(value)) {
      throw new Error('The model suggested an unavailable option.');
    }
    if (!values.includes(value)) values.push(value);
  }
  return values;
}
