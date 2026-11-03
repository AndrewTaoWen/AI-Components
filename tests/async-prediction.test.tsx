import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AIProvider,
  createAIMemory,
  fromMemory,
  useAIAsyncPrediction,
  type AIAsyncPredictionOptions,
} from '../src/index.js';
import { evaluateWorkflowCase } from '../src/evaluation.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const proposal = {
  id: 'p1',
  title: 'Follow-up',
  evidence: [{ label: 'Invented', reference: 'evil' }],
  steps: [{ id: 'a', label: 'Send recap', payload: { target: 'allowed' } }],
};
function setup(
  generate: AIAsyncPredictionOptions<{ target: string }>['generate'],
  extra: Partial<AIAsyncPredictionOptions<{ target: string }>> = {},
) {
  const memory = createAIMemory({ initial: { shared: { note: 'Discussed a recap' } } });
  const options = {
    name: 'meeting',
    purpose: 'Propose grounded follow-up',
    actionType: 'tasks',
    borrow: { note: fromMemory('note') },
    evidence: [{ label: 'Allowed checklist', reference: 'allowed', revision: 2 }],
    validatePayload(value: unknown) {
      if ((value as { target: string }).target !== 'allowed') throw new Error('Unapproved target');
    },
    generate,
    ...extra,
  };
  return {
    memory,
    ...renderHook(() => useAIAsyncPrediction(options), {
      wrapper: ({ children }) => <AIProvider memory={memory}>{children}</AIProvider>,
    }),
  };
}
it('is explicit by default, validates targets and replaces model citation claims', async () => {
  const generate = vi.fn(async () => [proposal]);
  const { result, memory } = setup(generate);
  expect(generate).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.predict();
  });
  expect(result.current.predictions[0].proposal.evidence?.[0].reference).toBe('allowed');
  expect(memory.getSnapshot().actions).toHaveLength(0);
  expect(generate.mock.calls[0]).toHaveLength(1);
  const report = evaluateWorkflowCase(
    {
      id: 'async',
      scope: 'shared',
      snapshot: memory.getSnapshot(),
      context: {},
      expectedSteps: ['Send recap'],
      allowedEvidence: { allowed: 2 },
    },
    result.current.predictions.map((item) => item.proposal),
  );
  expect(report.passed).toBe(true);
});
it('rejects stale results even when a generator ignores cancellation', async () => {
  let finish!: (value: unknown) => void;
  const { result, memory } = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current.predict();
  });
  act(() => memory.update('shared', { note: 'New note' }));
  await act(async () => {
    finish([proposal]);
    expect(await pending).toBeNull();
  });
  expect(result.current.predictions).toHaveLength(0);
});
it('bounds context and output and rejects invalid payloads', async () => {
  const generate = vi.fn(async () => [proposal]);
  const first = setup(generate, { limits: { maxInputCharacters: 2 } });
  await act(async () => {
    expect(await first.result.current.predict()).toBeNull();
  });
  expect(generate).not.toHaveBeenCalled();
  first.unmount();
  const second = setup(async () => [
    { ...proposal, steps: [{ id: 'x', label: 'Bad', payload: { target: 'evil' } }] },
  ]);
  await act(async () => {
    await second.result.current.predict();
  });
  expect(second.result.current.error).toContain('Unapproved');
});
it('times out a noncooperative generator and debounces opt-in automatic generation', async () => {
  vi.useFakeTimers();
  const generate = vi.fn(() => new Promise<unknown>(() => {}));
  const { result } = setup(generate, { auto: true, debounceMs: 50, limits: { timeoutMs: 100 } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(49);
  });
  expect(generate).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(101);
  });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(result.current.error).toContain('timed out');
});
