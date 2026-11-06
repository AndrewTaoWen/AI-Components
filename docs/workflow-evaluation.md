# Workflow evaluation

`evaluateWorkflowCase` validates and scores proposals against app-reviewed workflow cases. It reports missing, unexpected, prohibited and duplicate step labels plus unsupported or stale evidence. Label matching is normalized text, not semantic judging. It cannot establish whether a model truly used cited context.

`summarizeAIFeedback` summarizes retained explicit outcomes. Acceptance does not establish correctness; inspect edits and undo too. Retention and missing exposure events can bias metrics. Never use private workspace data in committed evaluation cases.
