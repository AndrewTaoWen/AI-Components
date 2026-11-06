import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIProvider,
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
