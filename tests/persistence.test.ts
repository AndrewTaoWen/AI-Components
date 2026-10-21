import { describe, expect, it, vi } from 'vitest';
import { createAIMemory, restoreAIMemorySnapshot } from '../src/memory.js';
import {
  createAIMemoryCheckpoint,
  createPersistentAIMemory,
  createWebStorageMemoryAdapter,
  readAIMemoryCheckpoint,
  type AIMemoryCheckpoint,
  type AIMemoryPersistenceAdapter,
} from '../src/memory-persistence.js';
import { defineAIContext, fromActions, prepareAIRequest } from '../src/context-recipe.js';
function adapter() {
  let disk: unknown = null;
  const value: AIMemoryPersistenceAdapter = {
    async load() {
      return disk;
    },
    async save(checkpoint) {
      disk = JSON.parse(JSON.stringify(checkpoint));
    },
  };
  return { value, disk: () => disk };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('durable memory checkpoints', () => {
  it('restores scoped accepted history and preserves IDs through clear and reload', async () => {
    const storage = adapter();
    const first = await createPersistentAIMemory({ adapter: storage.value });
    first.memory.remember('ticket', 'customer', { name: 'Alex' }, { type: 'customer.accepted' });
    await first.flush();
    await first.dispose();
    const second = await createPersistentAIMemory({ adapter: storage.value });
    expect(second.memory.getSnapshot().scopes.ticket.customer).toEqual({ name: 'Alex' });
    second.memory.clearAll();
    await second.dispose();
    const third = await createPersistentAIMemory({ adapter: storage.value });
    third.memory.recordAction('ticket', { type: 'opened', data: null });
    expect(third.memory.getSnapshot().actions[0].id).toBe(2);
    await third.dispose();
  });
  it('copies and freezes restored data and honors configured retention', () => {
    const original = createAIMemory();
    original.remember('a', 'value', ['first'], { type: 'accepted' });
    original.recordAction('a', { type: 'next', data: null });
    const raw = JSON.parse(JSON.stringify(original.getSnapshot()));
    const restored = createAIMemory({ snapshot: raw, maxActions: 1 });
    raw.scopes.a.value.push('changed');
    expect(restored.getSnapshot().scopes.a.value).toEqual(['first']);
    expect(restored.getSnapshot().actions.map((action) => action.id)).toEqual([2]);
    expect(Object.isFrozen(restored.getSnapshot().scopes.a.value)).toBe(true);
    expect(() => createAIMemory({ initial: {}, snapshot: raw })).toThrow();
  });
  it('preserves the counter with zero retained actions and supports legacy snapshots', () => {
    const memory = createAIMemory({ maxActions: 0 });
    memory.recordAction('a', { type: 'committed', data: null });
    const restored = createAIMemory({
      snapshot: readAIMemoryCheckpoint(createAIMemoryCheckpoint(memory.getSnapshot())),
    });
    restored.recordAction('a', { type: 'next', data: null });
    expect(restored.getSnapshot().actions[0].id).toBe(2);
    expect(restoreAIMemorySnapshot({ scopes: {}, actions: [] }).nextActionId).toBe(1);
  });
  it.each([
    { scopes: { a: 5 }, actions: [] },
    { scopes: {}, actions: [{ id: 1, scope: 'a', type: 'event', data: null, timestamp: 'bad' }] },
    {
      scopes: {},
      actions: [{ id: 1, scope: '__proto__', type: 'event', data: null, timestamp: '2026-01-01' }],
    },
    { scopes: {}, actions: [], nextActionId: 0 },
    { scopes: JSON.parse('{"__proto__":{}}'), actions: [] },
  ])('rejects malformed snapshots before publishing them (%j)', (snapshot) => {
    expect(() => restoreAIMemorySnapshot(snapshot)).toThrow();
  });
  it('refuses unsupported/corrupt storage without overwriting it', async () => {
    const save = vi.fn();
    await expect(
      createPersistentAIMemory({ adapter: { load: async () => ({ version: 99 }), save } }),
    ).rejects.toThrow('version');
    const adapter = createWebStorageMemoryAdapter(
      { getItem: () => '{broken', setItem: save },
      'workspace:a',
    );
    await expect(createPersistentAIMemory({ adapter })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
  it('validates a clock before publishing an action', () => {
    const memory = createAIMemory({ clock: () => 'bad' });
    const snapshot = memory.getSnapshot();
    expect(() => memory.recordAction('a', { type: 'event', data: null })).toThrow();
    expect(memory.getSnapshot()).toBe(snapshot);
  });
});
describe('persistence ordering and failures', () => {
  it('serializes saves and coalesces updates during a slow write', async () => {
    const storage = adapter();
    const gate = deferred();
    const writes: AIMemoryCheckpoint[] = [];
    const controller = await createPersistentAIMemory({ adapter: storage.value });
    storage.value.save = vi.fn(async (checkpoint) => {
      writes.push(checkpoint);
      if (writes.length === 1) await gate.promise;
    });
    controller.memory.update('a', { count: 1 });
    await Promise.resolve();
    controller.memory.update('a', { count: 2 });
    controller.memory.update('a', { count: 3 });
    expect(writes).toHaveLength(1);
    gate.resolve();
    await controller.flush();
    expect(writes.map((checkpoint) => checkpoint.snapshot.scopes.a.count)).toEqual([1, 3]);
    expect(controller.getStatus().state).toBe('idle');
    await controller.dispose();
  });
  it('surfaces save failures, keeps local data, and pauses retries until flush', async () => {
    const storage = adapter();
    const controller = await createPersistentAIMemory({ adapter: storage.value });
    const save = vi.fn(async () => {
      throw new Error('Quota exceeded');
    });
    storage.value.save = save;
    controller.memory.update('a', { count: 1 });
    await expect(controller.flush()).rejects.toThrow('Quota exceeded');
    expect(controller.getStatus()).toMatchObject({
      state: 'error',
      error: { message: 'Quota exceeded' },
    });
    controller.memory.update('a', { count: 2 });
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.memory.getSnapshot().scopes.a.count).toBe(2);
    storage.value.save = async () => {};
    await controller.flush();
    expect(controller.getStatus()).toEqual({ state: 'idle', error: null });
    await controller.dispose();
  });
  it('flushes on dispose and stops observing subsequent updates', async () => {
    const storage = adapter();
    const controller = await createPersistentAIMemory({ adapter: storage.value });
    const listener = vi.fn();
    const unsubscribe = controller.subscribeStatus(listener);
    controller.memory.update('a', { value: 'last observed' });
    await controller.dispose();
    expect(controller.getStatus().state).toBe('disposed');
    const saved = storage.disk();
    controller.memory.update('a', { value: 'after dispose' });
    expect(storage.disk()).toEqual(saved);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
  it('isolates browser storage keys and never requires a browser global at import', async () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    const a = await createPersistentAIMemory({
      adapter: createWebStorageMemoryAdapter(storage, 'workspace:a'),
    });
    a.memory.update('shared', { private: 'A' });
    await a.flush();
    const b = await createPersistentAIMemory({
      adapter: createWebStorageMemoryAdapter(storage, 'workspace:b'),
    });
    expect(b.memory.getSnapshot().scopes).toEqual({});
    await Promise.all([a.dispose(), b.dispose()]);
  });
  it('borrows only bounded selected history from a restored scope', async () => {
    const storage = adapter();
    const first = await createPersistentAIMemory({ adapter: storage.value });
    first.memory.recordAction('a', { type: 'accepted', data: 'old' });
    first.memory.recordAction('a', { type: 'accepted', data: 'new' });
    first.memory.recordAction('b', { type: 'accepted', data: 'other scope' });
    await first.dispose();
    const second = await createPersistentAIMemory({ adapter: storage.value });
    const request = prepareAIRequest(
      { action: 'write', text: '' },
      { basePrompt: '', context: {}, memoryScope: 'a', snapshot: second.memory.getSnapshot() },
      {
        recipe: defineAIContext({
          name: 'reply',
          purpose: 'Draft',
          borrow: { recent: fromActions('accepted', { limit: 1 }) },
        }),
      },
    );
    expect(JSON.stringify(request.context)).toContain('new');
    expect(JSON.stringify(request.context)).not.toContain('old');
    expect(JSON.stringify(request.context)).not.toContain('other scope');
    expect(() => fromActions('accepted', { limit: -1 })).toThrow();
    await second.dispose();
  });
});
