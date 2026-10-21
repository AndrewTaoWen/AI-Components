# AI Components

An early, MIT-licensed React + TypeScript framework for AI-enhanced **everyday UI**: inputs, textareas, search bars, selects, and form autofill. Bring your own model and server. No chat interface required.

## Run this repository

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The playground uses **deterministic mock responses**, so no API key is needed. Its mock search understands paid/unpaid, `over $N`, and Acme. It is not a general natural-language engine. Switching to `/api/ai` requires implementing that endpoint in your application's backend; Vite does not provide it.

```sh
npm run typecheck
npm test
npm run build
npm run build:demo
npm run format:check
```

The package name is provisional and is not published. To use the local package in another app, run `npm pack` here, then install the resulting tarball in that app.

## Shared configuration

```tsx
import { AIProvider, AIInput, AITextarea } from '@ai-components/react';
import '@ai-components/react/styles.css'; // optional defaults

<AIProvider
  endpoint="/api/ai"
  basePrompt="Write clearly and use our brand voice."
  context={{ product: 'Acme' }}
>
  <AIInput
    value={subject}
    onValueChange={setSubject}
    aria-label="Subject"
    ai={{ autocomplete: true, prompt: 'Complete an email subject.' }}
  />
  <AITextarea
    value={reply}
    onValueChange={setReply}
    aria-label="Reply"
    ai={{ autocomplete: true, helpMeWrite: true }}
  />
</AIProvider>;
```

`AIProvider` propagates the transport, default prompt, context, and enabled state. Nested providers inherit the transport, append their prompt, and merge context. Component prompts append to provider prompts; component context overrides inherited context. `enabled={false}` on an ancestor disables AI throughout that subtree.

For persistence adapters and restored history retrieval, see [Durable scoped memory](docs/durable-memory.md).

## Shared workflow memory

The provider now owns session memory as well as configuration. `useAIMemory()` reads the current scope and offers deliberate updates:

```tsx
import { AIProvider, createAIMemory, useAIMemory } from '@ai-components/react';
import { useState } from 'react';

function App() {
  const [memory] = useState(() =>
    createAIMemory({
      initial: { shared: { tone: 'friendly' } },
      maxActions: 50,
    }),
  );
  return (
    <AIProvider endpoint="/api/ai" memory={memory}>
      {/* components */}
    </AIProvider>
  );
}

function CustomerStep() {
  const { remember } = useAIMemory();
  return (
    <button
      onClick={() => {
        remember(
          'customer',
          { name: 'Alex', company: 'Northwind' },
          {
            type: 'customer.accepted',
            source: 'customer-form',
          },
        );
      }}
    >
      Use customer
    </button>
  );
}
```

`updateMemory(patch)` shallow-merges plain JSON state without adding an action. Its updater form receives the current immutable scope. `recordAction({ type, data, source? })` records a deliberate application event without changing state. `remember(key, value, { type, source? })` performs both atomically. `clearMemory()` removes the current scope's data and history. Values are cloned and frozen; cycles, nonfinite numbers, class instances, and unsafe keys are rejected. Optional undefined object properties are omitted. History is bounded across the store (50 actions by default), not per component.

Nested providers share their parent's memory store. `<AIProvider memoryScope="ticket-123">` changes the default scope for its subtree; `useAIMemory('shared')` accesses a named scope explicitly. Separate root providers create separate stores unless given the same store. Scopes organize application state; they are not authorization boundaries. Memory lasts while the provider/store is alive. Persistence across reloads is opt-in with `createPersistentAIMemory` or an application-owned `AIMemoryStore`; see the durable memory guide. Create a store per user/request on the server, never as an SSR singleton.

The `@ai-components/react/memory` and `@ai-components/react/context` subpaths expose the pure store and recipe/request utilities without a React dependency or client directive, for server-side integrations and tests.

### Remember accepted component results

Components opt in through the same `ai` configuration:

