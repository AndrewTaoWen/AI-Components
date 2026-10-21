'use client';
import type { AIContextInspection } from './prediction.js';

function printable(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? '(not serializable)';
  } catch {
    return '(not serializable)';
  }
}
/** Display selected context and developer provenance without exposing unselected memory. */
export function AIContextInspector({
  inspection,
  label = 'Why this suggestion?',
}: {
  inspection: AIContextInspection | null;
  label?: string;
}) {
  if (!inspection) return null;
  return (
    <details className="aic-context-inspector">
      <summary>{label}</summary>
      <p>{inspection.purpose}</p>
      <p>
        Policy or recipe: {inspection.name} · Scope: {inspection.scope}
      </p>
      {inspection.expectedUse && <p>Expected use: {inspection.expectedUse}</p>}
      <dl>
        {Object.entries(inspection.sources).map(([key, source]) => (
          <div key={key}>
            <dt>
              {key} · {source}
            </dt>
            <dd>
              <pre>{printable(inspection.borrowed[key])}</pre>
            </dd>
          </div>
        ))}
      </dl>
      <p>
        Sources were selected by the application. They are not a claim about a model’s reasoning.
      </p>
    </details>
  );
}
