# Headless inline completion

`useAICompletion` supplies debounced suffix suggestions for controlled editors. Pass the value, selection, focus/composition state and optional writing recipe. Generation requires a collapsed end-of-line caret. Only the first returned line (at most 256 characters) can be accepted. Input context defaults to the last 8,000 prefix characters.

`accept()` returns a value/caret pair only while the original text and caret remain current. Apply it explicitly in the host editor. `dismiss()` cancels; changed context and unmount reject stale responses. The host must disable generation for read-only inputs and handle native keyboard/composition behavior.
