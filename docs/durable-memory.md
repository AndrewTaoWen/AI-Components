# Durable scoped memory

`createPersistentAIMemory` extends the existing `AIMemoryStore`; the same `AIProvider`, components,
`useAIMemory`, and prompt recipes work with restored state and accepted-action history.

```tsx
import {
  AIProvider,
  createPersistentAIMemory,
  createWebStorageMemoryAdapter,
} from '@ai-components/react';

// Run on the client, before mounting the provider. Use a distinct key for each user/workspace.
const persistence = await createPersistentAIMemory({
  adapter: createWebStorageMemoryAdapter(window.localStorage, 'my-app:user-42:workspace-7'),
  maxActions: 100,
});

root.render(
  <AIProvider memory={persistence.memory}>
    <App />
  </AIProvider>,
);
// On a controlled workspace switch, wait for pending writes before dropping the controller:
// await persistence.dispose();
```

The package never reads `window` or `localStorage` at import. The React-free
`@ai-components/react/persistence` subpath supports server and test integrations.
Construct one controller per user/workspace, load it before exposing the provider, and dispose it
when switching identities. Browser storage is an optional convenience, not a secure vault: store
only approved context, keep API keys on your backend, and clear the appropriate memory scope on logout.

A persistence adapter implements `load(): Promise<unknown | null>` and
`save(checkpoint): Promise<void>`. Checkpoints contain `{ version: 1, snapshot }`.
Only `null` means an empty store. Unsupported versions, corrupt JSON, invalid scopes, duplicate or
unordered IDs, and invalid data reject hydration without replacing stored content. Snapshot values
are cloned/frozen, and action IDs remain monotonic through clearing, history retention, and reloads.
`createAIMemory({ snapshot })`, `createAIMemoryCheckpoint`, and `readAIMemoryCheckpoint` are available
for applications that own hydration and persistence themselves.

Writes are serialized and coalesced. The controller observes the latest snapshot while a write is
in flight, so an older save cannot overtake a newer one. Failed writes leave local memory available
and pause automatic retries. Use `getStatus()` / `subscribeStatus()` (compatible with React's
`useSyncExternalStore`) to show saving/errors; `await flush()` retries the latest snapshot.
`dispose()` unsubscribes and flushes the last observed state. Browser unload is not an async durability
guarantee: flush before controlled navigation. Adapter saves must be atomic; cross-tab/process
coordination, encryption, and server revision checks belong to the application. This controller does
not provide multi-writer conflict resolution or atomic transactions with application data.

## Explicit retrieval for prompts

```ts
const recipe = defineAIContext({
  name: 'reply',
  purpose: 'Draft a reply informed by recent accepted decisions.',
  borrow: {
    recentDecisions: fromActions('decision.accepted', { scope: 'project-7', limit: 3 }),
    currentCustomer: fromMemory('customer'),
  },
});
```

`fromActions` returns the last matching actions in chronological order, defaults to five, and reads
the current provider scope unless another scope is explicitly supplied. Zero returns no history.
Only selected history enters the model request; restoration does not automatically transmit memory
or start a model call. Existing `fromAction` and `fromMemory` work unchanged. `maxActions` bounds the
retained event history; this is a context memory store, not an unlimited audit log or learned model.
