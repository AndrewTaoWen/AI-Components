'use client';

import { useEffect, useState } from 'react';
import type { AIChange, AISuggestionSource } from './use-ai-suggestion.js';

export interface AIChangePreviewProps {
  /** null hides the proposal; an empty array shows a no-changes message. */
  changes: readonly AIChange[] | null;
  sources?: readonly AISuggestionSource[];
  onAccept(fields: readonly string[]): void;
  onDismiss(): void;
  onUndo?(): void;
  canUndo?: boolean;
  disabled?: boolean;
  label?: string;
}

/** An optional review UI; the headless hook works with application-owned previews too. */
export function AIChangePreview({
  changes,
  sources = [],
  onAccept,
  onDismiss,
  onUndo,
  canUndo,
  disabled,
  label = 'Suggested changes',
}: AIChangePreviewProps) {
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  useEffect(() => setExcluded([]), [changes]);
  const selected =
    changes?.filter((change) => !excluded.includes(change.field)).map((change) => change.field) ??
    [];
  return (
    <div className="aic-field aic-change-preview">
      {changes !== null && (
        <section className="aic-proposal" aria-label={label}>
          <fieldset disabled={disabled} className="aic-change-fields">
            <legend>{label}</legend>
            {changes.length === 0 && <p>No changes suggested.</p>}
            {changes.map((change) => (
              <label key={change.field} className="aic-change-row">
                <input
                  type="checkbox"
                  checked={!excluded.includes(change.field)}
                  onChange={(event) =>
                    setExcluded((previous) =>
                      event.target.checked
                        ? previous.filter((key) => key !== change.field)
                        : [...previous, change.field],
                    )
                  }
                />
                <span>
                  <strong>{change.label}</strong>
                  <span className="aic-change-before">
                    <span className="aic-change-caption">Before: </span>
                    <del>{change.before || '(empty)'}</del>
                  </span>
                  <span className="aic-change-after">
                    <span className="aic-change-caption">After: </span>
                    <ins>{change.after || '(empty)'}</ins>
                  </span>
                  {change.reason && <small>{change.reason}</small>}
                </span>
              </label>
            ))}
          </fieldset>
          {sources.length > 0 && (
            <div className="aic-change-sources">
              <p>Context supplied to this request</p>
              <ul>
                {sources.map((source) => (
                  <li key={source.name}>
                    {source.name}: <code>{source.description}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="aic-control-row">
            <button
              type="button"
              disabled={disabled || !selected.length}
              onClick={() => onAccept(selected)}
            >
              Apply selected ({selected.length})
            </button>
            <button type="button" disabled={disabled} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </section>
      )}
      {onUndo && (
        <button type="button" disabled={disabled || !canUndo} onClick={onUndo}>
          Undo AI changes
        </button>
      )}
    </div>
  );
}
