import { useState } from 'react';
import { AITagInput } from '../../src/index.js';
import type { ComponentExample } from './registry.js';

const options = [
  { value: 'billing', label: 'Billing' },
  { value: 'account', label: 'Account access' },
  { value: 'urgent', label: 'Urgent' },
];
function Example() {
  const [value, setValue] = useState<string[]>([]);
  const [text, setText] = useState('Urgent: I was charged twice on my invoice.');
  return (
    <>
      <label className="field-label" htmlFor="ticket">
        Ticket description
      </label>
      <textarea id="ticket" value={text} onChange={(event) => setText(event.target.value)} />
      <AITagInput
        value={value}
        onValueChange={setValue}
        text={text}
        options={options}
        maxTags={3}
      />
      <p className="footnote">
        Mock mode recognizes invoice, login, and urgent keywords. Suggestions require a click to
        add.
      </p>
    </>
  );
}
export default {
  label: 'Tag input',
  eyebrow: '06 / ORGANIZE',
  title: 'Tag content with a little help',
  icon: '#',
  Component: Example,
} satisfies ComponentExample;
