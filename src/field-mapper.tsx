'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useAIProposal } from './use-ai-proposal.js';
import type { AIOption } from './option-values.js';
import type { AIConfig } from './types.js';

export interface AIFieldMapping {
  source: string;
  target: string;
}
export interface AIFieldMapperProps {
  sources: readonly string[];
  targets: readonly AIOption[];
  value: readonly AIFieldMapping[];
  onValueChange(mappings: AIFieldMapping[]): void;
  disabled?: boolean;
  ai?: AIConfig;
}

/** Suggest one-to-one column mappings without uploading file contents or importing rows. */
export function AIFieldMapper({
  sources,
  targets,
  value,
  onValueChange,
  disabled,
  ai = {},
}: AIFieldMapperProps) {
  const context = useMemo(
    () => ({
      ...ai.context,
      mapping: { sources, targets: targets.filter((target) => !target.disabled) },
    }),
    [ai.context, sources, targets],
  );
  const parse = useCallback(
    (data: unknown) => parseMappings(data, sources, targets),
    [sources, targets],
  );
  const { task, proposal, propose, reset, error } = useAIProposal({ ...ai, context }, parse);
  useEffect(reset, [sources, targets, value, disabled, reset]);

  function updateMapping(source: string, target: string) {
    if (disabled) return;
    const mappings = value.filter((mapping) => mapping.source !== source);
    if (target) mappings.push({ source, target });
    try {
      parse({ mappings });
    } catch {
      return;
    }
    reset();
    onValueChange(mappings);
  }

  return (
    <div className="aic-field">
      {task.enabled && (
        <button
          type="button"
          disabled={
            disabled ||
            !sources.length ||
            !targets.some((target) => !target.disabled) ||
            task.status === 'loading'
          }
          onClick={() =>
            propose({
              action: 'extract',
              text: sources.join('\n'),
              instruction:
                'Suggest a one-to-one mapping from context.mapping.sources to context.mapping.targets. Return data as { mappings: [{ source, target }] }. Use existing source names and target values only. Omit uncertain matches.',
            })
          }
        >
          {task.status === 'loading' ? 'Matching…' : 'Suggest mappings'}
        </button>
      )}
      {task.enabled && !disabled && proposal !== null && (
        <section className="aic-proposal" aria-label="Proposed mappings">
          <p>Review these mappings. Applying replaces the current mapping list.</p>
          <ul>
            {proposal.map((mapping) => (
              <li key={mapping.source}>
                {mapping.source} →{' '}
                {targets.find((target) => target.value === mapping.target)?.label ?? mapping.target}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              onValueChange(proposal);
              reset();
            }}
          >
            Apply mappings
          </button>
          <button type="button" onClick={reset}>
            Discard
          </button>
        </section>
      )}
      <div className="aic-mapping-rows">
        {sources.map((source) => (
          <label key={source}>
            {source}
            <select
              aria-label={`Map ${source}`}
              value={value.find((mapping) => mapping.source === source)?.target ?? ''}
              disabled={disabled}
              onChange={(event) => updateMapping(source, event.target.value)}
            >
              <option value="">Do not import</option>
              {targets.map((target) => (
                <option
                  key={target.value}
                  value={target.value}
                  disabled={
                    target.disabled ||
                    value.some(
                      (mapping) => mapping.target === target.value && mapping.source !== source,
                    )
                  }
                >
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div role="status" className="aic-status">
        {error}
      </div>
    </div>
  );
}

function parseMappings(
  data: unknown,
  sources: readonly string[],
  targets: readonly AIOption[],
): AIFieldMapping[] {
  if (!data || typeof data !== 'object' || !('mappings' in data) || !Array.isArray(data.mappings))
    throw new Error('Expected a list of field mappings.');
  const usedSources = new Set<string>();
  const usedTargets = new Set<string>();
  const allowedTargets = new Set(
    targets.filter((target) => !target.disabled).map((target) => target.value),
  );
  return data.mappings.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('source' in entry) ||
      !('target' in entry) ||
      typeof entry.source !== 'string' ||
      typeof entry.target !== 'string' ||
      !sources.includes(entry.source) ||
      !allowedTargets.has(entry.target)
    )
      throw new Error('The model returned an unknown or disabled field.');
    if (usedSources.has(entry.source) || usedTargets.has(entry.target))
      throw new Error('Each source and target can only be mapped once.');
    usedSources.add(entry.source);
    usedTargets.add(entry.target);
    return { source: entry.source, target: entry.target };
  });
}
