'use client';

import { useEffect, useId } from 'react';
import { useAIProposal } from './use-ai-proposal.js';
import type { AIConfig, AIResponse } from './types.js';

export interface AIRewriteAction {
  id: string;
  label: string;
  instruction: string;
}
export interface AIRewriteMenuProps {
  value: string;
  onValueChange(value: string): void;
  actions?: readonly AIRewriteAction[];
  disabled?: boolean;
  ai?: AIConfig;
  label?: string;
}
const DEFAULT_ACTIONS: readonly AIRewriteAction[] = [
  {
    id: 'shorten',
    label: 'Shorten',
    instruction: 'Make the text shorter while preserving meaning.',
  },
  { id: 'clarify', label: 'Clarify', instruction: 'Improve clarity without inventing facts.' },
  { id: 'friendly', label: 'Friendlier', instruction: 'Rewrite with a warm, friendly tone.' },
  {
    id: 'formal',
    label: 'More formal',
    instruction: 'Rewrite using professional, formal language.',
  },
];
function parseRewrite(_data: unknown, response: AIResponse): string {
  if (typeof response.text !== 'string' || !response.text.trim())
    throw new Error('The model returned an empty rewrite.');
  return response.text;
}

/** Native action buttons that can accompany any controlled text field. */
export function AIRewriteMenu({
  value,
  onValueChange,
  actions = DEFAULT_ACTIONS,
  disabled,
  ai = {},
  label = 'Rewrite actions',
}: AIRewriteMenuProps) {
  const id = useId();
  const { task, proposal, propose, reset, error } = useAIProposal(ai, parseRewrite);
  const available = task.enabled && !disabled;
  useEffect(reset, [value, actions, disabled, reset]);
  return (
    <div className="aic-field" aria-describedby={id}>
      <div role="group" aria-label={label} className="aic-control-row aic-wrap">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!available || !value.trim() || task.status === 'loading'}
            onClick={() =>
              propose({ action: 'rewrite', text: value, instruction: action.instruction })
            }
          >
            {action.label}
          </button>
        ))}
      </div>
      {available && proposal !== null && (
        <section aria-label="Proposed rewrite" className="aic-proposal">
          <p className="aic-draft">{proposal}</p>
          <button
            type="button"
            onClick={() => {
              onValueChange(proposal);
              reset();
            }}
          >
            Use rewrite
          </button>
          <button type="button" onClick={reset}>
            Discard
          </button>
        </section>
      )}
      <div id={id} role="status" className="aic-status">
        {error ||
          (task.status === 'loading'
            ? 'Rewriting…'
            : !task.enabled
              ? 'AI assistance is disabled.'
              : '')}
      </div>
    </div>
  );
}