```tsx
<AIFormFill
  fields={customerFields}
  parse={parseCustomer}
  onApply={setCustomer}
  ai={{
    remember: {
      key: 'customer',
      action: 'customer.accepted',
      source: 'contact-form',
    },
  }}
/>
```

The binding records only an accepted AI result: Apply values, Use draft/rewrite/date, a suggested option/tag click, Add matches, or Apply mappings/filters. Generating, discarding, typing, and ordinary manual edits do not automatically write history. Search records validated filters when a submitted AI search invokes `onSearch`. Without a binding, existing components write nothing. Optional `scope` overrides the provider scope; optional `project(value)` converts application-specific values into JSON before remembering them. A missing `action` defaults to `${key}.accepted`. Manual workflows can call the memory hook directly when a user commits an action.

## Prompt recipes: borrow context and anticipate use

Recipes let developers describe the job of a field/hook, choose relevant facts and accepted actions, and explain how its output will be consumed. They work with **every component's `ai.recipe`** and with `useAITask` directly:

```tsx
import {
  defineAIContext,
  fromMemory,
  fromAction,
  fromContext,
  useAITask,
} from '@ai-components/react';

// Define at module scope (or useMemo) so its identity stays stable.
const replyRecipe = defineAIContext({
  name: 'support.reply',
  purpose: 'Help an agent draft the next customer reply.',
  borrow: {
    customer: fromMemory('customer'),
    lastAcceptedFilters: fromAction('filters.accepted'),
    product: fromContext('product'),
    // Custom pure selectors can pick a subset or derive workflow facts.
    completedSteps: (view) => view.history().map((action) => action.type),
  },
  instructions: ({ borrowed }) =>
    borrowed.customer
      ? 'Use the accepted customer details. Preserve their meaning.'
      : 'Keep the reply generic. Do not invent customer details.',
  anticipate: ({ input }) =>
    input.action === 'complete'
      ? 'The agent may press Tab. Return only a suffix to append.'
      : 'The agent will review a complete replacement before sending it.',
});

const task = useAITask({
  recipe: replyRecipe,
  prompt: 'Keep the tone warm and concise.',
  remember: { key: 'reply', action: 'reply.accepted' },
});

// Inspecting assembles the exact request but does not call a model or write memory.
const request = task.prepare({ action: 'rewrite', text: draft });
const result = await task.run({ action: 'rewrite', text: draft });
// Headless code explicitly remembers only when the user accepts the result:
if (result && userAccepted) task.remember(result.text);
```

`fromMemory(key, scope?)` selects one state key. `fromAction(type, scope?)` selects the latest matching action (including its data, timestamp, scope, and source). `fromContext(key)` borrows a key from the existing provider/component context. Missing sources are omitted. Selectors receive `input`, the merged static `context`, the current `scope`, `read(key, scope?)`, and `history(type?, scope?)`. `instructions` and `anticipate` additionally receive the selected `borrowed` values. Keep selectors pure and return serializable data.

Only selected memory/history enters `context._ai.borrowed`; the whole store is never implicitly sent. The reserved `_ai` namespace also includes the recipe name, source descriptions, and `expectedUse`. Existing static provider/component context continues to be included as before. Base prompt, component prompt, purpose, instructions, and anticipated use are assembled in that order. The original action-specific `instruction` remains a separate request field so adapters can honor output contracts. Model adapters must include the request context when constructing their model messages.

`anticipate` is a developer-authored planning function, not an autonomous action or a separate predictive-model call. It can use past actions and current input to describe the likely next step. Actual interaction remains under application/user control. Changing borrowed context cancels an in-flight request and invalidates reviewed proposals; unrelated memory updates leave them intact. Changes to provider configuration still invalidate requests as before. Selector failures appear in the task error state without sending a partial request.

The **Workflow memory** playground demonstrates accepting customer details in one component, borrowing them in a separate writing control, and inspecting the assembled request. It uses deterministic mocks and a named demo scope.

