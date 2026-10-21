import { useState } from 'react';
import { AIMultiSelect } from '../../src/index.js';
import type { ComponentExample } from './registry.js';
const options = [
  { value: 'maya', label: 'Maya', description: 'Design · Toronto' },
  { value: 'noah', label: 'Noah', description: 'Design · Toronto' },
  { value: 'emma', label: 'Emma', description: 'Engineering · Montreal' },
];
function Example() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <p className="description">
        Choose people individually or describe a group, then review the proposed additions.
      </p>
      <AIMultiSelect
        options={options}
        value={value}
        onValueChange={setValue}
        label="Invite teammates"
        maxSelected={3}
        name="invitees"
      />
      <p className="footnote">
        Try “designers in Toronto.” The mock recognizes design and engineering keywords. No
        invitations are sent.
      </p>
    </>
  );
}
export default {
  label: 'Multi-select',
  eyebrow: '11 / GROUP',
  title: 'Choose a group in one phrase',
  icon: '☷',
  Component: Example,
} satisfies ComponentExample;
