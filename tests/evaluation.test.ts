import { expect, it } from 'vitest';
import { evaluateWorkflowCase, summarizeAIFeedback } from '../src/evaluation.js';
const fixture = {
  id: 'meeting',
  scope: 'a',
  snapshot: { scopes: {}, actions: [] },
  context: {},
  expectedSteps: ['Send recap'],
  allowedEvidence: { checklist: 2 },
  requireEvidence: true,
};
const proposal = {
  id: 'p1',
  title: 'Follow-up',
  evidence: [{ label: 'Checklist', reference: 'checklist', revision: 2 }],
  steps: [{ id: 'a', label: 'Send recap', payload: null }],
};
it('scores grounded results and detects duplicates, stale targets, missing and prohibited changes', () => {
  expect(evaluateWorkflowCase(fixture, [proposal]).passed).toBe(true);
  const bad = {
    ...proposal,
    evidence: [{ label: 'Checklist', reference: 'checklist', revision: 1 }],
    steps: [...proposal.steps, { ...proposal.steps[0], id: 'b' }],
  };
  const result = evaluateWorkflowCase(fixture, [bad]);
  expect(result.passed).toBe(false);
  expect(result.duplicateSteps).toBe(1);
  expect(result.errors[0]).toContain('stale');
  expect(evaluateWorkflowCase(fixture, []).missing).toEqual(['send recap']);
  expect(
    evaluateWorkflowCase({ ...fixture, expectedSteps: [], forbiddenSteps: ['Send recap'] }, [
      proposal,
    ]).prohibited,
  ).toEqual(['send recap']);
});
it('fails malformed outputs and handles an empty expected result correctly', () => {
  expect(evaluateWorkflowCase(fixture, [{ id: 'bad' } as never]).passed).toBe(false);
  expect(evaluateWorkflowCase({ ...fixture, expectedSteps: [] }, []).passed).toBe(true);
});
it('summarizes retained feedback without presenting unshown acceptance as a rate', () => {
  const base = { policyId: 'p', proposalId: '1', actionType: 'tasks' };
  expect(
    summarizeAIFeedback([
      { ...base, outcome: 'shown' },
      { ...base, outcome: 'accepted' },
      { ...base, outcome: 'undone' },
    ]),
  ).toMatchObject({ acceptanceRate: 1, keptAccepted: 0 });
  expect(summarizeAIFeedback([]).acceptanceRate).toBeNull();
});
