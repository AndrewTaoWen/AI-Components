import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AIWorkflowFeedback } from '../../src/feedback.js';
class HTTPError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
type State = { revision: number; tasks: string[] };
type Command =
  | { type: 'add'; mutationId: string; expectedRevision: number; additions: string[] }
  | { type: 'undo'; mutationId: string; expectedRevision: number; originalMutationId: string };
export class ReferenceWorkflowStore {
  readonly db: DatabaseSync;
  constructor(filename = ':memory:') {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, tasks TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (workspace TEXT NOT NULL REFERENCES workspaces(id), user TEXT NOT NULL, PRIMARY KEY(workspace,user));
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mutations (workspace TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, user TEXT NOT NULL, signature TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(workspace,id));
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), body TEXT NOT NULL);`);
  }
  /** Trusted bootstrap/admin API. Never expose this as an unauthenticated HTTP endpoint. */
  grant(user: string, workspace: string) {
    if (!validId(user) || !validId(workspace)) throw new Error('Invalid bootstrap identity.');
    this.db.prepare('INSERT OR IGNORE INTO workspaces VALUES (?,1,?)').run(workspace, '[]');
    this.db.prepare('INSERT OR IGNORE INTO members VALUES (?,?)').run(workspace, user);
  }
  createSession(user: string, token: string, expires = Date.now() + 3600000) {
    if (!validId(user) || token.length < 32 || !Number.isFinite(expires) || expires <= Date.now())
      throw new Error('Use a long opaque token and a future expiry.');
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), user, expires);
  }
  revokeSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
  }
  authenticate(token: string) {
    const row = this.db
      .prepare('SELECT user FROM sessions WHERE hash=? AND expires>?')
      .get(digest(token), Date.now());
    if (!row) throw new HTTPError(401, 'Authentication required.');
    return row.user as string;
  }
  authorize(token: string, workspace: string) {
    const user = this.authenticate(token);
    if (
      !validId(workspace) ||
      !this.db.prepare('SELECT 1 FROM members WHERE workspace=? AND user=?').get(workspace, user)
    )
      throw new HTTPError(403, 'Workspace access denied.');
    return user;
  }
  private state(workspace: string): State {
    const row = this.db.prepare('SELECT revision,tasks FROM workspaces WHERE id=?').get(workspace)!;
    return { revision: row.revision as number, tasks: JSON.parse(row.tasks as string) };
  }
  get(token: string, workspace: string) {
    this.authorize(token, workspace);
    return this.state(workspace);
  }
  command(token: string, workspace: string, input: unknown) {
    const command = input as Command;
    if (
      !command ||
      !['add', 'undo'].includes(command.type) ||
      !validId(command.mutationId) ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 1 ||
      (command.type === 'add' &&
        (!Array.isArray(command.additions) ||
          !command.additions.length ||
          command.additions.length > 50 ||
          command.additions.some(
            (text) => typeof text !== 'string' || !text.trim() || text.length > 2000,
          ) ||
          new Set(command.additions).size !== command.additions.length)) ||
      (command.type === 'undo' && !validId(command.originalMutationId))
    )
      throw new HTTPError(400, 'Invalid task command.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Reauthorize inside the transaction, after any asynchronous body parsing.
      const user = this.authorize(token, workspace);
      const signature = digest(JSON.stringify([user, command]));
      const prior = this.db
        .prepare('SELECT signature,receipt FROM mutations WHERE workspace=? AND id=?')
        .get(workspace, command.mutationId);
      if (prior) {
        if (prior.signature !== signature)
          throw new HTTPError(409, 'Mutation ID already used for a different command.');
        const receipt = JSON.parse(prior.receipt as string);
        this.db.exec('COMMIT');
        return {
          state: this.state(workspace),
          receipt: { mutationId: command.mutationId, afterRevision: receipt.afterRevision },
        };
      }
      const before = this.state(workspace);
      if (before.revision !== command.expectedRevision)
        throw new HTTPError(409, 'Task revision changed.');
      let tasks: string[];
      if (command.type === 'add') {
        if (command.additions.some((task) => before.tasks.includes(task)))
          throw new HTTPError(409, 'Task already exists.');
        tasks = [...before.tasks, ...command.additions];
      } else {
        const original = this.db
          .prepare('SELECT receipt FROM mutations WHERE workspace=? AND id=? AND user=?')
          .get(workspace, command.originalMutationId, user);
        const receipt = original ? JSON.parse(original.receipt as string) : null;
        if (!receipt || receipt.type !== 'add' || receipt.afterRevision !== before.revision)
          throw new HTTPError(409, 'Undo would overwrite newer work or another actor’s mutation.');
        tasks = receipt.before.tasks;
      }
      const after = { revision: before.revision + 1, tasks };
      this.db
        .prepare('UPDATE workspaces SET revision=?,tasks=? WHERE id=?')
        .run(after.revision, JSON.stringify(tasks), workspace);
      const receipt = { type: command.type, before, afterRevision: after.revision };
      const feedback: AIWorkflowFeedback = {
        policyId: 'reference.tasks',
        proposalId: command.type === 'add' ? command.mutationId : command.originalMutationId,
        actionType: 'tasks',
        outcome: command.type === 'add' ? 'accepted' : 'undone',
        sourceRevisions: { workspace: before.revision },
        mutationId: command.mutationId,
      };
      this.db
        .prepare('INSERT INTO events VALUES (?,?,?)')
        .run(
          randomUUID(),
          workspace,
          JSON.stringify({ ...feedback, user, at: new Date().toISOString() }),
        );
      this.db
        .prepare('INSERT INTO mutations VALUES (?,?,?,?,?)')
        .run(workspace, command.mutationId, user, signature, JSON.stringify(receipt));
      this.db.exec('COMMIT');
      return {
        state: after,
        receipt: { mutationId: command.mutationId, afterRevision: after.revision },
      };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
export function createReferenceHandler(
  store: ReferenceWorkflowStore,
  options: { maxBodyBytes?: number; maxRequestsPerMinute?: number } = {},
) {
  const buckets = new Map<string, { start: number; count: number }>();
  return async (request: Request): Promise<Response> => {
    const send = (status: number, value: unknown) =>
      Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    try {
      const url = new URL(request.url);
      if (request.headers.has('origin') && request.headers.get('origin') !== url.origin)
        throw new HTTPError(403, 'Cross-origin requests are not allowed.');
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) throw new HTTPError(401, 'Authentication required.');
      store.authenticate(token);
      const now = Date.now(),
        hash = digest(token);
      for (const [id, bucket] of buckets) if (bucket.start + 60000 <= now) buckets.delete(id);
      const bucket = buckets.get(hash) ?? { start: now, count: 0 };
      bucket.count++;
      buckets.set(hash, bucket);
      if (bucket.count > (options.maxRequestsPerMinute ?? 60))
        throw new HTTPError(429, 'Request limit exceeded.');
      if (url.pathname === '/session' && request.method === 'DELETE') {
        store.revokeSession(token);
        return send(200, { signedOut: true });
      }
      const match = url.pathname.match(/^\/workspaces\/([a-zA-Z0-9_-]{1,100})\/tasks$/);
      if (!match) return send(404, { error: 'Not found.' });
      if (request.method === 'GET') return send(200, store.get(token, match[1]));
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      store.authorize(token, match[1]);
      if (!request.headers.get('content-type')?.includes('application/json'))
        throw new HTTPError(415, 'Expected JSON.');
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > (options.maxBodyBytes ?? 64000)) {
            await reader.cancel();
            throw new HTTPError(413, 'Request too large.');
          }
          chunks.push(part.value);
        }
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      let input: unknown;
      try {
        input = JSON.parse(new TextDecoder().decode(body));
      } catch {
        throw new HTTPError(400, 'Invalid JSON.');
      }
      return send(200, store.command(token, match[1], input));
    } catch (error) {
      return send(error instanceof HTTPError ? error.status : 500, {
        error: error instanceof HTTPError ? error.message : 'Unable to process workflow request.',
      });
    }
  };
}
