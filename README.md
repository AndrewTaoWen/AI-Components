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

## Scope of v0.1

### AITagInput

Use `<AITagInput value={tags} onValueChange={setTags} options={allowedTags} text={content} />` to suggest tags from an approved list. Each option has `value`, `label`, and optional `description` / `disabled`. Optional `maxTags` limits additions; `name` emits repeated hidden form fields. Manual addition/removal works with AI disabled. The `select` action receives `context.options` and `context.selected`, and returns `{ text: '', data: { values: ['existing-tag'] } }`. Suggestions are deduplicated, validated, and added only when clicked. Keep option and controlled value references stable. The Tag input playground uses keyword-based mock suggestions.

Included: shared providers, headless task lifecycle, input and textarea assistance, typed search validation, semantic select, reviewable form autofill, fetch transport, server handler, optional styles, playground, and regression tests. Not yet implemented: streaming, true inline ghost text, caching, model-vendor adapters, or hosted infrastructure.

This is an initial framework, not a production-vetted release. Contributions should keep capabilities opt-in, prompts configurable, transports replaceable, and ordinary keyboard behavior intact.

Run `npm run format` to apply the shared Prettier formatting rules before contributing.
