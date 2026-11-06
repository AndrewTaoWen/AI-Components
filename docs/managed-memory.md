# Editable managed facts

`rememberAIFact` stores JSON facts with ID, source, created/updated time, optional expiry and explicit
confirmation. `fromFact` borrows confirmed, unexpired values only; unconfirmed use must be opted into.
`forgetAIFact` removes a managed fact, `expireAIFacts` sweeps a scope, and the existing `clear(scope)`
forgets that scope's facts, preferences and retained activity. Published updates invalidate borrowed
in-flight requests and reviewed proposals through the existing recipe lifecycle.

Mount `useAIFactExpiry` near each active provider/scope to publish TTL expiry while the app is open.
`AIMemoryPanel` includes this hook and lets users inspect, correct, confirm and forget facts. Server
retrieval should independently filter expiry, not depend on a browser timer. Selectors never mutate
memory. Changing a fact keeps its created time and marks corrections as confirmed user input.

Managed forgetting does not erase arbitrary copies placed in application logs, other scopes, or a
backend domain ledger. Applications need their own export/erasure and access policies. Choose a
persistence adapter if corrections should survive reload. The panel does not store credentials or
infer permission from a remembered fact. The Memory controls playground demonstrates correcting an
old company name and inspecting the changed request context.
