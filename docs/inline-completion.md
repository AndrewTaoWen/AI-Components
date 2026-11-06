# Native textarea inline completion

`AIInlineTextarea` is a controlled native textarea with a positioned, aria-hidden ghost suffix.
`useAICompletion` provides the same headless lifecycle for other editors. Pass ordinary `value`,
`onValueChange` and optional writing configuration/recipe. This is opt-in by choosing the inline
component (or set `ai.autocomplete: false` to disable). Existing AIInput/AITextarea are unchanged.

Generation is debounced, focused-only, suppressed for selection ranges, mid-line carets, composition,
read-only and disabled controls. It uses at most the last 8,000 prefix characters (configurable).
Only the first returned line, capped at 256 characters, is eligible for acceptance. Tab accepts at
the unchanged original caret, Escape dismisses, and Shift+Tab keeps native navigation. Acceptance
uses the existing optional remember binding. Context changes/unmount cancel and stale results are
ignored. A polite status announces the suggestion without duplicating ghost text in accessibility.

A text-only mirror copies font, line-height, padding, spacing and wrapping to locate the caret.
Coordinates update on selection, scrolling, resize and accepted text; long suffixes are clipped to
the remaining line width. This first renderer does not show multiline completions, rich-text blocks,
or insert ghost text into an existing word. Native handlers/refs and form behavior remain available.
Custom fonts, RTL/bidi and mobile virtual keyboards should be tested for each application's styling;
the renderer is not a rich-text editor integration.
Explicit transport/server limits still control costs.
