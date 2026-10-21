'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';
import { parseOptionValues, type AIOption } from './option-values.js';
import { useAIProposal } from './use-ai-proposal.js';
import type { AIConfig } from './types.js';

export interface AITagInputProps {
  value: readonly string[];
  onValueChange(values: string[]): void;
  options: readonly AIOption[];
  /** Content to classify, provided by the application. */
  text: string;
  label?: string;
  name?: string;
  maxTags?: number;
  disabled?: boolean;
  ai?: AIConfig;
  className?: string;
}

export function AITagInput({
  value,
  onValueChange,
  options,
  text,
  label = 'Tags',
  name,
  maxTags = Infinity,
  disabled,
  ai = {},
  className,
}: AITagInputProps) {
  const id = useId();
  const context = useMemo(
    () => ({
      ...ai.context,
      options: options.filter((option) => !option.disabled),
      selected: value,
    }),
    [ai.context, options, value],
  );
  const parse = useCallback(
    (data: unknown) => parseOptionValues(data, options).filter((tag) => !value.includes(tag)),
    [options, value],
  );
  const { task, proposal, reset, propose, error } = useAIProposal({ ...ai, context }, parse);
  const full = value.length >= maxTags;
  useEffect(reset, [text, value, options, maxTags, disabled, reset]);

  function addTag(tag: string, remember = false) {
    if (
      disabled ||
      full ||
      value.includes(tag) ||
      !options.some((option) => option.value === tag && !option.disabled)
    )
      return;
    if (remember) task.remember([...value, tag]);
    reset();
    onValueChange([...value, tag]);
  }

  return (
    <div className={`aic-field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <ul className="aic-chips" aria-label="Selected tags">
        {value.map((tag) => (
          <li key={tag}>
            <span>{options.find((option) => option.value === tag)?.label ?? tag}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${options.find((option) => option.value === tag)?.label ?? tag}`}
              onClick={() => {
                reset();
                onValueChange(value.filter((current) => current !== tag));
              }}
            >
              ×
            </button>
            {name && <input type="hidden" name={name} value={tag} disabled={disabled} />}
          </li>
        ))}
      </ul>
      <select
        id={id}
        value=""
        disabled={disabled || full}
        onChange={(event) => addTag(event.target.value)}
        aria-describedby={`${id}-status`}
      >
        <option value="">Add a tag…</option>
        {options
          .filter((option) => !value.includes(option.value))
          .map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
      </select>
      {task.enabled && (
        <button
          type="button"
          disabled={disabled || full || !text.trim() || task.status === 'loading'}
          onClick={() =>
            propose({
              action: 'select',
              text,
              instruction:
                'Suggest relevant tags from context.options. Return data as { values: string[] }. Exclude context.selected.',
            })
          }
        >
          {task.status === 'loading' ? 'Suggesting…' : 'Suggest tags'}
        </button>
      )}
      {!disabled && task.enabled && proposal !== null && (
        <div aria-label="Suggested tags" className="aic-proposal">
          {proposal.length === 0 ? (
            <p>No new tags found.</p>
          ) : (
            proposal.map((tag) => (
              <button key={tag} type="button" disabled={full} onClick={() => addTag(tag, true)}>
                {options.find((option) => option.value === tag)?.label ?? tag}
              </button>
            ))
          )}
        </div>
      )}
      <div id={`${id}-status`} role="status" className="aic-status">
        {error || (full ? 'Tag limit reached.' : '')}
      </div>
    </div>
  );
}
