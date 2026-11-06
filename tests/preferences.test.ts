import { expect, it } from 'vitest';
import {
  createAIMemory,
  recordAIFeedback,
  evaluateAIPreferenceGate,
  resetAIPolicyPreference,
  setAIPolicyPreference,
  defineAIPolicy,
  evaluateAIPolicies,
} from '../src/index.js';
it('reduces frequency after dismissal, isolates scopes, and expires/reset cooldown', () => {
  const now = Date.parse('2026-11-02T10:00:00Z');
  const memory = createAIMemory({ clock: () => new Date(now).toISOString() });
  recordAIFeedback(memory, 'a', {
    policyId: 'notes',
    proposalId: 'one',
    actionType: 'tasks',
    outcome: 'dismissed',
  });
  expect(evaluateAIPreferenceGate(memory.getSnapshot(), 'a', 'notes', 'two', now).allowed).toBe(
    false,
  );
  expect(evaluateAIPreferenceGate(memory.getSnapshot(), 'b', 'notes', 'two', now).allowed).toBe(
    true,
  );
  expect(
    evaluateAIPreferenceGate(memory.getSnapshot(), 'a', 'notes', 'two', now + 16 * 60000).allowed,
  ).toBe(true);
  resetAIPolicyPreference(memory, 'a', 'notes', now);
  expect(evaluateAIPreferenceGate(memory.getSnapshot(), 'a', 'notes', 'two', now).allowed).toBe(
    true,
  );
});
it('suppresses explicit blocked candidates and opt-out without affecting another policy', () => {
  const memory = createAIMemory();
  const policy = defineAIPolicy({
    name: 'notes',
    purpose: 'Test',
    actionType: 'tasks',
    predict: () => [{ id: 'p1', title: 'Task', steps: [{ id: 'a', label: 'A', payload: null }] }],
  });
  setAIPolicyPreference(memory, 'shared', 'notes', { blockedProposalIds: ['p1'] });
  expect(
    evaluateAIPolicies({ policies: [policy], snapshot: memory.getSnapshot(), scope: 'shared' })
      .predictions,
  ).toHaveLength(0);
  setAIPolicyPreference(memory, 'shared', 'notes', { frequency: 'off' });
  expect(evaluateAIPreferenceGate(memory.getSnapshot(), 'shared', 'other').allowed).toBe(true);
});

it('acceptance resets dismissal cooldown and less frequency spaces shown suggestions', () => {
  let now = Date.parse('2026-11-05T10:00:00Z');
  const memory = createAIMemory({ clock: () => new Date(now).toISOString() });
  const base = { policyId: 'notes', proposalId: 'p1', actionType: 'tasks' };
  recordAIFeedback(memory, 'shared', { ...base, outcome: 'dismissed' });
  now++;
  recordAIFeedback(memory, 'shared', { ...base, outcome: 'accepted' });
  expect(
    evaluateAIPreferenceGate(memory.getSnapshot(), 'shared', 'notes', undefined, now).allowed,
  ).toBe(true);
  setAIPolicyPreference(memory, 'shared', 'notes', { frequency: 'less' });
  recordAIFeedback(memory, 'shared', { ...base, outcome: 'shown' });
  expect(
    evaluateAIPreferenceGate(memory.getSnapshot(), 'shared', 'notes', undefined, now).allowed,
  ).toBe(false);
  expect(
    evaluateAIPreferenceGate(memory.getSnapshot(), 'shared', 'notes', undefined, now + 60 * 60000)
      .allowed,
  ).toBe(true);
});
