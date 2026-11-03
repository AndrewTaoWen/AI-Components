'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAI } from './provider.js';
import {
  expireAIFacts,
  forgetAIFact,
  readAIFacts,
  rememberAIFact,
  type AIMemoryFact,
} from './facts.js';
/** Mount near the provider to publish expiry and invalidate borrowed context, even with no panel open. */
export function useAIFactExpiry(scope?: string) {
  const environment = useAI();
  const resolved = scope ?? environment.memoryScope;
  const snapshot = useSyncExternalStore(
    environment.memory.subscribe,
    environment.memory.getSnapshot,
    environment.memory.getSnapshot,
  );
  const dates = readAIFacts(snapshot, resolved).flatMap((fact) =>
    fact.expiresAt ? [Date.parse(fact.expiresAt)] : [],
  );
  const next = dates.length ? Math.min(...dates) : null;
  useEffect(() => {
    if (next === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = next - Date.now();
      timer = setTimeout(
        () => {
          if (next > Date.now()) schedule();
          else expireAIFacts(environment.memory, resolved);
        },
        Math.min(2_147_483_647, Math.max(0, remaining)),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [environment.memory, resolved, snapshot, next]);
}
function FactEditor({ fact, scope }: { fact: AIMemoryFact; scope: string }) {
  const { memory } = useAI();
  const [draft, setDraft] = useState(
    typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value),
  );
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        try {
          rememberAIFact(memory, scope, {
            ...fact,
            value: typeof fact.value === 'string' ? draft : JSON.parse(draft),
            confirmed: true,
            source: { label: 'User correction', reference: fact.source.reference },
          });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <label>
        {fact.id}
        <input
          aria-label={`Edit memory fact ${fact.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p>
        {fact.source.label} · {fact.confirmed ? 'Confirmed' : 'Unconfirmed'}
        {fact.expiresAt ? ` · expires ${new Date(fact.expiresAt).toLocaleString()}` : ''}
      </p>
      <button type="submit">Save and confirm {fact.id}</button>
      <button type="button" onClick={() => forgetAIFact(memory, scope, fact.id)}>
        Forget {fact.id}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function AIMemoryPanel({ scope }: { scope?: string }) {
  const environment = useAI();
  const resolved = scope ?? environment.memoryScope;
  const snapshot = useSyncExternalStore(
    environment.memory.subscribe,
    environment.memory.getSnapshot,
    environment.memory.getSnapshot,
  );
  useAIFactExpiry(resolved);
  return (
    <section className="aic-memory-panel" aria-label="Managed memory">
      <h3>Memory for {resolved}</h3>
      <p>
        Correct, confirm or forget facts used by managed retrieval. Forgetting this scope also
        clears its preferences and retained activity.
      </p>
      {readAIFacts(snapshot, resolved).map((fact) => (
        <FactEditor key={`${fact.id}:${fact.updatedAt}`} fact={fact} scope={resolved} />
      ))}
      <button type="button" onClick={() => environment.memory.clear(resolved)}>
        Forget this scope
      </button>
    </section>
  );
}
