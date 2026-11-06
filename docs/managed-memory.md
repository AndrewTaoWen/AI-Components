# Managed facts

`rememberAIFact` stores JSON values with provenance, confirmation and optional expiry. `fromFact` selects confirmed, unexpired facts; unconfirmed retrieval requires explicit opt-in. `forgetAIFact` removes a fact, and `expireAIFacts` sweeps expired values. Published corrections and removals invalidate borrowed context.

Selectors do not mutate memory. Applications must publish expiry with a sweep when needed and independently filter server retrieval. Managed forgetting does not erase copies in logs or backend domain ledgers. Use a persistence adapter to retain corrections across reloads.
