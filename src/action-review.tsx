'use client';
import { useState } from 'react';
import type { AIActionProposal } from './use-ai-action.js';
import type { AIMemoryValue } from './memory.js';

export interface AIActionReviewProps {
  proposal: AIActionProposal<AIMemoryValue> | null;
  onAccept(selectedIds: readonly string[]): unknown;
  onDismiss(): unknown;
  onUndo?(): unknown;
  canUndo?: boolean;
  busy?: boolean;
  /** Keeps the attempted selection fixed after an uncertain execution failure. */
  retryPending?: boolean;
  error?: string;
}
function ProposalReview({
  proposal,
  busy,
  retryPending,
  onAccept,
  onDismiss,
}: AIActionReviewProps & { proposal: AIActionProposal }) {
  const [selected, setSelected] = useState(proposal.steps.map((step) => step.id));
  return (
    <section className="aic-action-review" aria-label="Review proposed action">
      <h3>{proposal.title}</h3>
      {proposal.description && <p>{proposal.description}</p>}
      {proposal.evidence?.length ? (
        <ul aria-label="Action evidence">
          {proposal.evidence.map((item, index) => (
            <li key={index}>
              {item.label}
              {item.reference ? ` · ${item.reference}` : ''}
              {item.revision !== undefined ? ` · revision ${item.revision}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <fieldset disabled={busy || retryPending}>
        <legend>Choose changes</legend>
        {proposal.steps.map((step) => (
          <label key={step.id}>
            <input
              type="checkbox"
              checked={selected.includes(step.id)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, step.id]
                    : selected.filter((id) => id !== step.id),
                )
              }
            />
            <span>{step.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="aic-action-buttons">
        <button
          type="button"
          disabled={busy || !selected.length}
          onClick={() => onAccept(selected)}
        >
          {retryPending ? 'Retry selected action' : `Apply action (${selected.length})`}
        </button>
        <button type="button" disabled={busy || retryPending} onClick={() => onDismiss()}>
          Dismiss action
        </button>
      </div>
      {retryPending && (
        <p>Execution may have completed. Retry keeps the same selection and mutation ID.</p>
      )}
    </section>
  );
}
/** Evidence is developer-supplied provenance, never a claim of verified model reasoning. */
export function AIActionReview(props: AIActionReviewProps) {
  return (
    <div className="aic-action-lifecycle" aria-busy={props.busy || undefined}>
      {props.proposal && (
        <ProposalReview key={JSON.stringify(props.proposal)} {...props} proposal={props.proposal} />
      )}
      {props.canUndo && props.onUndo && (
        <button type="button" disabled={props.busy} onClick={() => props.onUndo?.()}>
          Undo action
        </button>
      )}
      {props.error && <p role="alert">{props.error}</p>}
    </div>
  );
}
