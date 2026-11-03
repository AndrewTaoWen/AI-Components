# Workflow feedback

`useAIAction({ ..., feedback: { policyId, sourceRevisions } })` opts into shown, accepted,
dismissed and undone feedback. Existing applications record nothing new unless enabled.
`recordAIFeedback(memory, scope, event)` records explicit edits or custom workflow exposure;
`readAIFeedback(snapshot, scope, policyId?)` reads retained events. Feedback contains policy/proposal
IDs, action type, revisions, optional selected IDs and mutation ID. Private drafts are not recorded
by default. Applications decide whether to provide an explicit edit summary.

Shown means a successful explicit `review`, rather than merely generating a candidate. Idempotency
is bounded by retained memory history, not a substitute for a backend ledger. Scope and user/storage
boundaries follow the existing provider. Correct measurements require applications to instrument all
relevant outcomes; counts do not prove suggestion quality or constitute model training.
