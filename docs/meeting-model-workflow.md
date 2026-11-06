# Meeting follow-up vertical slice

The Async meeting playground uses `useAIAsyncPrediction`, explicit note/checklist context, payload
target/revision validation, shared review and opt-in feedback. The default offline fixture recognizes
a paraphrase that the explicit Action: keyword baseline misses. This proves the plumbing and UI,
not model quality. No live model comparison or claim of superiority has been made.

Use my prediction backend sends only selected context and an output-token cap to
`/api/predict-meeting` on an explicit click. Supply an authenticated same-origin endpoint with
server-side limits and structured output returning a proposal array. This repo intentionally does
not guess a model, expose credentials, or provide a paid default endpoint. It fails visibly until
that endpoint is configured. The normal server task API is not an arbitrary model-execution endpoint.

After collecting human-reviewed live results, run `npm run build` then
`node scripts/compare-meeting-policies.mjs results.json`. The file covers exactly the baseline fixture
IDs. The report shows both approaches, including misses, unsafe targets, duplicates and failures.
Do not treat canned offline responses as evidence that a live model outperforms rules. Before deploying,
recheck revisions in the authoritative transaction; the example uses local controlled state.
