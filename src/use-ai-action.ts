'use client';
import { useEffect, useRef, useState } from 'react';
import { useAI } from './provider.js';
import { cloneAIMemoryValue, type AIMemoryStore, type AIMemoryValue } from './memory.js';

export { AIActionRejectedError } from './actions.js';
export type { AIActionProposal, AIActionEvidence } from './actions.js';
import {
  AIActionRejectedError,
  validateAIActionProposal,
  type AIActionProposal,
} from './actions.js';

export interface AIActionExecution {
  /** Forward to an idempotent application endpoint; reuse it for retries. */
  mutationId: string;
}
export interface AIActionOptions<T extends AIMemoryValue, R extends AIMemoryValue> {
  type: string;
  source?: string;
  scope?: string;
  enabled?: boolean;
  /** Re-read authoritative state. The executor must also check revisions atomically. */
  validate(proposal: AIActionProposal<T>, selectedIds: readonly string[]): void | Promise<void>;
  execute(
    proposal: AIActionProposal<T>,
    selectedIds: readonly string[],
    context: AIActionExecution,
  ): Promise<R>;
  /** Check current revisions before applying a compensating mutation. */
  undo?(receipt: R, context: AIActionExecution): Promise<void>;
}
type Status = 'idle' | 'reviewing' | 'validating' | 'executing' | 'applied' | 'undoing' | 'error';
interface Binding {
  memory: AIMemoryStore;
  scope: string;
  type: string;
  source?: string;
}
interface Attempt<R> {
  mutationId: string;
  selectedIds: readonly string[];
  result?: R;
  committed: boolean;
}
function sameBinding(a: Binding, b: Binding) {
  return a.memory === b.memory && a.scope === b.scope && a.type === b.type && a.source === b.source;
}

