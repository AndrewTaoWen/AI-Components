# Prediction policies and inspectable context

Policies connect deliberately selected facts and actions to app-defined, reviewable next moves.
They run locally and synchronously, never call a model or execute an action, and receive only their
selected JSON context. Use existing AI tasks to generate candidate data explicitly if needed, then
let a policy validate and turn that data into a proposal.

```tsx
const policy = defineAIPolicy<{ text: string }>({
  name: 'support.followup',
  purpose: 'Suggest follow-up after an accepted customer request.',
  actionType: 'followup',
  borrow: { request: fromAction('request.accepted'), customer: fromMemory('customer') },
  predict({ borrowed }) {
    if (!borrowed.request) return [];
    return [
      {
        id: 'accepted-request-23:checklist-revision-7', // Include evidence revisions in real apps.
        title: 'Prepare follow-up',
        steps: [{ id: 'confirm', label: 'Confirm receipt', payload: { text: 'Confirm receipt' } }],
        evidence: [{ label: 'Accepted customer request', reference: 'event 23' }],
      },
    ];
  },
});
const { predictions, errors } = useAIPrediction({ policies: [policy] });
// On an explicit Review click: action.review(predictions[0].proposal).
<AIContextInspector inspection={predictions[0]?.inspection ?? null} />;
```

`evaluateAIPolicies` is the same evaluator used by the hook, exported from the React-free
`@ai-components/react/prediction` subpath for server-side use. Supply `snapshot`, `scope`, `policies`,
and optional static `context` and `maxPredictions` (default 20). It validates/freeze-clones every
proposal before returning a policy's results, deduplicates action-type/proposal-ID pairs, and
suppresses accepted/dismissed/undone IDs retained in the same scope. Policy names must be unique.
A failed policy returns an error without partial candidates; other policies can still succeed.
Payload/provenance shape validation also lives in React-free `@ai-components/react/actions`.

The hook reevaluates on memory or contextual changes and respects provider/component `enabled`.
Policies and selectors must be pure. They are deterministic developer-authored rules, not learned
behavior, model reasoning, authorization, or an autonomous planner. Keep selected data bounded;
retention bounds suppression, so authoritative idempotency remains the application's responsibility.
Review captures an immutable candidate; execution must validate fresh source/target revisions.

The inspector lists the policy purpose, scope, selected source descriptions and their actual values.
It never dumps unselected provider memory or raw prompts. `inspectAIRequest(task.prepare(input), scope)`
produces the same inspector shape for existing prompt recipes and their anticipated use. Evidence
labels come from app configuration and are not verified model citations.

## Server-owned projections

The built-in `createAIMemory` store now returns `AIHydratableMemoryStore`, which adds
`replaceSnapshot(snapshot)`. It validates first and publishes a replacement atomically, retaining
store identity and subscriptions. Existing custom `AIMemoryStore` implementations remain valid.
Use this when projecting authoritative backend events/state into components after a save; the app
must guard response freshness, tenant identity, and revisions before replacement. This is replacement,
not a merge: speculative client-only facts are discarded. Keep durable domain mutations and their
ledger atomic in the backend, and expose only approved context in the projection. Do not persist a
stale client projection over an authoritative event ledger.
