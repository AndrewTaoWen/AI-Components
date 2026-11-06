// @vitest-environment node
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  ReferenceWorkflowStore,
  createReferenceHandler,
} from '../examples/reference-backend/backend.js';
const stores: ReferenceWorkflowStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));
function setup() {
  const store = new ReferenceWorkflowStore();
  stores.push(store);
  store.grant('alice', 'alpha');
  store.grant('bob', 'beta');
  store.createSession('alice', 'a'.repeat(32));
  store.createSession('bob', 'b'.repeat(32));
  return { store, handle: createReferenceHandler(store) };
}
function req(workspace: string, body?: unknown, token = 'a'.repeat(32)) {
  return new Request(`http://localhost/workspaces/${workspace}/tasks`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const add = {
  type: 'add',
  mutationId: 'command-one',
  expectedRevision: 1,
  additions: ['Send recap'],
};
it('authenticates and enforces workspace boundaries before mutations or receipt lookup', async () => {
  const { handle, store } = setup();
  expect((await handle(req('alpha', add))).status).toBe(200);
  expect((await handle(req('alpha', add, 'b'.repeat(32)))).status).toBe(403);
  expect((await handle(req('beta'))).status).toBe(403);
  store.revokeSession('a'.repeat(32));
  expect((await handle(req('alpha'))).status).toBe(401);
});
it('deduplicates retries, rejects stale writes, and guards undo against later edits', async () => {
  const { handle, store } = setup();
  await handle(req('alpha', add));
  await handle(req('alpha', add));
  expect(store.get('a'.repeat(32), 'alpha')).toEqual({ revision: 2, tasks: ['Send recap'] });
  expect(store.db.prepare('SELECT COUNT(*) as count FROM events').get()!.count).toBe(1);
  expect((await handle(req('alpha', { ...add, mutationId: 'stale' }))).status).toBe(409);
  await handle(
    req('alpha', { ...add, mutationId: 'two', expectedRevision: 2, additions: ['New work'] }),
  );
  expect(
    (
      await handle(
        req('alpha', {
          type: 'undo',
          mutationId: 'undo-one',
          originalMutationId: 'command-one',
          expectedRevision: 3,
        }),
      )
    ).status,
  ).toBe(409);
});
it('commits a compensating undo and keeps its retries idempotent', async () => {
  const { handle, store } = setup();
  await handle(req('alpha', add));
  const undo = {
    type: 'undo',
    mutationId: 'undo',
    originalMutationId: 'command-one',
    expectedRevision: 2,
  };
  expect((await handle(req('alpha', undo))).status).toBe(200);
  await handle(req('alpha', undo));
  expect(store.get('a'.repeat(32), 'alpha')).toEqual({ revision: 3, tasks: [] });
});
it('rolls back the mutation and receipt if event persistence fails', async () => {
  const { handle, store } = setup();
  store.db.exec(
    "CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'test event failure'); END;",
  );
  expect((await handle(req('alpha', add))).status).toBe(500);
  expect(store.get('a'.repeat(32), 'alpha').revision).toBe(1);
  expect(store.db.prepare('SELECT COUNT(*) as count FROM mutations').get()!.count).toBe(0);
});
it('rejects cross-origin requests, oversized bodies and unapproved operations', async () => {
  const { handle } = setup();
  const cross = req('alpha', add);
  cross.headers.set('Origin', 'https://other.example');
  expect((await handle(cross)).status).toBe(403);
  expect((await handle(req('alpha', { ...add, additions: ['x'.repeat(65000)] }))).status).toBe(413);
  expect((await handle(req('alpha', { ...add, type: 'arbitrary-code' }))).status).toBe(400);
});

it('persists session hashes, state and receipts across process-style store restarts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'workflow-backend-'));
  const filename = path.join(directory, 'state.sqlite');
  const first = new ReferenceWorkflowStore(filename);
  first.grant('alice', 'alpha');
  first.createSession('alice', 'a'.repeat(32));
  first.command('a'.repeat(32), 'alpha', add);
  first.close();
  const second = new ReferenceWorkflowStore(filename);
  try {
    expect(second.get('a'.repeat(32), 'alpha')).toEqual({ revision: 2, tasks: ['Send recap'] });
    second.command('a'.repeat(32), 'alpha', add);
    expect(second.db.prepare('SELECT COUNT(*) as count FROM events').get()!.count).toBe(1);
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
  } finally {
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