/** App-defined predictions enter review explicitly. No execution occurs during generation or render. */
export function useAIAction<T extends AIMemoryValue, R extends AIMemoryValue>(
  options: AIActionOptions<T, R>,
) {
  const environment = useAI();
  const binding: Binding = {
    memory: environment.memory,
    scope: options.scope ?? environment.memoryScope,
    type: options.type,
    source: options.source,
  };
  const currentBinding = useRef(binding);
  currentBinding.current = binding;
  const enabled = environment.enabled && options.enabled !== false;
  const latestEnabled = useRef(enabled);
  latestEnabled.current = enabled;
  const mounted = useRef(true);
  const busy = useRef(false);
  const reviewed = useRef<{
    proposal: AIActionProposal<T>;
    options: AIActionOptions<T, R>;
    binding: Binding;
  } | null>(null);
  const attempt = useRef<Attempt<R> | null>(null);
  const applied = useRef<{
    receipt: R;
    proposalId: string;
    binding: Binding;
    undo: AIActionOptions<T, R>['undo'];
    undoId: string;
    undone: boolean;
    undoStarted: boolean;
  } | null>(null);
  const [proposal, setProposal] = useState<AIActionProposal<T> | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [retryPending, setRetryPending] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  function visible(owner: Binding) {
    return mounted.current && sameBinding(owner, currentBinding.current);
  }
  function report(owner: Binding, cause: unknown) {
    if (visible(owner)) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function record(owner: Binding, outcome: string, data: AIMemoryValue) {
    const mutationId =
      data && typeof data === 'object' ? Reflect.get(data, 'mutationId') : undefined;
    const proposalId =
      data && typeof data === 'object' ? Reflect.get(data, 'proposalId') : undefined;
    // Authoritative projections can already contain the outcome before the executor returns.
    if (
      owner.memory
        .getSnapshot()
        .actions.some(
          (event) =>
            event.scope === owner.scope &&
            event.type === `${owner.type}.${outcome}` &&
            event.data &&
            typeof event.data === 'object' &&
            ((typeof mutationId === 'string' &&
              Reflect.get(event.data, 'mutationId') === mutationId) ||
              (outcome === 'dismissed' &&
                typeof proposalId === 'string' &&
                Reflect.get(event.data, 'proposalId') === proposalId)),
        )
    )
      return;
    owner.memory.recordAction(owner.scope, {
      type: `${owner.type}.${outcome}`,
      source: owner.source,
      data,
    });
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // A new identity/scope never inherits another workspace's review or undo controls.
    reviewed.current = null;
    attempt.current = null;
    applied.current = null;
    setProposal(null);
    setStatus('idle');
    setError('');
    setCanUndo(false);
    setRetryPending(false);
  }, [environment.memory, binding.scope, binding.type, binding.source]);

  function review(input: AIActionProposal<T>): boolean {
    if (!enabled || busy.current || attempt.current || applied.current?.undoStarted) return false;
    try {
      if (!options.type.trim()) throw new Error('An action type is required.');
      const next = validateAIActionProposal(input);
      if (
        binding.memory
          .getSnapshot()
          .actions.some(
            (event) =>
              event.scope === binding.scope &&
              ['accepted', 'dismissed', 'undone'].some(
                (outcome) => event.type === `${binding.type}.${outcome}`,
              ) &&
              event.data &&
              typeof event.data === 'object' &&
              Reflect.get(event.data, 'proposalId') === next.id,
          )
      )
        throw new Error('This proposal already has a recorded outcome. Review a fresh proposal.');
      reviewed.current = { proposal: next, options, binding };
      applied.current = null;
      setCanUndo(false);
      setProposal(next);
      setStatus('reviewing');
      setError('');
      return true;
    } catch (cause) {
      report(binding, cause);
      return false;
    }
  }
  function dismiss(): boolean {
    const entry = reviewed.current;
    if (!entry || busy.current || attempt.current || !sameBinding(entry.binding, binding))
      return false;
    try {
      record(entry.binding, 'dismissed', { proposalId: entry.proposal.id });
      reviewed.current = null;
      setProposal(null);
      setStatus('idle');
      setError('');
      return true;
    } catch (cause) {
      report(entry.binding, cause);
      return false;
    }
  }
  async function accept(selectedIds?: readonly string[]): Promise<boolean> {
    const entry = reviewed.current;
    if (!enabled || busy.current || !entry || !sameBinding(entry.binding, binding)) return false;
    busy.current = true;
    let startedExecution = !!attempt.current;
    try {
      const selection = selectedIds ?? entry.proposal.steps.map((step) => step.id);
      if (
        !selection.length ||
        new Set(selection).size !== selection.length ||
        selection.some((id) => !entry.proposal.steps.some((step) => step.id === id))
      )
        throw new Error('Select unique steps from this proposal.');
      const selected = entry.proposal.steps
        .filter((step) => selection.includes(step.id))
        .map((step) => step.id);
      if (
        attempt.current &&
        JSON.stringify(selected) !== JSON.stringify(attempt.current.selectedIds)
      )
        throw new Error('Retry the same selection to reconcile the previous execution.');
      const transaction = attempt.current ?? {
        mutationId: crypto.randomUUID(),
        selectedIds: Object.freeze(selected),
        committed: false,
      };
      if (!startedExecution) {
        setStatus('validating');
        setError('');
        await entry.options.validate(entry.proposal, transaction.selectedIds);
        if (!visible(entry.binding)) return false;
        if (!latestEnabled.current) {
          setStatus('reviewing');
          return false;
        }
      }
      // An uncertain executor must reconcile its stable mutation ID; do not revalidate against
      // a revision that may already include this exact mutation.
      attempt.current = transaction;
      startedExecution = true;
      if (visible(entry.binding)) {
        setStatus('executing');
        setRetryPending(true);
      }
      if (!transaction.committed) {
        transaction.result = await entry.options.execute(entry.proposal, transaction.selectedIds, {
          mutationId: transaction.mutationId,
        });
        transaction.committed = true;
      }
      const receipt = cloneAIMemoryValue(transaction.result) as R;
      record(entry.binding, 'accepted', {
        proposalId: entry.proposal.id,
        selectedIds: transaction.selectedIds,
        mutationId: transaction.mutationId,
        receipt,
      });
      if (visible(entry.binding)) {
        applied.current = {
          receipt,
          proposalId: entry.proposal.id,
          binding: entry.binding,
          undo: entry.options.undo,
          undoId: crypto.randomUUID(),
          undone: false,
          undoStarted: false,
        };
        attempt.current = null;
        reviewed.current = null;
        setProposal(null);
        setCanUndo(!!entry.options.undo);
        setRetryPending(false);
        setStatus('applied');
        setError('');
      }
      return true;
    } catch (cause) {
      if (visible(entry.binding)) {
        if (cause instanceof AIActionRejectedError && !attempt.current?.committed) {
          attempt.current = null;
          startedExecution = false;
        }
        setRetryPending(startedExecution);
        report(entry.binding, cause);
      }
      return false;
    } finally {
      busy.current = false;
    }
  }
  async function undo(): Promise<boolean> {
    const entry = applied.current;
    if (busy.current || !entry?.undo || !sameBinding(entry.binding, binding)) return false;
    busy.current = true;
    entry.undoStarted = true;
    setStatus('undoing');
    setError('');
    try {
      if (!entry.undone) {
        await entry.undo(entry.receipt, { mutationId: entry.undoId });
        entry.undone = true;
      }
      record(entry.binding, 'undone', { proposalId: entry.proposalId, mutationId: entry.undoId });
      if (visible(entry.binding)) {
        applied.current = null;
        setCanUndo(false);
        setStatus('idle');
      }
      return true;
    } catch (cause) {
      if (cause instanceof AIActionRejectedError && !entry.undone) entry.undoStarted = false;
      report(entry.binding, cause);
      return false;
    } finally {
      busy.current = false;
    }
  }
  return { proposal, status, error, retryPending, canUndo, enabled, review, accept, dismiss, undo };
}
