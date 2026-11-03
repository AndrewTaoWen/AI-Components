import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIProvider,
  AIMemoryPanel,
  createAIMemory,
  rememberAIFact,
  forgetAIFact,
  fromFact,
  defineAIContext,
  useAITask,
  useAIFactExpiry,
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
it('publishes expiry and cancels a task borrowing an expired fact', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const memory = createAIMemory();
  rememberAIFact(memory, 'shared', {
    id: 'company',
    value: 'Temporary',
    source: { label: 'Session' },
    confirmed: true,
    expiresAt: new Date(now + 100).toISOString(),
  });
  let signal!: AbortSignal;
  const { result } = renderHook(
    () => {
      useAIFactExpiry();
      return useAITask({ recipe });
    },
    {
      wrapper: ({ children }) => (
        <AIProvider
          memory={memory}
          transport={{
            generate: async (_request, options) => {
              signal = options.signal;
              return new Promise(() => {});
            },
          }}
        >
          {children}
        </AIProvider>
      ),
    },
  );
  act(() => {
    void result.current.run({ action: 'write', text: '' });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(101);
  });
  expect(signal.aborted).toBe(true);
});
it('renders correction and scoped forgetting without touching another scope', () => {
  const memory = setup();
  memory.update('other', { private: 'preserve' });
  render(
    <AIProvider memory={memory}>
      <AIMemoryPanel />
    </AIProvider>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit memory fact company' }), {
    target: { value: 'Correct company' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and confirm company' }));
  expect(JSON.stringify(memory.getSnapshot().scopes.shared)).toContain('Correct company');
  fireEvent.click(screen.getByRole('button', { name: 'Forget this scope' }));
  expect(memory.getSnapshot().scopes.other.private).toBe('preserve');
  expect(memory.getSnapshot().scopes.shared).toBeUndefined();
});
