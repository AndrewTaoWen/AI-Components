import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIProvider,
  AIMemoryPanel,
  createAIMemory,
  rememberAIFact,
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

it('rearms expiry beyond the native timer maximum', async () => {
  vi.useFakeTimers();
  const memory = createAIMemory();
  rememberAIFact(memory, 'shared', {
    id: 'long-lived',
    value: 'Temporary',
    source: { label: 'Test' },
    confirmed: true,
    expiresAt: new Date(Date.now() + 2_147_483_747).toISOString(),
  });
  renderHook(() => useAIFactExpiry(), {
    wrapper: ({ children }) => <AIProvider memory={memory}>{children}</AIProvider>,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_147_483_648);
  });
  expect(JSON.stringify(memory.getSnapshot())).toContain('long-lived');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(JSON.stringify(memory.getSnapshot())).not.toContain('Temporary');
});

it('refreshes the demo request preview after a fact correction', async () => {
  const { default: example } = await import('../demo/examples/facts.js');
  render(<example.Component />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit memory fact company' }), {
    target: { value: 'Northwind' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and confirm company' }));
  expect(screen.getByText(/"company": "Northwind"/).textContent).toContain('Northwind');
});
