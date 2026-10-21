import { useState } from 'react';
import {
  AIChangePreview,
  createAIMemory,
  AIProvider,
  defineAIContext,
  fromMemory,
  useAISuggestion,
  type AIConfig,
} from '../../src/index.js';
import type { ComponentExample } from './registry.js';

const fields = [
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'reply', label: 'Reply' },
] as const;
const ai: AIConfig = {
  recipe: defineAIContext({
    name: 'support.triage',
    purpose: 'Suggest the next fields in a support workflow for human review.',
    borrow: { customer: fromMemory('customer') },
    instructions: 'Use the customer context when relevant. Do not promise refunds or resolutions.',
    anticipate: () => 'The agent will review and selectively apply these fields. Nothing is sent.',
  }),
  remember: { key: 'triage', action: 'triage.accepted', source: 'support-form' },
};
const initial = { category: 'Uncategorized', priority: 'Normal', reply: '' };
function Suggestions() {
  const [value, setValue] = useState(initial);
  const suggestion = useAISuggestion({ value, onValueChange: setValue, fields, ai });
  return (
    <>
      <p className="description">
        Review the next step across an ordinary form. Keep the changes you want, then undo the
        accepted batch in one click.
      </p>
      <p className="footnote">
        Customer context: Alex Chen at Northwind. Request: “I was charged twice for my
        subscription.”
      </p>
      <div className="aic-field">
        {fields.map((field) => (
          <label key={field.key} className="aic-suggestion-input">
            <span className="field-label">{field.label}</span>
            <input
              value={value[field.key]}
              onChange={(event) => setValue({ ...value, [field.key]: event.target.value })}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={!suggestion.enabled || suggestion.status === 'loading'}
          onClick={() =>
            suggestion.suggest(
              'Triage the duplicate subscription charge and draft a short customer reply.',
            )
          }
        >
          {suggestion.status === 'loading' ? 'Thinking…' : 'Suggest next steps'}
        </button>
      </div>
      <AIChangePreview
        changes={suggestion.changes}
        sources={suggestion.sources}
        onAccept={suggestion.accept}
        onDismiss={suggestion.dismiss}
        onUndo={suggestion.undo}
        canUndo={suggestion.canUndo}
      />
      <p role="status" className="aic-status">
        {suggestion.error}
      </p>
      <p className="footnote">
        Deterministic mock suggestions. Unchecked changes are discarded when you apply a batch.
        Editing an applied field prevents undo from overwriting it.
      </p>
    </>
  );
}
const contextMemory = { 'triage-demo': { customer: { name: 'Alex Chen', company: 'Northwind' } } };
// Keep this example's initial context independent of other demo workflows.
function Example() {
  const [memory] = useState(() => createAIMemory({ initial: contextMemory }));
  return (
    <AIProvider memory={memory} memoryScope="triage-demo">
      <Suggestions />
    </AIProvider>
  );
}
export default {
  label: 'Change preview',
  eyebrow: '13 / SUGGESTIONS',
  title: 'Review the next step',
  icon: '⇥',
  Component: Example,
} satisfies ComponentExample;