Inputs are controlled with `value` and `onValueChange`; native attributes and refs pass through. `onChange` and `defaultValue` are intentionally replaced. Custom classes and optional CSS variables (`--aic-accent`, `--aic-border`, `--aic-surface`) let you style them. No styling framework is required.

Autocomplete is opt-in, debounced (600ms default), starts after three characters, and runs only while focused with the caret at the end. Suggestions appear **below the field** in this first release. Tab accepts a visible suggestion; Shift+Tab navigates normally; Escape dismisses it. Composition input suppresses completion. Drafts require an explicit “Use draft” action. Read-only and disabled fields do not generate. Text edits, configuration changes, and unmounts cancel requests; stale responses are ignored even if a custom transport ignores cancellation.

## Natural-language search

```tsx
type Filters = { status: 'paid' | 'unpaid' | null };

function validateFilters(data: unknown): Filters {
  if (!data || typeof data !== 'object' || !('status' in data)) {
    throw new Error('Missing status filter');
  }
  const status = data.status;
  if (status !== null && status !== 'paid' && status !== 'unpaid') {
    throw new Error('Unsupported status');
  }
  return { status };
}

<AISearch
  value={query}
  onValueChange={setQuery}
  aria-label="Search invoices"
  ai={{ prompt: 'Return data with status: paid, unpaid, or null.' }}
  parse={validateFilters}
  onSearch={(filters) => fetchInvoices(filters)}
  onPlainSearch={(query) => fetchInvoicesByKeyword(query)}
/>;
```

The component interprets on submit, validates `response.data` through your `parse` function, then calls `onSearch`. It never executes queries or searches your database itself. Zod or another validator can be used as `parse={schema.parse}`. Define the output contract in the prompt and your model adapter's structured-output configuration. `onPlainSearch` handles submits when AI is disabled.

## Semantic select

`AISelect` keeps a native single select (including `name`, `required`, labels, and refs). Its optional assistant matches a description against the options you supply. It sends only enabled options and rejects fabricated or disabled values. Generating suggestions does not change the selection; the user chooses a result.

```tsx
import { AISelect, type AISelectOption } from '@ai-components/react';

// Keep option arrays stable, e.g. at module scope or with useMemo.
const departments: AISelectOption[] = [
  { value: 'support', label: 'Support', description: 'Account and technical help' },
  { value: 'finance', label: 'Finance', description: 'Invoices and billing' },
];

<AISelect
  aria-label="Department"
  name="department"
  value={department}
  onValueChange={setDepartment}
  options={departments}
  ai={{ prompt: 'Route this request to the best team.' }}
/>;
```

The `select` transport action receives `context.options` and expects `{ text: '', data: { values: ['finance'] } }`. Values are ordered by relevance and deduplicated; an empty array displays a no-match message. Each option needs a unique, nonempty value. Enter in the description field finds options without submitting an enclosing form; Escape dismisses suggestions. With AI disabled, native selection continues to work. This component uses a separate description input and suggestion buttons, not a custom ARIA combobox.

## Reviewable form autofill

`AIFormFill` extracts fields from text the user pastes into its textarea. It does not read the clipboard automatically. The component validates both the model result and the application parser output against a field whitelist, then shows a proposal. Only “Apply values” calls `onApply`; it does not submit the form. Source text, configuration, or field changes invalidate the proposal.

```tsx
import { AIFormFill, type AIFormField } from '@ai-components/react';

const fields: AIFormField[] = [
  { name: 'name', label: 'Name' },
  { name: 'email', label: 'Email' },
];

type ContactPatch = { name?: string; email?: string };

// Your validator checks field types and constraints. It should return only
// extracted fields; adding defaults could overwrite existing values.
function parseContact(data: unknown): ContactPatch {
  if (!data || typeof data !== 'object') throw new Error('Expected contact values.');
  const values = data as Record<string, unknown>;
  const patch: ContactPatch = {};
  for (const key of ['name', 'email'] as const) {
    if (!(key in values)) continue;
    if (typeof values[key] !== 'string') throw new Error('Expected text.');
    patch[key] = values[key];
  }
  return patch;
}

<AIFormFill
  fields={fields}
  parse={parseContact}
  onApply={(patch) => setContact((current) => ({ ...current, ...patch }))}
  ai={{ prompt: 'Extract contact details; omit anything missing.' }}
/>;
```

