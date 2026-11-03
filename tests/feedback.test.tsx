import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  AIProvider,
  createAIMemory,
  readAIFeedback,
  recordAIFeedback,
  useAIAction,
} from '../src/index.js';
afterEach(cleanup);
it('deduplicates scoped events, keeps revisions, and validates edits without mutation', () => {
  const memory = createAIMemory();
  const input = {
    policyId: 'notes',
    proposalId: 'v1',
    actionType: 'tasks',
    outcome: 'edited' as const,
    sourceRevisions: { note: 2 },
    edit: 'Changed owner',
  };
  expect(recordAIFeedback(memory, 'a', input)).toBe(true);
  expect(recordAIFeedback(memory, 'a', input)).toBe(false);
  expect(recordAIFeedback(memory, 'b', input)).toBe(true);
  expect(readAIFeedback(memory.getSnapshot(), 'a')).toHaveLength(1);
  const before = memory.getSnapshot();
  expect(() => recordAIFeedback(memory, 'a', { ...input, outcome: 'invalid' } as never)).toThrow();
  expect(memory.getSnapshot()).toBe(before);
});
it('instruments review, selected acceptance and undo without changing default action behavior', async () => {
  const memory = createAIMemory();
  const { result } = renderHook(
    () =>
      useAIAction({
        type: 'tasks',
        feedback: { policyId: 'notes', sourceRevisions: { source: 4 } },
        validate() {},
        execute: async () => null,
        undo: async () => {},
      }),
    { wrapper: ({ children }) => <AIProvider memory={memory}>{children}</AIProvider> },
  );
  act(() => {
    result.current.review({
      id: 'p1',
      title: 'Tasks',
      steps: [{ id: 'a', label: 'A', payload: null }],
    });
  });
  await act(async () => {
    await result.current.accept(['a']);
    await result.current.undo();
  });
  expect(readAIFeedback(memory.getSnapshot(), 'shared').map((event) => event.outcome)).toEqual([
    'shown',
    'accepted',
    'undone',
  ]);
  expect(readAIFeedback(memory.getSnapshot(), 'shared')[1].selectedIds).toEqual(['a']);
});
