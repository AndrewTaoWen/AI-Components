import { useState } from 'react';
import {
  AIProvider,
  AIRewriteMenu,
  AIMemoryPanel,
  createAIMemory,
  defineAIContext,
  fromFact,
  rememberAIFact,
  useAITask,
} from '../../src/index.js';
import type { ComponentExample } from './registry.js';
const recipe = defineAIContext({
  name: 'facts.reply',
  purpose: 'Use the confirmed company name.',
  borrow: { company: fromFact('company') },
});
function Inspector() {
  const task = useAITask({ recipe });
  const [text, setText] = useState('Thanks for contacting our company.');
  return (
    <>
      <AIMemoryPanel />
      <AIRewriteMenu value={text} onValueChange={setText} ai={{ recipe }} />
      <pre>{JSON.stringify(task.prepare({ action: 'write', text }).context, null, 2)}</pre>
    </>
  );
}
function Example() {
  const [memory] = useState(() => {
    const store = createAIMemory();
    rememberAIFact(store, 'facts-demo', {
      id: 'company',
      value: 'Old company name',
      source: { label: 'Imported profile' },
      confirmed: true,
    });
    return store;
  });
  return (
    <AIProvider memory={memory} memoryScope="facts-demo">
      <Inspector />
    </AIProvider>
  );
}
export default {
  label: 'Memory controls',
  eyebrow: '15 / MEMORY',
  title: 'Keep your context accurate',
  icon: '◎',
  Component: Example,
} satisfies ComponentExample;
