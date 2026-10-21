import {
  createAIMemory,
  restoreAIMemorySnapshot,
  type AIMemorySnapshot,
  type AIMemoryStore,
} from './memory.js';

export interface AIMemoryCheckpoint {
  readonly version: 1;
  readonly snapshot: AIMemorySnapshot;
}
/** One adapter instance must address one application/user/workspace boundary. */
export interface AIMemoryPersistenceAdapter {
  load(): Promise<unknown | null>;
  save(checkpoint: AIMemoryCheckpoint): Promise<void>;
}
export interface AIMemoryPersistenceStatus {
  readonly state: 'idle' | 'saving' | 'error' | 'disposed';
  readonly error: Error | null;
}
export interface AIPersistentMemory {
  readonly memory: AIMemoryStore;
  getStatus(): AIMemoryPersistenceStatus;
  subscribeStatus(listener: () => void): () => void;
  /** Retry failed saves and wait for all current writes. */
  flush(): Promise<void>;
  /** Stop tracking writes and flush the last observed snapshot. */
  dispose(): Promise<void>;
}

export function createAIMemoryCheckpoint(snapshot: AIMemorySnapshot): AIMemoryCheckpoint {
  return Object.freeze({ version: 1, snapshot: restoreAIMemorySnapshot(snapshot) });
}
export function readAIMemoryCheckpoint(value: unknown): AIMemorySnapshot {
  if (!value || typeof value !== 'object' || Reflect.get(value, 'version') !== 1)
    throw new Error('Unsupported memory checkpoint version.');
  return restoreAIMemorySnapshot(Reflect.get(value, 'snapshot'));
}

/** Explicit browser storage; importing this module never reads window or localStorage. */
export function createWebStorageMemoryAdapter(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
): AIMemoryPersistenceAdapter {
  if (!key.trim()) throw new Error('A memory storage key is required.');
  return {
    async load() {
      const value = storage.getItem(key);
      return value === null ? null : JSON.parse(value);
    },
    async save(checkpoint) {
      storage.setItem(key, JSON.stringify(checkpoint));
    },
  };
}

/** Hydrate before mounting AIProvider. Saves are serialized and coalesced; failed writes stay retryable. */
export async function createPersistentAIMemory(
  options: Omit<NonNullable<Parameters<typeof createAIMemory>[0]>, 'snapshot'> & {
    adapter: AIMemoryPersistenceAdapter;
  },
): Promise<AIPersistentMemory> {
  const loaded = await options.adapter.load();
  const memory = createAIMemory(
    loaded === null
      ? options
      : {
          maxActions: options.maxActions,
          clock: options.clock,
          snapshot: readAIMemoryCheckpoint(loaded),
        },
  );
  let pending = memory.getSnapshot();
  let saved: AIMemorySnapshot | null = loaded === null ? null : pending;
  let running: Promise<void> | null = null;
  let disposed = false;
  let status: AIMemoryPersistenceStatus = Object.freeze({ state: 'idle', error: null });
  const listeners = new Set<() => void>();
  function publish(state: AIMemoryPersistenceStatus['state'], error: Error | null = null) {
    status = Object.freeze({ state, error });
    for (const listener of listeners) listener();
  }
  function flush(): Promise<void> {
    if (running) return running;
    if (saved === pending) return Promise.resolve();
    publish('saving');
    running = Promise.resolve()
      .then(async () => {
        while (saved !== pending) {
          const target = pending;
          await options.adapter.save(createAIMemoryCheckpoint(target));
          saved = target;
        }
        publish(disposed ? 'disposed' : 'idle');
      })
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        publish('error', error);
        throw error;
      })
      .finally(() => {
        running = null;
        // An update can arrive in the promise-settlement turn after the last save.
        if (!disposed && status.state !== 'error' && saved !== pending)
          void flush().catch(() => {});
      });
    return running;
  }
  const unsubscribe = memory.subscribe(() => {
    pending = memory.getSnapshot();
    // A quota/network error pauses automatic retries until an explicit flush.
    if (status.state !== 'error') void flush().catch(() => {});
  });
  const controller: AIPersistentMemory = {
    memory,
    getStatus: () => status,
    subscribeStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush,
    async dispose() {
      disposed = true;
      unsubscribe();
      await flush();
      publish('disposed');
    },
  };
  try {
    await flush();
  } catch (error) {
    unsubscribe();
    throw error;
  }
  return controller;
}
