import { useState } from 'react';
import {
  AIProvider,
  AIInlineTextarea,
  createAIMemory,
  defineAIContext,
  fromMemory,
} from '../../src/index.js';
import type { ComponentExample } from './registry.js';
const recipe = defineAIContext({
  name: 'support.inline',
  purpose: 'Complete a support reply using accepted customer context.',
  borrow: { customer: fromMemory('customer') },
  instructions: 'Return only a short single-line suffix. Do not repeat existing text.',
});
function Field() {
  const [value, setValue] = useState('Hi Alex, thanks for reaching out.');
  return (
    <>
      <p className="description">
        Place the caret at a line ending and pause. Tab accepts visible ghost text; Escape dismisses
        it. Shift+Tab keeps normal navigation.
      </p>
      <label htmlFor="inline-support">Support reply</label>
      <AIInlineTextarea
        id="inline-support"
        aria-label="Inline support reply"
        value={value}
        onValueChange={setValue}
        ai={{ autocomplete: true, recipe }}
      />
      <p className="footnote">
        The mock borrows accepted Alex/Northwind context. Suggestions are single-line and opt-in
        through this component. The textarea remains a native controlled input.
      </p>
    </>
  );
}
function Example() {
  const [memory] = useState(() =>
    createAIMemory({
      initial: { 'inline-demo': { customer: { name: 'Alex', company: 'Northwind' } } },
    }),
  );
  return (
    <AIProvider memory={memory} memoryScope="inline-demo">
      <Field />
    </AIProvider>
  );
}
export default {
  label: 'Inline completion',
  eyebrow: '16 / COMPLETE',
  title: 'Keep writing, right here',
  icon: '↹',
  Component: Example,
} satisfies ComponentExample;
