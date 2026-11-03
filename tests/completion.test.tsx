import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIProvider,
  AIInlineTextarea,
  createAIMemory,
  defineAIContext,
  fromMemory,
  useAICompletion,
} from '../src/index.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const recipe = defineAIContext({
  name: 'support',
  purpose: 'Complete reply',
  borrow: { customer: fromMemory('customer') },
});
async function advance() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
}
it('borrows context and accepts a bounded suffix only at the original caret', async () => {
  vi.useFakeTimers();
  const generate = vi.fn(async () => ({ text: ' Alex\nHidden second line' }));
  const memory = createAIMemory({ initial: { shared: { customer: 'Alex' } } });
  const { result, rerender } = renderHook(
    ({ start }) =>
      useAICompletion({
        value: 'Hello',
        selection: { start, end: start },
        focused: true,
        ai: { recipe },
      }),
    {
      initialProps: { start: 5 },
      wrapper: ({ children }) => (
        <AIProvider memory={memory} transport={{ generate }}>
          {children}
        </AIProvider>
      ),
    },
  );
  await advance();
  expect(result.current.suggestion).toBe(' Alex');
  expect(JSON.stringify(generate.mock.calls[0])).toContain('Alex');
  rerender({ start: 2 });
  expect(result.current.accept()).toBeNull();
});
function Input({ readOnly = false }: { readOnly?: boolean }) {
  const [value, setValue] = useState('Hello');
  return (
    <AIInlineTextarea
      aria-label="Reply"
      value={value}
      onValueChange={setValue}
      readOnly={readOnly}
    />
  );
}
it('accepts Tab, preserves Shift+Tab, and restores the caret', async () => {
  vi.useFakeTimers();
  render(
    <AIProvider transport={{ generate: async () => ({ text: ' world' }) }}>
      <Input />
    </AIProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Reply' }) as HTMLTextAreaElement;
  fireEvent.focus(input);
  input.setSelectionRange(5, 5);
  fireEvent.select(input);
  await advance();
  expect(screen.getByRole('status').textContent).toContain('Suggestion available');
  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
  expect(input.value).toBe('Hello');
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input.value).toBe('Hello world');
  expect(input.selectionStart).toBe(11);
});
it('dismisses Escape and suppresses composition and read-only generation', async () => {
  vi.useFakeTimers();
  const generate = vi.fn(async () => ({ text: ' world' }));
  const first = render(
    <AIProvider transport={{ generate }}>
      <Input />
    </AIProvider>,
  );
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.focus(input);
  input.setSelectionRange(5, 5);
  fireEvent.select(input);
  await advance();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.compositionStart(input);
  await advance();
  fireEvent.keyDown(input, { key: 'Tab', isComposing: true });
  expect(input.value).toBe('Hello');
  first.unmount();
  generate.mockClear();
  render(
    <AIProvider transport={{ generate }}>
      <Input readOnly />
    </AIProvider>,
  );
  fireEvent.focus(screen.getByRole('textbox'));
  await advance();
  expect(generate).not.toHaveBeenCalled();
});
it('rejects late completion after selected context changes', async () => {
  vi.useFakeTimers();
  let finish!: (result: { text: string }) => void;
  const memory = createAIMemory({ initial: { shared: { customer: 'Alex' } } });
  const { result } = renderHook(
    () =>
      useAICompletion({
        value: 'Hello',
        selection: { start: 5, end: 5 },
        focused: true,
        ai: { recipe },
      }),
    {
      wrapper: ({ children }) => (
        <AIProvider
          memory={memory}
          transport={{
            generate: () =>
              new Promise((resolve) => {
                finish = resolve;
              }),
          }}
        >
          {children}
        </AIProvider>
      ),
    },
  );
  await advance();
  act(() => memory.update('shared', { customer: 'New person' }));
  await act(async () => {
    finish({ text: ' stale' });
  });
  expect(result.current.suggestion).toBe('');
});
