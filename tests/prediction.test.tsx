import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  AIProvider,
  AIContextInspector,
  createAIMemory,
  defineAIPolicy,
  evaluateAIPolicies,
  fromAction,
  fromMemory,
  fromContext,
  inspectAIRequest,
  useAIPrediction,
} from '../src/index.js';
const policy = defineAIPolicy<{ text: string }>({
  name: 'support.followup',
  purpose: 'Follow an accepted customer request',
  actionType: 'followup',
  borrow: { request: fromAction('request.accepted'), customer: fromMemory('customer') },
  predict({ borrowed }) {
    if (!borrowed.request) return [];
    return [
      {
        id: 'request-1:revision-2',
        title: 'Prepare follow-up',
        steps: [{ id: 'a', label: 'Confirm receipt', payload: { text: 'Confirm receipt' } }],
        evidence: [{ label: 'Accepted request' }],
      },
    ];
  },
});
afterEach(cleanup);
it('selects only explicit context and returns provenance without writing or calling a transport', () => {
  const memory = createAIMemory({
    initial: { shared: { customer: 'Alex', secret: 'unselected' }, other: { private: 'hidden' } },
  });
  memory.recordAction('shared', { type: 'request.accepted', data: 'invoice' });
  const before = memory.getSnapshot();
  const result = evaluateAIPolicies({ policies: [policy], snapshot: before, scope: 'shared' });
  expect(result.predictions).toHaveLength(1);
  expect(result.predictions[0].inspection).toMatchObject({
    name: policy.name,
    sources: { customer: 'memory:current.customer' },
    borrowed: { customer: 'Alex' },
  });
  expect(JSON.stringify(result)).not.toContain('unselected');
  expect(JSON.stringify(result)).not.toContain('hidden');
  expect(memory.getSnapshot()).toBe(before);
});
it('reacts to accepted actions and suppresses dismissed IDs in the same scope across hydration', () => {
  const memory = createAIMemory();
  const { result } = renderHook(() => useAIPrediction({ policies: [policy] }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AIProvider memory={memory}>{children}</AIProvider>
    ),
  });
  expect(result.current.predictions).toHaveLength(0);
  act(() => memory.recordAction('shared', { type: 'request.accepted', data: null }));
  expect(result.current.predictions).toHaveLength(1);
  act(() =>
    memory.recordAction('other', {
      type: 'followup.dismissed',
      data: { proposalId: 'request-1:revision-2' },
    }),
  );
  expect(result.current.predictions).toHaveLength(1);
  act(() =>
    memory.recordAction('shared', {
      type: 'followup.dismissed',
      data: { proposalId: 'request-1:revision-2' },
    }),
  );
  expect(result.current.predictions).toHaveLength(0);
  expect(
    evaluateAIPolicies({
      policies: [policy],
      snapshot: createAIMemory({ snapshot: memory.getSnapshot() }).getSnapshot(),
      scope: 'shared',
    }).predictions,
  ).toHaveLength(0);
});
it('deduplicates candidates and enforces a global result limit', () => {
  const memory = createAIMemory();
  memory.recordAction('shared', { type: 'request.accepted', data: null });
  const duplicates = {
    ...policy,
    predict: (input: Parameters<typeof policy.predict>[0]) => [
      ...policy.predict(input),
      ...policy.predict(input),
    ],
  };
  expect(
    evaluateAIPolicies({ policies: [duplicates], snapshot: memory.getSnapshot(), scope: 'shared' })
      .predictions,
  ).toHaveLength(1);
  expect(
    evaluateAIPolicies({
      policies: [policy],
      snapshot: memory.getSnapshot(),
      scope: 'shared',
      maxPredictions: 0,
    }).predictions,
  ).toHaveLength(0);
  expect(() =>
    evaluateAIPolicies({
      policies: [policy, policy],
      snapshot: memory.getSnapshot(),
      scope: 'shared',
    }),
  ).toThrow('unique');
});
it('isolates failing policies and exposes no partial proposals from an invalid result', () => {
  const memory = createAIMemory();
  memory.recordAction('shared', { type: 'request.accepted', data: null });
  const broken = {
    ...policy,
    name: 'broken',
    predict: () => [
      ...policy.predict({ scope: 'shared', borrowed: { request: true } }),
      { id: 'bad' },
    ],
  };
  const result = evaluateAIPolicies({
    policies: [broken as never, policy],
    snapshot: memory.getSnapshot(),
    scope: 'shared',
  });
  expect(result.errors[0].policy).toBe('broken');
  expect(result.predictions).toHaveLength(1);
  const source = {
    ...policy,
    borrow: {
      bad: () => {
        throw new Error('No access');
      },
    },
  };
  expect(
    evaluateAIPolicies({ policies: [source], snapshot: memory.getSnapshot(), scope: 'shared' })
      .errors[0].message,
  ).toBe('No access');
});
it('freezes selected policy inputs and proposal payloads', () => {
  const memory = createAIMemory({ initial: { shared: { customer: { name: 'Alex' } } } });
  const observed = vi.fn((input: Parameters<typeof policy.predict>[0]) => {
    expect(Object.isFrozen(input.borrowed.customer)).toBe(true);
    return [];
  });
  evaluateAIPolicies({
    policies: [{ ...policy, predict: observed }],
    snapshot: memory.getSnapshot(),
    scope: 'shared',
  });
  expect(observed).toHaveBeenCalledTimes(1);
});
it('does not evaluate disabled hooks and uses explicit provider scopes', () => {
  const predict = vi.fn(policy.predict);
  renderHook(() => useAIPrediction({ policies: [{ ...policy, predict }] }), {
    wrapper: ({ children }) => <AIProvider enabled={false}>{children}</AIProvider>,
  });
  expect(predict).not.toHaveBeenCalled();
  const memory = createAIMemory();
  memory.recordAction('private', { type: 'request.accepted', data: null });
  expect(
    evaluateAIPolicies({ policies: [policy], snapshot: memory.getSnapshot(), scope: 'shared' })
      .predictions,
  ).toHaveLength(0);
});
it('atomically replaces authoritative snapshots and rejects malformed hydration without changing state', () => {
  const memory = createAIMemory();
  const next = createAIMemory({ initial: { shared: { customer: 'Alex' } } });
  const listener = vi.fn();
  memory.subscribe(listener);
  memory.replaceSnapshot(next.getSnapshot());
  expect(listener).toHaveBeenCalledTimes(1);
  expect(memory.getSnapshot().scopes.shared.customer).toBe('Alex');
  const before = memory.getSnapshot();
  expect(() => memory.replaceSnapshot({ scopes: { shared: 4 }, actions: [] } as never)).toThrow();
  expect(memory.getSnapshot()).toBe(before);
});
it('inspects recipe-selected request fields without exposing raw provider context or prompts', () => {
  const inspection = inspectAIRequest({
    action: 'write',
    text: 'private document',
    prompt: 'private prompt',
    context: {
      unselected: 'hidden',
      _ai: {
        recipe: 'reply',
        borrowed: { customer: 'Alex' },
        sources: { customer: 'accepted form' },
        expectedUse: 'Review before sending',
      },
    },
  });
  render(<AIContextInspector inspection={inspection} />);
  expect(screen.getByText('Why this suggestion?')).toBeTruthy();
  expect(document.body.textContent).toContain('accepted form');
  expect(document.body.textContent).not.toContain('hidden');
  expect(document.body.textContent).not.toContain('private document');
  expect(inspectAIRequest({ action: 'write', text: '', prompt: '' })).toBeNull();
});
it('accepts explicit contextual policy inputs without reading unselected static context', () => {
  const current = {
    ...policy,
    borrow: { value: fromContext('selected') },
    predict: vi.fn(() => []),
  };
  evaluateAIPolicies({
    policies: [current],
    snapshot: createAIMemory().getSnapshot(),
    scope: 'shared',
    context: { selected: 'yes', private: 'no' },
  });
  expect(current.predict).toHaveBeenCalledWith({ scope: 'shared', borrowed: { value: 'yes' } });
});
