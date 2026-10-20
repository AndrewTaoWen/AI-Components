'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useAITask } from './use-ai-task.js';
import type { AIConfig } from './types.js';

export interface AIFormField {
  name: string;
  label: string;
  description?: string;
}

export interface AIFormFillProps<T extends object> {
  /** Whitelist of fields that may be proposed; other keys are rejected. */
  fields: readonly AIFormField[];
  /** Validate extracted model data into your application's patch type. */
  parse(data: unknown): T;
  /** Called only after the user accepts the reviewed proposal. */
  onApply(values: T): void;
  ai?: AIConfig;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  renderValue?(value: unknown, field: AIFormField): ReactNode;
}

/** Extract a proposed patch from pasted text without mutating the form until accepted. */
export function AIFormFill<T extends object>({
  fields,
  parse,
  onApply,
  ai = {},
  disabled,
  label = 'Paste text to fill this form',
  placeholder = 'Paste a message, contact details, or a short description…',
  className,
  renderValue = (value) => (typeof value === 'string' ? value : JSON.stringify(value)),
}: AIFormFillProps<T>) {
  const id = useId();
  const [source, setSource] = useState('');
  const [proposal, setProposal] = useState<T | null>(null);
  const [validationError, setValidationError] = useState('');
  const context = useMemo(() => ({ ...ai.context, fields }), [ai.context, fields]);
  const task = useAITask({ ...ai, context });
  const available = task.enabled && !disabled;
  const isLoading = task.status === 'loading';

  useEffect(() => {
    task.cancel();
    setProposal(null);
    setValidationError('');
  }, [
    source,
    fields,
    parse,
    available,
    task.environment,
    task.contextVersion,
    ai.prompt,
    ai.context,
    ai.recipe,
    task.cancel,
  ]);

  async function extractFields() {
    if (!available || !source.trim()) return;
    setProposal(null);
    setValidationError('');
    const result = await task.run({
      action: 'extract',
      text: source,
      instruction:
        'Return data as an object containing only names from context.fields. Extract only values present in the source text. Omit missing fields; never invent values.',
    });
    if (!result) return;

    try {
      validateFields(result.data, fields);
      const values = parse(result.data);
      // The parser can transform data, so validate its output as well.
      validateFields(values, fields);
      if (Object.keys(values).length === 0) throw new Error('No matching fields found.');
      setProposal(values);
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Invalid form values.');
    }
  }

  function discardProposal() {
    task.cancel();
    setProposal(null);
    setValidationError('');
  }

  function applyProposal() {
    if (!available || proposal === null) return;
    task.remember(proposal);
    onApply(proposal);
    setProposal(null);
  }

  return (
    <div className={`aic-form-fill ${className ?? ''}`}>
      <label htmlFor={`${id}-source`}>{label}</label>
      <textarea
        id={`${id}-source`}
        value={source}
        rows={4}
        placeholder={placeholder}
        disabled={!available}
        aria-describedby={`${id}-status`}
        onChange={(event) => {
          discardProposal();
          setSource(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') discardProposal();
        }}
      />
      <button
        type="button"
        disabled={!available || isLoading || !source.trim()}
        onClick={extractFields}
      >
        {isLoading ? 'Extracting…' : 'Suggest field values'}
      </button>

      {available && proposal !== null && (
        <section className="aic-proposal" aria-label="Proposed form values">
          <p>Review these values before applying them to your form.</p>
          <dl>
            {fields
              .filter((field) => Object.hasOwn(proposal, field.name))
              .map((field) => (
                <div key={field.name}>
                  <dt>{field.label}</dt>
                  <dd>{renderValue(Reflect.get(proposal, field.name), field)}</dd>
                </div>
              ))}
          </dl>
          <div className="aic-control-row">
            <button type="button" onClick={applyProposal}>
              Apply values
            </button>
            <button type="button" onClick={discardProposal}>
              Discard
            </button>
          </div>
        </section>
      )}
      <div id={`${id}-status`} role="status" className="aic-status">
        {validationError ||
          task.error?.message ||
          (!task.enabled ? 'AI assistance is disabled.' : '')}
      </div>
    </div>
  );
}

function validateFields(
  data: unknown,
  fields: readonly AIFormField[],
): asserts data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Expected an object of form values.');
  }
  const allowed = new Set(fields.map((field) => field.name));
  for (const key of Object.keys(data)) {
    if (!allowed.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new Error('The model returned an unsupported field.');
    }
  }
}
