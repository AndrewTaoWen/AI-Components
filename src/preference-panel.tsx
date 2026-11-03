'use client';
import { useSyncExternalStore } from 'react';
import { useAI } from './provider.js';
import {
  evaluateAIPreferenceGate,
  getAIPolicyPreference,
  resetAIPolicyPreference,
  setAIPolicyPreference,
  type AIPolicyPreference,
} from './preferences.js';
export function AIPreferencePanel({
  policyId,
  scope,
  proposalId,
}: {
  policyId: string;
  scope?: string;
  proposalId?: string;
}) {
  const environment = useAI();
  const resolved = scope ?? environment.memoryScope;
  const snapshot = useSyncExternalStore(
    environment.memory.subscribe,
    environment.memory.getSnapshot,
    environment.memory.getSnapshot,
  );
  const preference = getAIPolicyPreference(snapshot, resolved, policyId);
  const gate = evaluateAIPreferenceGate(snapshot, resolved, policyId, proposalId);
  const update = (patch: Partial<AIPolicyPreference>) =>
    setAIPolicyPreference(environment.memory, resolved, policyId, patch);
  return (
    <details className="aic-context-inspector">
      <summary>Suggestion preferences</summary>
      <p>
        Policy: {policyId} · Scope: {resolved}
      </p>
      <label>
        Suggestion frequency
        <select
          aria-label="Suggestion frequency"
          value={preference.frequency}
          onChange={(event) =>
            update({ frequency: event.target.value as AIPolicyPreference['frequency'] })
          }
        >
          <option value="normal">Normal</option>
          <option value="less">Less often</option>
          <option value="off">Off</option>
        </select>
      </label>
      <label>
        Preferred tone
        <input
          aria-label="Preferred suggestion tone"
          value={preference.preferredTone}
          onChange={(event) => update({ preferredTone: event.target.value })}
        />
      </label>
      <label>
        Default target
        <input
          aria-label="Preferred suggestion target"
          value={preference.defaultTarget}
          onChange={(event) => update({ defaultTarget: event.target.value })}
        />
      </label>
      {proposalId && (
        <button
          type="button"
          onClick={() =>
            update({
              blockedProposalIds: [...new Set([...preference.blockedProposalIds, proposalId])],
            })
          }
        >
          Don’t suggest this again
        </button>
      )}
      {!gate.allowed && (
        <p role="status">
          {gate.reason}
          {gate.retryAt ? ` Try again after ${new Date(gate.retryAt).toLocaleString()}.` : ''}
        </p>
      )}
      <button
        type="button"
        onClick={() => resetAIPolicyPreference(environment.memory, resolved, policyId)}
      >
        Reset suggestion preferences
      </button>
    </details>
  );
}