The `extract` action receives `context.fields` and expects `{ text: '', data: { name: 'Alex' } }`. Missing fields should be omitted. Use your parser to enforce types, formats, and constraints; the library checks field names, not domain-specific values. All returned fields are reviewed and applied together. `renderValue` customizes proposal display for complex field values. Keep `fields` and `parse` references stable to avoid invalidating a proposal on unrelated parent renders. Both new components inherit provider prompts, context, transport, cancellation, and the AI enabled state.

The playground now includes Semantic select and Form autofill tabs. The mock select recognizes billing, login, and sales keywords; mock extraction recognizes `Name:`, `Email:`, and `Company:` on separate lines. Real semantic matching and extraction require your model adapter.

## Server-side API keys

Configure your model's key **once in your server environment**. Propagate the endpoint through the React provider, not the secret. Keys must never be placed in `VITE_*` variables or frontend props.

The server subpath contains no React imports. This Web-standard handler works in Fetch-based route runtimes:

```ts
import { createAIHandler } from '@ai-components/react/server';
import { modelClient, authenticate, consumeRateLimit } from './your-backend';

// Your modelClient reads its credentials from server environment variables.
export const POST = createAIHandler({
  authorize: async (request) => {
    const user = await authenticate(request);
    return Boolean(user && (await consumeRateLimit(user.id)));
  },
  basePrompt: 'Follow the application writing guidelines.',
  context: { organization: 'Acme' },
  generate: async (request, { signal }) => {
    // Implement this adapter using your preferred LLM SDK.
    // complete: return ONLY the suffix to append.
    // write/rewrite: return the full proposed draft.
    // search: return { text: '', data: validated structured filters }.
    // select: return { text: '', data: { values: ['existing-option-value'] } }.
    // extract: return { text: '', data: { fieldName: 'extracted value' } }.
    return modelClient.generate(request, { signal });
  },
});
```

`modelClient`, authentication, and rate limiting in this example are application-owned integration points, not exports from this package. No vendor SDK is bundled. The handler checks authorization, method, JSON shape, and a streamed 32 KiB body limit. Provider failures return a generic error. Server context overrides conflicting client context. Client prompts and context remain untrusted input; prompt ordering is not an access-control boundary. Scope data access and allowed filters on your backend and validate model output there as well.

For browser-session authentication, enforce your application's same-origin/CSRF policy in `authorize`. No permissive CORS headers are added.

## Custom transports and headless usage

```tsx
import { AIProvider, useAITask, type AITransport } from '@ai-components/react';

const transport: AITransport = {
  async generate(request, { signal }) {
    return yourClient.generate(request, { signal });
  },
};

<AIProvider transport={transport}>{children}</AIProvider>;

// Inside any descendant component:
const { run, cancel, status, error } = useAITask({ prompt: 'Your instructions' });
const result = await run({ action: 'rewrite', text: draft, instruction: 'Shorten' });
```

The transport contract is `AIRequest -> Promise<AIResponse>`. Actions are `complete`, `write`, `rewrite`, `search`, `select`, and `extract`. A response always has `text: string`, with optional `data: unknown`. `run` returns `null` on cancellation, disabled AI, or failure; inspect `error` and `status`. `createFetchTransport` accepts custom headers (including an async factory) and an injected fetch implementation. Existing custom transports need handlers for the two new actions before using the new components. Model instructions describe the output contracts; adapters should enforce them with structured output and backend validation as well.

