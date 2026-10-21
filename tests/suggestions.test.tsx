import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIChangePreview,
  AIProvider,
  createAIMemory,
  defineAIContext,
  fromMemory,
  useAISuggestion,
  type AIConfig,
  type AIResponse,
  type AITransport,
} from '../src/index.js';
afterEach(cleanup);
const fields = [
  { key: 'category', label: 'Category' },
  { key: 'reply', label: 'Reply' },
] as const;
const initial = { category: 'None', reply: 'Original', notes: 'Manual note' };
const response = {
  text: '',
  data: {
    changes: [
      { field: 'category', value: 'Billing', reason: 'A charge issue.' },
      { field: 'reply', value: 'Hello Alex' },
    ],
  },
};
function setup(generate: AITransport['generate'] = async () => response, ai: AIConfig = {}) {
  const memory = createAIMemory({ initial: { shared: { customer: 'Alex' } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AIProvider transport={{ generate }} memory={memory}>
      {children}
    </AIProvider>
  );
  const hook = renderHook(
    () => {
      const [value, setValue] = useState(initial);
      const suggestion = useAISuggestion({ value, onValueChange: setValue, fields, ai });
      return { value, setValue, ...suggestion };
    },
    { wrapper },
  );
  return { ...hook, memory };
}
it('reviews a batch, partially applies it, and undoes while preserving unrelated edits', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.suggest('Triage');
  });
  expect(result.current.value).toEqual(initial);
  expect(result.current.changes).toHaveLength(2);
  act(() => {
    result.current.accept(['category']);
  });
  expect(result.current.value).toEqual({ ...initial, category: 'Billing' });
  expect(result.current.changes).toBeNull();
  expect(result.current.canUndo).toBe(true);
  act(() => {
    result.current.setValue({ ...result.current.value, notes: 'New manual note' });
  });
  act(() => {
    expect(result.current.undo()).toBe(true);
  });
  expect(result.current.value).toEqual({ ...initial, notes: 'New manual note' });
  expect(result.current.canUndo).toBe(false);
});
it('refuses undo after an applied field has been manually changed', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.suggest('Triage');
  });
  act(() => {
    result.current.accept();
  });
  act(() => {
    result.current.setValue({ ...result.current.value, reply: 'My edit' });
  });
  expect(result.current.canUndo).toBe(false);
  act(() => {
    expect(result.current.undo()).toBe(false);
  });
  expect(result.current.value.reply).toBe('My edit');
});
it('records only accepted values, and records undo as a separate action', async () => {
  const { result, memory } = setup(undefined, {
    remember: { key: 'form', action: 'form.accepted' },
  });
  await act(async () => {
    await result.current.suggest('Triage');
  });
  expect(memory.getSnapshot().actions).toHaveLength(0);
  act(() => {
    result.current.dismiss();
  });
  expect(memory.getSnapshot().actions).toHaveLength(0);
  await act(async () => {
    await result.current.suggest('Triage');
  });
  act(() => {
    result.current.accept(['category']);
  });
  expect(memory.getSnapshot().scopes.shared.form).toEqual({ ...initial, category: 'Billing' });
  act(() => {
    result.current.undo();
  });
  expect(memory.getSnapshot().scopes.shared.form).toEqual(initial);
  expect(memory.getSnapshot().actions.map((a) => a.type)).toEqual([
    'form.accepted',
    'form.accepted.undone',
  ]);
});
it('uses recipe provenance and invalidates suggestions when a borrowed source changes', async () => {
  const generate = vi.fn<AITransport['generate']>(async () => response);
  const ai = {
    recipe: defineAIContext({
      name: 'triage',
      purpose: 'Triage a request',
      borrow: { customer: fromMemory('customer') },
    }),
  };
  const { result, memory } = setup(generate, ai);
  await act(async () => {
    await result.current.suggest('Triage');
  });
  expect(result.current.sources).toEqual([
    { name: 'customer', description: 'memory:current.customer' },
  ]);
  expect(generate.mock.calls[0][0].context?._ai).toMatchObject({ borrowed: { customer: 'Alex' } });
  act(() => {
    memory.update('shared', { customer: 'Sam' });
  });
  expect(result.current.changes).toBeNull();
});
it('ignores late results after a value edit or dismissal', async () => {
  let resolve!: (response: AIResponse) => void;
  const { result } = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.suggest('Triage');
  });
  act(() => {
    result.current.setValue({ ...initial, reply: 'User edit' });
  });
  await act(async () => {
    resolve(response);
    await pending;
  });
  expect(result.current.changes).toBeNull();
  act(() => {
    pending = result.current.suggest('Triage');
  });
  act(() => {
    result.current.dismiss();
  });
  await act(async () => {
    resolve(response);
    await pending;
  });
  expect(result.current.changes).toBeNull();
});
it.each([
  {},
  { changes: [{ field: 'unknown', value: 'x' }] },
  { changes: [{ field: 'category', value: 1 }] },
  {
    changes: [
      { field: 'category', value: 'x' },
      { field: 'category', value: 'y' },
    ],
  },
  { changes: [{ field: '__proto__', value: 'x' }] },
  { changes: [{ field: 'reply', value: 'x', reason: {} }] },
])('rejects malformed or unauthorized changes without partial writes: %j', async (data) => {
  const { result } = setup(async () => ({ text: '', data }));
  await act(async () => {
    await result.current.suggest('Triage');
  });
  expect(result.current.error).not.toBe('');
  expect(result.current.changes).toBeNull();
  expect(result.current.value).toEqual(initial);
});
it('handles transport failures, no-op output, and disabled assistance', async () => {
  const fail = setup(async () => {
    throw new Error('Offline');
  });
  await act(async () => {
    await fail.result.current.suggest('Triage');
  });
  expect(fail.result.current.error).toBe('Offline');
  const empty = setup(async () => ({
    text: '',
    data: { changes: [{ field: 'reply', value: 'Original' }] },
  }));
  await act(async () => {
    await empty.result.current.suggest('Triage');
  });
  expect(empty.result.current.changes).toEqual([]);
  act(() => {
    expect(empty.result.current.accept()).toBe(false);
  });
  const generate = vi.fn<AITransport['generate']>();
  const disabled = setup(generate, { enabled: false });
  await act(async () => {
    await disabled.result.current.suggest('Triage');
  });
  expect(generate).not.toHaveBeenCalled();
});
it('supports keyboard-accessible selection, dismiss, empty, and undo controls', () => {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();
  const onUndo = vi.fn();
  const changes = [
    { field: 'category', label: 'Category', before: 'None', after: 'Billing' },
    { field: 'reply', label: 'Reply', before: '', after: 'Hello' },
  ];
  const { rerender } = render(
    <AIChangePreview
      changes={changes}
      onAccept={onAccept}
      onDismiss={onDismiss}
      onUndo={onUndo}
      canUndo
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /Reply/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply selected (1)' }));
  expect(onAccept).toHaveBeenCalledWith(['category']);
  fireEvent.click(screen.getByText('Dismiss'));
  expect(onDismiss).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('Undo AI changes'));
  expect(onUndo).toHaveBeenCalledOnce();
  rerender(<AIChangePreview changes={[]} onAccept={onAccept} onDismiss={onDismiss} />);
  expect(screen.getByText('No changes suggested.')).toBeTruthy();
  expect((screen.getByText('Apply selected (0)') as HTMLButtonElement).disabled).toBe(true);
});
it('sends only allowed fields and ignores a superseded response', async () => {
  const pending: ((response: AIResponse) => void)[] = [];
  const generate = vi.fn<AITransport['generate']>(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const { result } = setup(generate);
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.suggest('First');
  });
  act(() => {
    second = result.current.suggest('Second');
  });
  expect(JSON.parse(generate.mock.calls[0][0].text)).toEqual({
    values: { category: 'None', reply: 'Original' },
    fields,
  });
  await act(async () => {
    pending[1](response);
    await second;
  });
  await act(async () => {
    pending[0]({ text: '', data: { changes: [{ field: 'reply', value: 'Old response' }] } });
    await first;
  });
  expect(result.current.changes?.find((change) => change.field === 'reply')?.after).toBe(
    'Hello Alex',
  );
});
it('keeps inline field arrays stable across unrelated rerenders', async () => {
  const transport = { generate: async () => response };
  const { result } = renderHook(
    () => {
      const [value, setValue] = useState(initial);
      const [count, setCount] = useState(0);
      return {
        ...useAISuggestion({
          value,
          onValueChange: setValue,
          fields: [
            { key: 'category', label: 'Category' },
            { key: 'reply', label: 'Reply' },
          ],
        }),
        count,
        setCount,
      };
    },
    { wrapper: ({ children }) => <AIProvider transport={transport}>{children}</AIProvider> },
  );
  await act(async () => {
    await result.current.suggest('Triage');
  });
  act(() => {
    result.current.setCount(1);
  });
  expect(result.current.changes).toHaveLength(2);
});
