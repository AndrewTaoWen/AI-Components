'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useAIProposal } from './use-ai-proposal.js';
import type { AIConfig } from './types.js';

export interface AIFilterField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date';
  operators: readonly string[];
}
export interface AIFilter {
  field: string;
  operator: string;
  value: string | number;
}
export interface AIFilterBarProps {
  fields: readonly AIFilterField[];
  value: readonly AIFilter[];
  onValueChange(filters: AIFilter[]): void;
  ai?: AIConfig;
  disabled?: boolean;
  label?: string;
  /** Optional application constraints, applied before a proposal can be accepted. */
  validate?(filters: AIFilter[]): void;
}

export function AIFilterBar({
  fields,
  value,
  onValueChange,
  ai = {},
  disabled,
  label = 'Describe filters',
  validate,
}: AIFilterBarProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const context = useMemo(() => ({ ...ai.context, fields }), [ai.context, fields]);
  const parse = useCallback(
    (data: unknown) => {
      const filters = parseFilters(data, fields);
      validate?.(filters);
      return filters;
    },
    [fields, validate],
  );
  const { task, proposal, propose, reset, error } = useAIProposal({ ...ai, context }, parse);
  useEffect(reset, [value, query, fields, disabled, reset]);

  function updateFilter(index: number, patch: Partial<AIFilter>) {
    const next = value.map((filter, i) => (i === index ? { ...filter, ...patch } : filter));
    try {
      parse({ filters: next });
    } catch {
      return;
    }
    reset();
    onValueChange(next);
  }

  return (
    <div className="aic-field">
      {task.enabled && (
        <>
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            value={query}
            disabled={disabled}
            aria-describedby={`${id}-status`}
            onChange={(event) => {
              reset();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (!disabled && query.trim())
                  void propose({
                    action: 'search',
                    text: query,
                    instruction:
                      'Return data as { filters: [{ field, operator, value }] }. Use only context.fields and their allowed operators. Values must match field types. All filters are combined with AND.',
                  });
              }
            }}
          />
          <button
            type="button"
            disabled={disabled || !query.trim() || task.status === 'loading'}
            onClick={() =>
              propose({
                action: 'search',
                text: query,
                instruction:
                  'Return data as { filters: [{ field, operator, value }] }. Use only context.fields and their allowed operators. Values must match field types. All filters are combined with AND.',
              })
            }
          >
            {task.status === 'loading' ? 'Interpreting…' : 'Suggest filters'}
          </button>
        </>
      )}
      {task.enabled && !disabled && proposal !== null && (
        <section className="aic-proposal" aria-label="Proposed filters">
          <p>Replace current filters with this proposal (AND):</p>
          <ul>
            {proposal.map((filter, index) => (
              <li key={index}>
                {fields.find((field) => field.name === filter.field)?.label} {filter.operator}{' '}
                {filter.value}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              task.remember(proposal);
              onValueChange(proposal);
              reset();
            }}
          >
            Apply filters
          </button>
          <button type="button" onClick={reset}>
            Discard
          </button>
        </section>
      )}
      <ul className="aic-filter-list" aria-label="Active filters">
        {value.map((filter, index) => {
          const field = fields.find((field) => field.name === filter.field);
          if (!field) return null;
          return (
            <li key={index}>
              <span>{field.label}</span>
              <select
                aria-label={`${field.label} operator ${index + 1}`}
                value={filter.operator}
                disabled={disabled}
                onChange={(event) => updateFilter(index, { operator: event.target.value })}
              >
                {field.operators.map((operator) => (
                  <option key={operator}>{operator}</option>
                ))}
              </select>
              <input
                aria-label={`${field.label} value ${index + 1}`}
                type={field.type === 'text' ? 'text' : field.type}
                value={filter.value}
                disabled={disabled}
                onChange={(event) => {
                  if (field.type === 'number' && event.target.value === '') return;
                  updateFilter(index, {
                    value:
                      field.type === 'number' ? Number(event.target.value) : event.target.value,
                  });
                }}
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${field.label} filter ${index + 1}`}
                onClick={() => {
                  reset();
                  onValueChange(value.filter((_, i) => i !== index));
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <div id={`${id}-status`} role="status" className="aic-status">
        {error}
      </div>
    </div>
  );
}

function parseFilters(data: unknown, fields: readonly AIFilterField[]): AIFilter[] {
  if (!data || typeof data !== 'object' || !('filters' in data) || !Array.isArray(data.filters))
    throw new Error('Expected a list of filters.');
  return data.filters.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('field' in entry) ||
      !('operator' in entry) ||
      !('value' in entry)
    )
      throw new Error('Invalid filter.');
    const field = fields.find((field) => field.name === entry.field);
    if (!field || typeof entry.operator !== 'string' || !field.operators.includes(entry.operator))
      throw new Error('Unsupported filter field or operator.');
    if (
      field.type === 'number'
        ? typeof entry.value !== 'number' || !Number.isFinite(entry.value)
        : typeof entry.value !== 'string'
    )
      throw new Error('Filter value has the wrong type.');
    if (
      field.type === 'date' &&
      (typeof entry.value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.value) ||
        !Number.isFinite(Date.parse(entry.value)) ||
        new Date(entry.value).toISOString().slice(0, 10) !== entry.value)
    )
      throw new Error('Invalid date filter.');
    return { field: field.name, operator: entry.operator, value: entry.value as string | number };
  });
}
