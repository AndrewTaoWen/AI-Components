import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import {
  AIProvider,
  AIActionReview,
  AIActionRejectedError,
  createAIMemory,
  useAIAction,
  type AIActionOptions,
  type AIActionProposal,
} from '../src/index.js';
import { createPersistentAIMemory, type AIMemoryCheckpoint } from '../src/memory-persistence.js';

afterEach(cleanup);
type Payload = { text: string };
type Receipt = { revision: number };
const proposal: AIActionProposal<Payload> = {
  id: 'proposal-source-v1-target-v2',
  title: 'Review the next step',
  steps: [
    { id: 'a', label: 'Add first task', payload: { text: 'First' } },
    { id: 'b', label: 'Add second task', payload: { text: 'Second' } },
  ],
  evidence: [{ label: 'Accepted actions', reference: 'meeting', revision: 1 }],
};
function setup(overrides: Partial<AIActionOptions<Payload, Receipt>> = {}) {
  const memory = createAIMemory();
  const options: AIActionOptions<Payload, Receipt> = {
    type: 'checklist.update',
    validate: vi.fn(),
    execute: vi.fn(async () => ({ revision: 3 })),
    undo: vi.fn(async () => {}),
    ...overrides,
  };
  const hook = renderHook(() => useAIAction(options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AIProvider memory={memory} memoryScope="project">
        {children}
      </AIProvider>
    ),
  });
  act(() => {
    expect(hook.result.current.review(proposal)).toBe(true);
  });
  return { ...hook, memory, options };
}
it('only applies selected frozen steps after validation and journals accepted/undone outcomes', async () => {
  const { result, memory, options } = setup();
  expect(options.execute).not.toHaveBeenCalled();
  expect(memory.getSnapshot().actions).toHaveLength(0);
  await act(async () => {
    expect(await result.current.accept(['b'])).toBe(true);
  });
  expect(options.validate).toHaveBeenCalledWith(proposal, ['b']);
  expect(options.execute).toHaveBeenCalledWith(proposal, ['b'], { mutationId: expect.any(String) });
  expect(Object.isFrozen(vi.mocked(options.execute).mock.calls[0][0].steps[0].payload)).toBe(true);
  expect(memory.getSnapshot().actions).toMatchObject([
    {
      scope: 'project',
      type: 'checklist.update.accepted',
      data: { selectedIds: ['b'], receipt: { revision: 3 } },
    },
  ]);
  await act(async () => {
    expect(await result.current.undo()).toBe(true);
  });
  expect(memory.getSnapshot().actions.at(-1)?.type).toBe('checklist.update.undone');
  expect(result.current.canUndo).toBe(false);
});
it('records dismissals without executing application code', () => {
  const { result, memory, options } = setup();
  act(() => {
    expect(result.current.dismiss()).toBe(true);
  });
  expect(memory.getSnapshot().actions[0].type).toBe('checklist.update.dismissed');
  expect(options.execute).not.toHaveBeenCalled();
});
it('rejects stale validation and malformed selections without execution', async () => {
  const { result, options, memory } = setup({
    validate: () => {
      throw new Error('Source changed');
    },
  });
  await act(async () => {
    expect(await result.current.accept()).toBe(false);
  });
  expect(result.current.error).toBe('Source changed');
  await act(async () => {
    expect(await result.current.accept(['invented'])).toBe(false);
  });
  await act(async () => {
    expect(await result.current.accept(['a', 'a'])).toBe(false);
  });
  expect(options.execute).not.toHaveBeenCalled();
  expect(memory.getSnapshot().actions).toHaveLength(0);
});
it('locks duplicate clicks and retries uncertain execution with the same mutation and selection', async () => {
  let calls = 0;
  const execute = vi.fn(async () => {
    if (++calls === 1) throw new Error('Lost response');
    return { revision: 3 };
  });
  const { result, options, memory } = setup({ execute });
  await act(async () => {
    expect(await result.current.accept(['a'])).toBe(false);
  });
  expect(result.current.retryPending).toBe(true);
  act(() => {
    expect(result.current.dismiss()).toBe(false);
    expect(result.current.review(proposal)).toBe(false);
  });
  await act(async () => {
    expect(await result.current.accept(['b'])).toBe(false);
  });
  await act(async () => {
    const first = result.current.accept(['a']);
    expect(await result.current.accept(['a'])).toBe(false);
    expect(await first).toBe(true);
  });
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);
  expect(options.validate).toHaveBeenCalledTimes(1);
  expect(memory.getSnapshot().actions).toHaveLength(1);
});
it('does not execute again when only outcome recording fails after a committed result', async () => {
  const { result, memory, options } = setup();
  const original = memory.recordAction;
  memory.recordAction = () => {
    throw new Error('Journal unavailable');
  };
  await act(async () => {
    expect(await result.current.accept(['a'])).toBe(false);
  });
  memory.recordAction = original;
  await act(async () => {
    expect(await result.current.accept(['a'])).toBe(true);
  });
  expect(options.execute).toHaveBeenCalledTimes(1);
  expect(memory.getSnapshot().actions).toHaveLength(1);
});
it('keeps the same undo mutation ID after an uncertain compensation failure', async () => {
  let calls = 0;
  const undo = vi.fn(async () => {
    if (++calls === 1) throw new Error('Newer revision or lost response');
  });
  const { result } = setup({ undo });
  await act(async () => {
    await result.current.accept();
  });
  await act(async () => {
    expect(await result.current.undo()).toBe(false);
  });
  expect(result.current.canUndo).toBe(true);
  act(() => {
    expect(result.current.review(proposal)).toBe(false);
  });
  await act(async () => {
    expect(await result.current.undo()).toBe(true);
  });
  expect(undo.mock.calls[0]).toEqual(undo.mock.calls[1]);
});
it('stops validation from executing after the provider is disabled', async () => {
  let finish!: () => void;
  const execute = vi.fn(async () => ({ revision: 3 }));
  let setEnabled!: (enabled: boolean) => void;
  const wrapper = ({ children }: { children: ReactNode }) => {
    const [enabled, update] = useState(true);
    setEnabled = update;
    return <AIProvider enabled={enabled}>{children}</AIProvider>;
  };
  const { result } = renderHook(
    () =>
      useAIAction<Payload, Receipt>({
        type: 'task',
        validate: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
        execute,
      }),
    { wrapper },
  );
  act(() => {
    result.current.review(proposal);
  });
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.accept();
  });
  act(() => {
    setEnabled(false);
  });
  await act(async () => {
    finish();
    expect(await pending).toBe(false);
  });
  expect(execute).not.toHaveBeenCalled();
  expect(result.current.status).toBe('reviewing');
});
it('does not move a completed execution into a different provider scope', async () => {
  const memory = createAIMemory();
  let complete!: (value: Receipt) => void;
  let setScope!: (scope: string) => void;
  const wrapper = ({ children }: { children: ReactNode }) => {
    const [scope, update] = useState('first');
    setScope = update;
    return (
      <AIProvider memory={memory} memoryScope={scope}>
        {children}
      </AIProvider>
    );
  };
  const { result } = renderHook(
    () =>
      useAIAction<Payload, Receipt>({
        type: 'task',
        validate() {},
        execute: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
        undo: async () => {},
      }),
    { wrapper },
  );
  act(() => {
    result.current.review(proposal);
  });
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = result.current.accept();
    await Promise.resolve();
  });
  act(() => {
    setScope('second');
  });
  await act(async () => {
    complete({ revision: 3 });
    await pending;
  });
  expect(memory.getSnapshot().actions[0].scope).toBe('first');
  expect(result.current.proposal).toBeNull();
  expect(result.current.canUndo).toBe(false);
});
it('rejects invalid steps and never retains caller-owned mutable proposal data', () => {
  const { result } = setup();
  const input = structuredClone(proposal);
  act(() => {
    expect(result.current.review(input)).toBe(true);
  });
  input.steps[0].payload.text = 'Mutated';
  expect(result.current.proposal?.steps[0].payload.text).toBe('First');
  act(() => {
    expect(
      result.current.review({ ...proposal, steps: [proposal.steps[0], proposal.steps[0]] }),
    ).toBe(false);
  });
  act(() => {
    expect(
      result.current.review({
        ...proposal,
        steps: [{ id: 'bad', label: 'Bad', payload: new Date() }],
      } as never),
    ).toBe(false);
  });
});
it('persists accepted outcome history with the durable memory provider', async () => {
  let disk: AIMemoryCheckpoint | null = null;
  const adapter = {
    load: async () => disk,
    save: async (checkpoint: AIMemoryCheckpoint) => {
      disk = checkpoint;
    },
  };
  const first = await createPersistentAIMemory({ adapter });
  const { result } = renderHook(
    () =>
      useAIAction<Payload, Receipt>({
        type: 'task',
        validate() {},
        execute: async () => ({ revision: 3 }),
      }),
    { wrapper: ({ children }) => <AIProvider memory={first.memory}>{children}</AIProvider> },
  );
  act(() => {
    result.current.review(proposal);
  });
  await act(async () => {
    await result.current.accept();
  });
  await first.dispose();
  const restored = await createPersistentAIMemory({ adapter });
  expect(restored.memory.getSnapshot().actions[0]).toMatchObject({
    type: 'task.accepted',
    data: { proposalId: proposal.id },
  });
  await restored.dispose();
});
it('renders selectable evidence and invokes review controls without submitting a surrounding form', () => {
  const accept = vi.fn();
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <AIActionReview proposal={proposal} onAccept={accept} onDismiss={() => {}} />
    </form>,
  );
  expect(screen.getByRole('list', { name: 'Action evidence' }).textContent).toContain('revision 1');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Add second task' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply action (1)' }));
  expect(accept).toHaveBeenCalledWith(['a']);
  expect(submit).not.toHaveBeenCalled();
});

