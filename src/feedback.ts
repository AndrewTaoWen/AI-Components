import { cloneAIMemoryValue, type AIMemorySnapshot, type AIMemoryStore } from './memory.js';

export const AI_FEEDBACK_OUTCOMES = ['shown', 'accepted', 'edited', 'dismissed', 'undone'] as const;
export type AIFeedbackOutcome = (typeof AI_FEEDBACK_OUTCOMES)[number];
export interface AIWorkflowFeedback {
  policyId: string;
  proposalId: string;
  actionType: string;
  outcome: AIFeedbackOutcome;
  sourceRevisions?: Readonly<Record<string, string | number>>;
  mutationId?: string;
  selectedIds?: readonly string[];
  /** Optional explicit edit summary; don't record private drafts by default. */
  edit?: string;
}
export function readAIFeedback(snapshot: AIMemorySnapshot, scope: string, policyId?: string) {
  return snapshot.actions
    .filter((event) => event.scope === scope && event.type === 'ai.workflow.feedback')
    .flatMap((event) => {
      const data = event.data as unknown as AIWorkflowFeedback;
      return data &&
        typeof data === 'object' &&
        AI_FEEDBACK_OUTCOMES.includes(data.outcome) &&
        typeof data.policyId === 'string' &&
        typeof data.proposalId === 'string' &&
        (!policyId || data.policyId === policyId)
        ? [{ ...data, timestamp: event.timestamp }]
        : [];
    });
}
/** Opt-in semantic feedback; deduplicated within retained history, isolated by scope. */
export function recordAIFeedback(
  store: AIMemoryStore,
  scope: string,
  input: AIWorkflowFeedback,
): boolean {
  const data = cloneAIMemoryValue(input) as unknown as AIWorkflowFeedback;
  if (
    ![data.policyId, data.proposalId, data.actionType].every(
      (value) => typeof value === 'string' && value.trim(),
    ) ||
    !AI_FEEDBACK_OUTCOMES.includes(data.outcome) ||
    (data.mutationId !== undefined && typeof data.mutationId !== 'string') ||
    (data.selectedIds !== undefined &&
      (!Array.isArray(data.selectedIds) ||
        data.selectedIds.some((id) => typeof id !== 'string'))) ||
    (data.edit !== undefined && typeof data.edit !== 'string') ||
    (data.sourceRevisions !== undefined &&
      (!data.sourceRevisions ||
        Array.isArray(data.sourceRevisions) ||
        typeof data.sourceRevisions !== 'object' ||
        Object.values(data.sourceRevisions).some(
          (value) => typeof value !== 'string' && typeof value !== 'number',
        )))
  )
    throw new Error('Invalid workflow feedback.');
  const key = JSON.stringify([
    data.policyId,
    data.proposalId,
    data.actionType,
    data.outcome,
    data.mutationId ?? null,
  ]);
  if (
    store
      .getSnapshot()
      .actions.some(
        (event) =>
          event.scope === scope &&
          event.type === 'ai.workflow.feedback' &&
          event.data &&
          typeof event.data === 'object' &&
          Reflect.get(event.data, 'key') === key,
      )
  )
    return false;
  store.recordAction(scope, {
    type: 'ai.workflow.feedback',
    source: data.policyId,
    data: { ...data, key },
  });
  return true;
}