## Review changes across an existing form

`useAISuggestion` proposes a transaction over explicitly allowed, top-level string fields. Keep
using ordinary controlled inputs and your own state; `AIChangePreview` supplies an optional
checkbox review UI with before/after values and recipe source labels.

```tsx
import { useState } from 'react';
import {
  AIChangePreview,
  defineAIContext,
  fromMemory,
  useAISuggestion,
} from '@ai-components/react';

const fields = [
  { key: 'category', label: 'Category' },
  { key: 'reply', label: 'Reply' },
] as const;
const ai = {
  recipe: defineAIContext({
    name: 'support.triage',
    purpose: 'Prepare the next step of a support request for human review.',
    borrow: { customer: fromMemory('customer') },
    anticipate: () => 'The agent will choose which fields to apply. Nothing is sent.',
  }),
  remember: { key: 'triage', action: 'triage.accepted' },
};

function SupportForm() {
  const [value, setValue] = useState({ category: '', reply: '' });
  const suggestion = useAISuggestion({ value, onValueChange: setValue, fields, ai });
  return (
    <>
      <input
        aria-label="Category"
        value={value.category}
        onChange={(event) => setValue({ ...value, category: event.target.value })}
      />
      <textarea
        aria-label="Reply"
        value={value.reply}
        onChange={(event) => setValue({ ...value, reply: event.target.value })}
      />
      <button
        disabled={!suggestion.enabled || suggestion.status === 'loading'}
        onClick={() => suggestion.suggest('Categorize this request and draft a reply.')}
      >
        Suggest next steps
      </button>
      <AIChangePreview
        changes={suggestion.changes}
        sources={suggestion.sources}
        onAccept={suggestion.accept}
        onDismiss={suggestion.dismiss}
        onUndo={suggestion.undo}
        canUndo={suggestion.canUndo}
      />
      <p role="status">{suggestion.error}</p>
    </>
  );
}
```

Render this form inside an `AIProvider`. Keep configuration outside the component (or memoize it),
just like other AI controls.

The transport receives an `extract` request whose text contains the allowed fields and their current
values; other form fields are excluded. Return structured `data` in this shape:

```json
{
  "changes": [
    { "field": "category", "value": "Billing", "reason": "The request concerns a charge." }
  ]
}
```

Unknown fields, duplicate fields, non-string values, and malformed output reject the whole proposal.
No-op changes are omitted. `changes` is `null` before a proposal and `[]` when no changes are needed.
The source labels identify context supplied by the recipe; they are not proof that a model relied on
a particular source. Reasons are model-generated explanations.

`accept()` applies all proposed changes; `accept(['category'])` applies only those keys. Applying a
batch closes the review and discards unchecked changes. `dismiss()` cancels generation and discards
the proposal. Value, field, configuration, and borrowed-context changes invalidate stale proposals.
Generating or dismissing never records accepted memory.

`undo()` restores the most recent accepted batch while preserving unrelated edits. It refuses the
entire undo if an affected field no longer matches its applied value. Only one batch is retained;
this is a local controlled-state undo, not a rollback of server writes or other callback side effects.
With `ai.remember`, acceptance stores the resulting form value and undo stores the restored value
with an `<accepted-action>.undone` action. The memory projection and binding from acceptance are
retained for undo. Scope/provider or allowed-field changes clear the undo checkpoint.

## Scope of v0.1

### AIMultiSelect

Use `<AIMultiSelect value={selected} onValueChange={setSelected} options={options} />` for native checkboxes plus reviewed semantic batch selection. `name` supports normal repeated form values, and `maxSelected` limits manual additions and rejects oversized AI batches. The `select` action receives enabled `context.options`, `context.selected`, `selectionMode: 'multi'`, and nullable `remainingSlots`, then returns `data: { values: ['existing-value'] }`. Suggestions are deduplicated and exclude current choices. Add matches merges the reviewed additions with existing selections; it does not replace them. Disabled and invented options are rejected. With AI disabled, checkboxes continue to work. The mock recognizes design and engineering keywords for the fixed sample team.

