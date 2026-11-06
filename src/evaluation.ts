import { validateAIActionProposal, type AIActionProposal } from './actions.js';
import type { AIWorkflowFeedback } from './feedback.js';
import type { AIMemorySnapshot } from './memory.js';
export interface AIWorkflowCase {
  id: string;
  scope: string;
  snapshot: AIMemorySnapshot;
  context: Record<string, unknown>;
  expectedSteps: readonly string[];
  forbiddenSteps?: readonly string[];
  allowedEvidence?: Readonly<Record<string, string | number>>;
  requireEvidence?: boolean;
}
const normalized = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
/** Deterministic fixture scoring, not an automated claim of semantic/model quality. */
export function evaluateWorkflowCase(
  fixture: AIWorkflowCase,
  candidates: readonly AIActionProposal[],
) {
  const expected = new Set(fixture.expectedSteps.map(normalized));
  const forbidden = new Set((fixture.forbiddenSteps ?? []).map(normalized));
  if (!fixture.id.trim() || [...expected].some((value) => forbidden.has(value)))
    throw new Error('Invalid workflow fixture.');
  const errors: string[] = [];
  let proposals: readonly AIActionProposal[] = [];
  try {
    proposals = candidates.map((candidate) => validateAIActionProposal(candidate));
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : String(cause));
  }
  const steps = proposals.flatMap((proposal) =>
    proposal.steps.map((step) => normalized(step.label)),
  );
  const actual = new Set(steps);
  const missing = [...expected].filter((value) => !actual.has(value));
  const unexpected = [...actual].filter((value) => !expected.has(value));
  const prohibited = [...actual].filter((value) => forbidden.has(value));
  const duplicateSteps = steps.length - actual.size;
  for (const proposal of proposals) {
    if (fixture.requireEvidence && !proposal.evidence?.length)
      errors.push(`Missing evidence: ${proposal.id}`);
    for (const evidence of proposal.evidence ?? []) {
      if (
        fixture.allowedEvidence &&
        evidence.reference &&
        (!Object.hasOwn(fixture.allowedEvidence, evidence.reference) ||
          fixture.allowedEvidence[evidence.reference] !== evidence.revision)
      )
        errors.push(`Unsupported or stale evidence: ${evidence.reference}`);
    }
  }
  const correct = [...actual].filter((value) => expected.has(value)).length;
  return {
    id: fixture.id,
    passed:
      !missing.length &&
      !unexpected.length &&
      !prohibited.length &&
      !duplicateSteps &&
      !errors.length,
    precision: actual.size ? correct / actual.size : expected.size ? 0 : 1,
    recall: expected.size ? correct / expected.size : actual.size ? 0 : 1,
    missing,
    unexpected,
    prohibited,
    duplicateSteps,
    errors,
  };
}
export function summarizeAIFeedback(events: readonly AIWorkflowFeedback[]) {
  const key = (event: AIWorkflowFeedback) => JSON.stringify([event.policyId, event.proposalId]);
  const count = (outcome: AIWorkflowFeedback['outcome']) =>
    new Set(events.filter((event) => event.outcome === outcome).map(key));
  const shown = count('shown'),
    accepted = count('accepted'),
    undone = count('undone');
  return {
    shown: shown.size,
    accepted: accepted.size,
    dismissed: count('dismissed').size,
    edited: count('edited').size,
    undone: undone.size,
    keptAccepted: [...accepted].filter((id) => !undone.has(id)).length,
    acceptanceRate: shown.size
      ? [...accepted].filter((id) => shown.has(id)).length / shown.size
      : null,
  };
}
