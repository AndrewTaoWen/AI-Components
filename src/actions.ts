import { cloneAIMemoryValue, type AIMemoryValue } from './memory.js';

/** Only use for an authoritative rejection that guarantees no mutation was committed. */
export class AIActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIActionRejectedError';
  }
}

export interface AIActionEvidence {
  label: string;
  reference?: string;
  revision?: string | number;
}
export interface AIActionProposal<T extends AIMemoryValue = AIMemoryValue> {
  /** Stable identifier for this exact proposal and its source revisions. */
  id: string;
  title: string;
  description?: string;
  steps: readonly { id: string; label: string; payload: T }[];
  evidence?: readonly AIActionEvidence[];
}
export function validateAIActionProposal<T extends AIMemoryValue>(
  input: AIActionProposal<T>,
): AIActionProposal<T> {
  const proposal = cloneAIMemoryValue(input) as unknown as AIActionProposal<T>;
  if (
    typeof proposal.id !== 'string' ||
    !proposal.id.trim() ||
    typeof proposal.title !== 'string' ||
    !proposal.title.trim() ||
    (proposal.description !== undefined && typeof proposal.description !== 'string') ||
    !Array.isArray(proposal.steps) ||
    !proposal.steps.length ||
    proposal.steps.some(
      (step) =>
        !step ||
        typeof step.id !== 'string' ||
        !step.id.trim() ||
        typeof step.label !== 'string' ||
        !step.label.trim() ||
        !Object.hasOwn(step, 'payload'),
    ) ||
    new Set(proposal.steps.map((step) => step.id)).size !== proposal.steps.length ||
    (proposal.evidence !== undefined &&
      (!Array.isArray(proposal.evidence) ||
        proposal.evidence.some(
          (item) =>
            !item ||
            typeof item.label !== 'string' ||
            !item.label.trim() ||
            (item.reference !== undefined && typeof item.reference !== 'string') ||
            (item.revision !== undefined &&
              typeof item.revision !== 'string' &&
              typeof item.revision !== 'number'),
        )))
  )
    throw new Error('Actions need a unique ID, a title, and unique labeled JSON steps.');
  return proposal;
}
