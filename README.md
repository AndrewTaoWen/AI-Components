# AI Components

An early, MIT-licensed React + TypeScript framework for AI-enhanced **everyday UI**: inputs, textareas, and search bars. Bring your own model and server. No chat interface required.

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

The transport contract is `AIRequest -> Promise<AIResponse>`. Actions are `complete`, `write`, `rewrite`, and `search`. A response always has `text: string`, with optional `data: unknown`. `run` returns `null` on cancellation, disabled AI, or failure; inspect `error` and `status`. `createFetchTransport` accepts custom headers (including an async factory) and an injected fetch implementation.

## Scope of v0.1

Included: shared providers, headless task lifecycle, input and textarea assistance, typed search validation, fetch transport, server handler, optional styles, playground, and regression tests. Not yet implemented: streaming, true inline ghost text, semantic select, form autofill, caching, model-vendor adapters, or hosted infrastructure.

This is an initial framework, not a production-vetted release. Contributions should keep capabilities opt-in, prompts configurable, transports replaceable, and ordinary keyboard behavior intact.

Run `npm run format` to apply the shared Prettier formatting rules before contributing.
