import { useState } from 'react';
import { AIRewriteMenu } from '../../src/index.js';
import type { ComponentExample } from './registry.js';
function Example() {
  const [text, setText] = useState(
    'Thank you for your message. We will review the details of your request and provide an update as soon as we have more information.',
  );
  return (
    <>
      <label className="field-label" htmlFor="rewrite-source">
        Your message
      </label>
      <textarea
        id="rewrite-source"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <AIRewriteMenu value={text} onValueChange={setText} />
      <p className="footnote">
        Works with an ordinary textarea. The mock shows a canned draft; real edits use your model
        adapter.
      </p>
    </>
  );
}
export default {
  label: 'Rewrite menu',
  eyebrow: '08 / POLISH',
  title: 'The right words, in context',
  icon: '✦',
  Component: Example,
} satisfies ComponentExample;
