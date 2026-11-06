# Asynchronous prediction

`useAIAsyncPrediction` accepts a named purpose, explicit `borrow` sources, action type,
developer-owned `evidence`, required `validatePayload`, and an application `generate` callback.
Call `predict()` explicitly. Automatic generation is opt-in with `auto: true` and debounce.
The callback receives only selected immutable JSON, scope, cancellation signal and limits.
It must return a proposal array. No action executes until passed to the existing action-review API.

The hook rejects stale/context-switched responses even if a generator ignores abort, cancels on
unmount, times out noncooperative generators, bounds input/output characters and proposal/step
counts, and replaces model citation claims with developer evidence. The required payload validator
must enforce approved targets and operation shapes. A server must independently enforce authorization,
input limits, request quotas and the supplied output-token cap; client validation is not a billing or
security boundary. Keep callbacks stable and pure selectors deterministic. The callback owns any
model API integration and usage accounting; do not put API keys in client code.

Defaults: explicit triggering, 500ms debounce when enabled, 16,000 selected input characters,
64,000 output characters, ten proposals, fifty steps per proposal, 2,048 requested output tokens,
and a 30-second timeout. Generation alone records no accepted feedback. Failed generation clears
old candidates. An unrelated memory update does not change selected context or restart generation.
