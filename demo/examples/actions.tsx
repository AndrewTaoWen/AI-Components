import { useEffect, useRef, useState } from 'react';
import {
  AIActionReview,
  AIActionRejectedError,
  AIProvider,
  createPersistentAIMemory,
  createWebStorageMemoryAdapter,
  useAI,
  useAIAction,
  useAIMemory,
  type AIPersistentMemory,
  type AIMemoryValue,
} from '../../src/index.js';
import type { ComponentExample } from './registry.js';

type Checklist = { revision: number; rows: string[] };
type Receipt = { revision: number; previous: Checklist };
type Step = { text: string; targetRevision: number; sourceActionId: number };
const tasks = ['Confirm invoice receipt', 'Share the account setup guide'];
const initial: Checklist = { revision: 1, rows: ['Review the incoming request'] };
const scope = 'action-demo';
function checklist(value: AIMemoryValue | undefined): Checklist {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;
  const record = value as Record<string, AIMemoryValue>;
  if (
    typeof record.revision === 'number' &&
    Number.isSafeInteger(record.revision) &&
    Array.isArray(record.rows) &&
    record.rows.every((item) => typeof item === 'string')
  )
    return record as Checklist;
  return initial;
}

function Workflow() {
  const environment = useAI();
  const { memory, actions, remember, updateMemory } = useAIMemory();
  const executions = useRef(new Map<string, Receipt>());
  const undos = useRef(new Set<string>());
  const currentChecklist = () =>
    checklist(environment.memory.getSnapshot().scopes[scope]?.checklist);
  const latestRequest = () =>
    environment.memory
      .getSnapshot()
      .actions.filter((event) => event.scope === scope && event.type === 'request.accepted')
      .at(-1);
  const list = checklist(memory.checklist);
  const action = useAIAction<Step, Receipt>({
    type: 'followup',
    source: 'workflow-actions-demo',
    validate(proposal) {
      const baseline = proposal.steps[0].payload;
      if (
        baseline.targetRevision !== currentChecklist().revision ||
        baseline.sourceActionId !== latestRequest()?.id
      )
        throw new Error('The request or checklist changed. Review a fresh next move.');
    },
    async execute(proposal, selected, { mutationId }) {
      const repeated = executions.current.get(mutationId);
      if (repeated) return repeated;
      const before = currentChecklist();
      const baseline = proposal.steps[0].payload;
      // This local simulation checks and writes synchronously. A real endpoint must do this atomically.
      if (
        baseline.targetRevision !== before.revision ||
        baseline.sourceActionId !== latestRequest()?.id
      )
        throw new AIActionRejectedError('The checklist changed before execution.');
      const next = {
        revision: before.revision + 1,
        rows: [
          ...before.rows,
          ...proposal.steps
            .filter((step) => selected.includes(step.id))
            .map((step) => step.payload.text),
        ],
      };
      updateMemory({ checklist: next });
      const receipt = { revision: next.revision, previous: before };
      executions.current.set(mutationId, receipt);
      return receipt;
    },
    async undo(receipt, { mutationId }) {
      if (undos.current.has(mutationId)) return;
      const current = currentChecklist();
      if (current.revision !== receipt.revision)
        throw new AIActionRejectedError(
          'This checklist has newer edits. Undo would overwrite them.',
        );
      updateMemory({ checklist: { revision: current.revision + 1, rows: receipt.previous.rows } });
      undos.current.add(mutationId);
    },
  });
  function predict() {
    const source = latestRequest();
    if (!source) return;
    const target = currentChecklist();
    const additions = tasks.filter((text) => !target.rows.includes(text));
    if (!additions.length) return;
    action.review({
      id: `request-${source.id}-checklist-${target.revision}`,
      title: 'Prepare the follow-up checklist',
      description: 'The accepted request has two follow-up steps. Choose which ones to add.',
      evidence: [
        { label: 'Accepted request', reference: `action ${source.id}` },
        { label: 'Follow-up checklist', revision: target.revision },
      ],
      steps: additions.map((text, index) => ({
        id: `task-${index}`,
        label: text,
        payload: { text, targetRevision: target.revision, sourceActionId: source.id },
      })),
    });
  }
  const busy = ['validating', 'executing', 'undoing'].includes(action.status);
  return (
    <>
      <p className="description">
        An accepted request becomes evidence for a suggested next move. Review the tasks, keep what
        helps, and undo while the checklist is unchanged.
      </p>
      <div className="aic-action-buttons">
        <button
          type="button"
          disabled={busy || action.retryPending}
          onClick={() =>
            remember(
              'request',
              { subject: 'Invoice and account access' },
              { type: 'request.accepted', source: 'request-form' },
            )
          }
        >
          Accept sample request
        </button>
        <button
          type="button"
          disabled={!latestRequest() || busy || action.retryPending || !action.enabled}
          onClick={predict}
        >
          Review next move
        </button>
      </div>
      <p className="footnote">
        {memory.request
          ? 'Accepted request: invoice and account access.'
          : 'Accept the sample request to provide context.'}
      </p>
      <AIActionReview
        proposal={action.proposal}
        onAccept={action.accept}
        onDismiss={action.dismiss}
        onUndo={action.undo}
        canUndo={action.canUndo}
        busy={busy}
        retryPending={action.retryPending}
        error={action.error}
      />
      <h3>Follow-up checklist</h3>
      <ul aria-label="Follow-up checklist">
        {list.rows.map((text, index) => (
          <li key={`${index}:${text}`}>{text}</li>
        ))}
      </ul>
      <button
        type="button"
        className="aic-action-button"
        disabled={busy || action.retryPending}
        onClick={() => {
          const current = currentChecklist();
          updateMemory({
            checklist: {
              revision: current.revision + 1,
              rows: [...current.rows, 'A manually added task'],
            },
          });
        }}
      >
        Add a manual task
      </button>
      <p className="footnote">
        Add a manual task after opening a review to try stale-change protection. This local example
        makes no model calls. Its workspace memory survives reloads.
      </p>
      <details className="aic-context-inspector">
        <summary>Inspect durable activity</summary>
        <pre>{JSON.stringify(actions, null, 2)}</pre>
      </details>
    </>
  );
}
function Example() {
  const [persistence, setPersistence] = useState<AIPersistentMemory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let active: AIPersistentMemory | undefined;
    void createPersistentAIMemory({
      adapter: createWebStorageMemoryAdapter(window.localStorage, 'ai-components:action-demo:v1'),
      maxActions: 50,
    })
      .then(async (controller) => {
        active = controller;
        if (cancelled) await controller.dispose();
        else setPersistence(controller);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
      void active?.dispose().catch(() => {});
    };
  }, []);
  if (error) return <p role="alert">Could not open demo memory: {error}</p>;
  if (!persistence) return <p>Opening demo memory…</p>;
  return (
    <AIProvider memory={persistence.memory} memoryScope={scope}>
      <Workflow />
    </AIProvider>
  );
}
export default {
  label: 'Workspace actions',
  eyebrow: '13 / NEXT MOVE',
  title: 'Context becomes a next move',
  icon: '↗',
  Component: Example,
} satisfies ComponentExample;
