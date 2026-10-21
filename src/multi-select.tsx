'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { parseOptionValues, type AIOption } from './option-values.js';
import { useAIProposal } from './use-ai-proposal.js';
import type { AIConfig } from './types.js';

export interface AIMultiSelectProps {
  value: readonly string[];
  onValueChange(values: string[]): void;
  options: readonly AIOption[];
  label?: string;
  name?: string;
  maxSelected?: number;
  disabled?: boolean;
  ai?: AIConfig;
}

/** Native checkboxes plus an optional natural-language batch selection assistant. */
export function AIMultiSelect({
  value,
  onValueChange,
  options,
  label = 'Choose options',
  name,
  maxSelected = Infinity,
  disabled,
  ai = {},
}: AIMultiSelectProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const context = useMemo(
    () => ({
      ...ai.context,
      options: options.filter((option) => !option.disabled),
      selected: value,
      selectionMode: 'multi',
      remainingSlots: Number.isFinite(maxSelected) ? Math.max(0, maxSelected - value.length) : null,
    }),
    [ai.context, options, value, maxSelected],
  );
  const parse = useCallback(
    (data: unknown) => {
      const matches = parseOptionValues(data, options).filter((match) => !value.includes(match));
      if (matches.length + value.length > maxSelected)
        throw new Error('Too many matches for the selection limit. Narrow your description.');
      return matches;
    },
    [options, value, maxSelected],
  );
  const { task, proposal, propose, reset, error } = useAIProposal({ ...ai, context }, parse);
  const full = value.length >= maxSelected;
  useEffect(reset, [query, value, options, disabled, maxSelected, reset]);

  function findMatches() {
    if (disabled || full || !query.trim()) return;
    void propose({
      action: 'select',
      text: query,
      instruction:
        'Find all relevant options in context.options. Return data as { values: string[] }. Exclude context.selected. Do not exceed remainingSlots when it is non-null.',
    });
  }

  return (
    <div className="aic-field">
      <fieldset disabled={disabled} className="aic-checkbox-options">
        <legend>{label}</legend>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              checked={value.includes(option.value)}
              disabled={option.disabled || (full && !value.includes(option.value))}
              onChange={(event) => {
                reset();
                onValueChange(
                  event.target.checked
                    ? [...value, option.value]
                    : value.filter((current) => current !== option.value),
                );
              }}
            />
            <span>
              {option.label}
              {option.description && <small>{option.description}</small>}
            </span>
          </label>
        ))}
      </fieldset>
      {task.enabled && (
        <>
          <label htmlFor={id}>Describe choices</label>
          <input
            id={id}
            value={query}
            disabled={disabled || full}
            aria-describedby={`${id}-status`}
            onChange={(event) => {
              reset();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                findMatches();
              }
              if (event.key === 'Escape') reset();
            }}
          />
          <button
            type="button"
            disabled={disabled || full || !query.trim() || task.status === 'loading'}
            onClick={findMatches}
          >
            {task.status === 'loading' ? 'Matching…' : 'Find matches'}
          </button>
        </>
      )}
      {task.enabled && !disabled && proposal !== null && (
        <section className="aic-proposal" aria-label="Proposed selections">
          {proposal.length === 0 ? (
            <p>No new matches found.</p>
          ) : (
            <>
              <p>Add these matches to your current selection:</p>
              <ul>
                {proposal.map((match) => (
                  <li key={match}>
                    {options.find((option) => option.value === match)?.label ?? match}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  task.remember([...value, ...proposal]);
                  onValueChange([...value, ...proposal]);
                  reset();
                }}
              >
                Add matches
              </button>
            </>
          )}
          <button type="button" onClick={reset}>
            Discard
          </button>
        </section>
      )}
      <div id={`${id}-status`} role="status" className="aic-status">
        {error || (full ? 'Selection limit reached.' : '')}
      </div>
    </div>
  );
}
