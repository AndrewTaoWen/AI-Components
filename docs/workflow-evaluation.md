# Workflow evaluation

Run `npm run evaluate`. The deterministic rule baseline deliberately misses the paraphrased action;
that recorded failure is a baseline, not a CI error. Use `--require-pass` to gate a candidate suite.
After `npm run build`, run `node scripts/evaluate-workflows.mjs --results results.json --require-pass`
to score model outputs. The file must map every fixture ID to a proposal array, without extra IDs.

Fixtures contain scope, snapshot, selected context, expected/prohibited step labels and allowed evidence
revisions. Review expectations manually. The harness validates proposal shape and scores missing,
unexpected, prohibited and duplicate steps plus unsupported/stale evidence. Label matching is normalized
text, not semantic judging. It does not verify that a model truly used cited context. Add adversarial
fixtures for your own domain and never commit real private workspaces as evaluation data.

`summarizeAIFeedback` measures retained, explicitly instrumented outcomes. Acceptance is not equivalent
to correctness; undo and edits should be inspected alongside it. Retention and missing exposure events
can bias every metric. No model is called by the baseline CLI.
