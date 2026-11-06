import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIProvider,
  createAIMemory,
  rememberAIFact,
  forgetAIFact,
  expireAIFacts,
  fromFact,
  defineAIContext,
  useAITask,
} from '../src/index.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup() {
  const memory = createAIMemory();
  rememberAIFact(memory, 'shared', {
    id: 'company',
    value: 'Old name',
    source: { label: 'Profile' },
    confirmed: true,
  });
  return memory;
}
const recipe = defineAIContext({
  name: 'reply',
  purpose: 'Use company',
  borrow: { company: fromFact('company') },
});
it('uses corrections and forget operations in subsequent requests without borrowing unconfirmed facts', () => {
  const memory = setup();
  const { result } = renderHook(() => useAITask({ recipe }), {
    wrapper: ({ children }) => <AIProvider memory={memory}>{children}</AIProvider>,
  });
  expect(JSON.stringify(result.current.prepare({ action: 'write', text: '' }))).toContain(
    'Old name',
  );
  act(() => {
    rememberAIFact(memory, 'shared', {
      id: 'company',
      value: 'New name',
      source: { label: 'Correction' },
      confirmed: true,
    });
  });
  expect(JSON.stringify(result.current.prepare({ action: 'write', text: '' }))).toContain(
    'New name',
  );
  act(() => {
    forgetAIFact(memory, 'shared', 'company');
  });
  expect(JSON.stringify(result.current.prepare({ action: 'write', text: '' }))).not.toContain(
    'New name',
  );
  act(() => {
    rememberAIFact(memory, 'shared', {
      id: 'company',
      value: 'Unconfirmed',
      source: { label: 'Suggestion' },
      confirmed: false,
    });
  });
  expect(JSON.stringify(result.current.prepare({ action: 'write', text: '' }))).not.toContain(
    'Unconfirmed',
  );
});

it('filters expired facts, sweeps only the selected scope and retains provenance on correction', () => {
  vi.useFakeTimers();
  const now = Date.now();
  const memory = setup();
  rememberAIFact(
    memory,
    'shared',
    {
      id: 'company',
      value: 'Corrected',
      source: { label: 'Correction' },
      confirmed: true,
      expiresAt: new Date(now + 100).toISOString(),
    },
    now + 1,
  );
  rememberAIFact(memory, 'other', {
    id: 'company',
    value: 'Private',
    source: { label: 'Other' },
    confirmed: true,
  });
  const { result } = renderHook(() => useAITask({ recipe }), {
    wrapper: ({ children }) => <AIProvider memory={memory}>{children}</AIProvider>,
  });
  const facts = memory.getSnapshot().scopes.shared.aiManagedFacts as Record<
    string,
    { createdAt: string; source: { label: string } }
  >;
  expect(facts.company.createdAt).toBe(new Date(now).toISOString());
  expect(facts.company.source.label).toBe('Correction');
  vi.setSystemTime(now + 101);
  expect(JSON.stringify(result.current.prepare({ action: 'write', text: '' }))).not.toContain(
    'Corrected',
  );
  expect(expireAIFacts(memory, 'shared')).toBe(1);
  expect(JSON.stringify(memory.getSnapshot().scopes.other)).toContain('Private');
});
