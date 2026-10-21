import { useState } from 'react';
import { AIFilterBar, type AIFilter, type AIFilterField } from '../../src/index.js';
import type { ComponentExample } from './registry.js';
const fields: AIFilterField[] = [
  { name: 'status', label: 'Status', type: 'text', operators: ['equals'] },
  { name: 'amount', label: 'Amount', type: 'number', operators: ['greater than', 'less than'] },
];
function Example() {
  const [value, setValue] = useState<AIFilter[]>([]);
  return (
    <>
      <p className="description">
        Describe a query, review its interpretation, then edit or remove individual filters.
      </p>
      <AIFilterBar fields={fields} value={value} onValueChange={setValue} />
      <p className="footnote">
        Try “unpaid invoices over $500.” The mock supports paid/unpaid and amounts over a number.
        Accepted filters use AND.
      </p>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </>
  );
}
export default {
  label: 'Filter bar',
  eyebrow: '07 / REFINE',
  title: 'Make intent visible',
  icon: '≋',
  Component: Example,
} satisfies ComponentExample;