it('deduplicates an outcome if a custom subscriber throws after publication', async () => {
  const { result, memory, options } = setup();
  const original = memory.recordAction;
  memory.recordAction = (scope, event) => {
    original(scope, event);
    throw new Error('Subscriber failed');
  };
  await act(async () => {
    expect(await result.current.accept()).toBe(false);
  });
  memory.recordAction = original;
  await act(async () => {
    expect(await result.current.accept()).toBe(true);
  });
  expect(options.execute).toHaveBeenCalledTimes(1);
  expect(memory.getSnapshot().actions).toHaveLength(1);
});
it('locks selection and dismissal while an uncertain execution is waiting for reconciliation', () => {
  render(
    <AIActionReview
      proposal={proposal}
      onAccept={() => {}}
      onDismiss={() => {}}
      retryPending
      error="Connection lost"
    />,
  );
  expect(
    (screen.getByRole('checkbox', { name: 'Add first task' }) as HTMLInputElement).disabled,
  ).toBe(false);
  expect(
    screen.getByRole('checkbox', { name: 'Add first task' }).closest('fieldset')!.disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Dismiss action' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Retry selected action' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(screen.getByRole('alert').textContent).toBe('Connection lost');
});

it('uses scoped recorded outcomes to suppress a repeated proposal after review remounts', () => {
  const { result, memory, unmount } = setup();
  act(() => {
    result.current.dismiss();
  });
  unmount();
  const second = renderHook(
    () =>
      useAIAction<Payload, Receipt>({
        type: 'checklist.update',
        validate() {},
        execute: async () => ({ revision: 3 }),
      }),
    {
      wrapper: ({ children }) => (
        <AIProvider memory={memory} memoryScope="project">
          {children}
        </AIProvider>
      ),
    },
  );
  act(() => {
    expect(second.result.current.review(proposal)).toBe(false);
  });
  expect(second.result.current.error).toContain('recorded outcome');
  act(() => {
    expect(second.result.current.review({ ...proposal, id: 'fresh-source-and-target' })).toBe(true);
  });
});

it('releases an attempt after an authoritative rejection that guarantees no commit', async () => {
  const { result } = setup({
    execute: async () => {
      throw new AIActionRejectedError('Revision conflict');
    },
  });
  await act(async () => {
    expect(await result.current.accept(['a'])).toBe(false);
  });
  expect(result.current.retryPending).toBe(false);
  act(() => {
    expect(result.current.dismiss()).toBe(true);
  });
});
it('allows a fresh review after undo is definitively rejected by a newer revision', async () => {
  const { result } = setup({
    undo: async () => {
      throw new AIActionRejectedError('Newer edits');
    },
  });
  await act(async () => {
    await result.current.accept();
  });
  await act(async () => {
    expect(await result.current.undo()).toBe(false);
  });
  act(() => {
    expect(result.current.review({ ...proposal, id: 'new-target-revision' })).toBe(true);
  });
});
