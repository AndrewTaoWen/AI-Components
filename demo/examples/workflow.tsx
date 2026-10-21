import { useState } from 'react';
import {
  AIFormFill,
  AIProvider,
  AIRewriteMenu,
  defineAIContext,
  fromAction,
  fromContext,
  fromMemory,
  useAIMemory,
  useAITask,
  type AIConfig,
  type AIFormField,
} from '../../src/index.js';
import type { ComponentExample } from './registry.js';

const fields: readonly AIFormField[] = [
  { name: 'name', label: 'Customer name' },
  { name: 'company', label: 'Company' },
];
const pageContext = { product: 'Acme Support' };
const customerConfig: AIConfig = {
  remember: { key: 'customer', action: 'customer.accepted', source: 'customer-form' },
};
const replyRecipe = defineAIContext({
  name: 'support.reply',
  purpose: 'Help a support agent reply to the currently accepted customer.',
  borrow: {
    customer: fromMemory('customer'),
    lastCustomerAction: fromAction('customer.accepted'),
    product: fromContext('product'),
  },
  instructions: ({ borrowed }) =>
    borrowed.customer
      ? 'Address the accepted customer. Use the supplied company name when relevant. Do not invent commitments.'
      : 'No customer has been accepted yet. Keep the reply generic; do not invent a name.',
  anticipate: ({ input }) =>
    input.action === 'complete'
      ? 'The agent may press Tab to append this to a reply. Return only a suffix.'
      : 'The agent will review the proposed text before sending a customer reply. Do not send anything.',
});
const replyConfig: AIConfig = {
  recipe: replyRecipe,
  remember: { key: 'reply', action: 'reply.accepted', source: 'reply-editor' },
};

function parseCustomer(data: unknown): { name?: string; company?: string } {
  if (!data || typeof data !== 'object') throw new Error('Expected customer details.');
  const result: { name?: string; company?: string } = {};
  for (const key of ['name', 'company'] as const) {
    if (!(key in data)) continue;
    const value = Reflect.get(data, key);
    if (typeof value !== 'string') throw new Error('Customer fields must be text.');
    result[key] = value;
  }
  return result;
}

function Workflow() {
  const { memory, actions, clearMemory } = useAIMemory();
  const [reply, setReply] = useState(
    'Thank you for reaching out. We are reviewing your request and will help with the next steps.',
  );
  const task = useAITask(replyConfig);
  const prepared = task.prepare({
    action: 'rewrite',
    text: reply,
    instruction: 'Make the text shorter while preserving meaning.',
  });
  return (
    <>
      <p className="description">
        A form remembers accepted customer details. A separate writing control borrows them for the
        next step.
      </p>
      <AIFormFill
        fields={fields}
        parse={parseCustomer}
        onApply={() => {}}
        ai={customerConfig}
        label="Customer details"
        placeholder={'Name: Alex Chen\nCompany: Northwind'}
      />
      <p className="field-label">Current workflow memory</p>
      <pre aria-label="Shared workflow memory">{JSON.stringify(memory, null, 2)}</pre>
      <p className="footnote">
        Accepted actions: {actions.map((action) => action.type).join(' → ') || 'none'}
      </p>
      <label className="field-label" htmlFor="workflow-reply">
        Customer reply
      </label>
      <textarea
        id="workflow-reply"
        value={reply}
        onChange={(event) => setReply(event.target.value)}
      />
      <AIRewriteMenu value={reply} onValueChange={setReply} ai={replyConfig} />
      <details className="aic-context-inspector">
        <summary>Inspect assembled request</summary>
        <pre>{JSON.stringify(prepared, null, 2)}</pre>
      </details>
      <button type="button" onClick={clearMemory}>
        Clear workflow memory
      </button>
      <p className="footnote">
        Mock mode uses accepted names in a canned reply. This is session memory scoped to this
        example; no message is sent.
      </p>
    </>
  );
}

function Example() {
  return (
    <AIProvider memoryScope="support-demo" context={pageContext}>
      <Workflow />
    </AIProvider>
  );
}
export default {
  label: 'Workflow memory',
  eyebrow: '12 / CONTEXT',
  title: 'Context follows the work',
  icon: '◎',
  Component: Example,
} satisfies ComponentExample;
