import { useState } from 'react';
import { AIFieldMapper, type AIFieldMapping } from '../../src/index.js';
import type { ComponentExample } from './registry.js';
const sources = ['Client Email', 'Full Name', 'Organization'];
const targets = [
  { value: 'email', label: 'Contact email' },
  { value: 'name', label: 'Contact name' },
  { value: 'company', label: 'Company' },
];
function Example() {
  const [value, setValue] = useState<AIFieldMapping[]>([]);
  return (
    <>
      <p className="description">
        Suggest a column mapping from headers, then review it before importing your data.
      </p>
      <AIFieldMapper sources={sources} targets={targets} value={value} onValueChange={setValue} />
      <p className="footnote">
        The mock matches these three sample headers. Only column names and target descriptions are
        sent; no file rows are read or uploaded.
      </p>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </>
  );
}
export default {
  label: 'Field mapper',
  eyebrow: '10 / CONNECT',
  title: 'Give imported columns a home',
  icon: '⇄',
  Component: Example,
} satisfies ComponentExample;
