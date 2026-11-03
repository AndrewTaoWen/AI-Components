# Feedback-driven suggestion controls

`AIPreferencePanel` exposes normal/less/off frequency, preferred tone, default target, permanent
per-proposal suppression, and reset. The pure preferences subpath provides the same operations for
custom UIs. Settings live in provider-scoped memory and persist only when that memory is persisted.
Tone and target are explicit facts: a recipe/policy must deliberately borrow and validate them;
the framework never silently forwards all preferences to a model or treats a preferred target as
an authorization grant.

Synchronous policies honor these gates automatically. Normal frequency applies a 15-minute cooldown
per consecutive dismissal/undo (capped at four); Less also spaces shown suggestions by at least an
hour. Accepted outcomes reset the negative streak. Reset ignores earlier feedback for adaptive
cooldown while preserving the actual history. Use `now` in evaluator/gate tests for repeatability.
Gates are checked on evaluation; expiry does not start background timers or model calls. External
async generators should check `evaluateAIPreferenceGate` before initiating a paid request.

This is a transparent rule over retained feedback, not trained personalization. Preferences organize
scopes rather than enforce user/workspace security. Retention can change the available feedback;
production applications should choose their durability and privacy policy deliberately.