### AIFieldMapper

`<AIFieldMapper sources={columnNames} targets={targetOptions} value={mappings} onValueChange={setMappings} />` offers reviewed one-to-one field mappings plus manual selects. Source names and target values must be unique. The `extract` action receives `context.mapping` (source headers and enabled targets) and returns `data: { mappings: [{ source, target }] }`. Unknown sources/targets, disabled targets, and duplicate sources or targets are rejected. Applying replaces the mapping list; unmapped columns are omitted. The component does not parse CSVs, upload file rows, transform values, or execute imports. The Field mapper mock uses three fixed sample headers.

### AIDateInput

Use `<AIDateInput value={date} onValueChange={setDate} referenceDate="2026-10-20T12:00:00Z" timeZone="America/Toronto" />` for native date/time fields plus reviewed interpretation of relative phrases. The value is `{ date: 'YYYY-MM-DD', time?: 'HH:mm', timeZone } | null`. `extract` receives `context.dateInput` and returns that object in `data`. Invalid calendar dates, times, and changes to the requested timezone are rejected. Keep `referenceDate` fixed for a user's interpretation session. The output is local calendar data, not a UTC instant: the app must resolve DST gaps/overlaps and enforce scheduling constraints before saving. The demo uses an explicitly fixed reference and a canned October 23 result, not a general date parser.

### AIRewriteMenu

Attach `<AIRewriteMenu value={text} onValueChange={setText} />` to any controlled text field. Native buttons offer Shorten, Clarify, Friendlier, and More formal actions, followed by a preview with Use rewrite / Discard. Pass custom `actions` (`id`, `label`, `instruction`) for translation or application-specific edits. The existing `rewrite` action returns the full replacement in `response.text`. Empty results are rejected; editing the original text invalidates in-flight or reviewed drafts. This is a button group, with ordinary Tab navigation, rather than an ARIA menu. The playground uses a canned mock rewrite.

### AIFilterBar

`<AIFilterBar fields={fields} value={filters} onValueChange={setFilters} />` turns text into a reviewed replacement list of AND filters. Declare each field's `name`, `label`, `type` (`text`, `number`, or ISO `date`), and allowed `operators`. The `search` action receives `context.fields` and returns `data: { filters: [{ field, operator, value }] }`. Unknown fields/operators, nonfinite numbers, and invalid calendar dates are rejected. Optional `validate` adds domain constraints. Users can edit operator/value or remove accepted filters even with AI disabled; the component does not execute queries. The Filter bar mock recognizes unpaid/paid and “over $N.”

### AITagInput

Use `<AITagInput value={tags} onValueChange={setTags} options={allowedTags} text={content} />` to suggest tags from an approved list. Each option has `value`, `label`, and optional `description` / `disabled`. Optional `maxTags` limits additions; `name` emits repeated hidden form fields. Manual addition/removal works with AI disabled. The `select` action receives `context.options` and `context.selected`, and returns `{ text: '', data: { values: ['existing-tag'] } }`. Suggestions are deduplicated, validated, and added only when clicked. Keep option and controlled value references stable. The Tag input playground uses keyword-based mock suggestions.

Included: shared providers, scoped session memory, accepted-action history, prompt recipes with selective context borrowing, headless task and suggestion lifecycles, selective change review with undo, input and textarea assistance, typed search validation, semantic select, reviewable form autofill, fetch transport, server handler, optional styles, playground, and regression tests. Not yet implemented: built-in persistence across reloads, streaming, true inline ghost text, caching, model-vendor adapters, or hosted infrastructure.

This is an initial framework, not a production-vetted release. Contributions should keep capabilities opt-in, prompts configurable, transports replaceable, and ordinary keyboard behavior intact.

Run `npm run format` to apply the shared Prettier formatting rules before contributing.
