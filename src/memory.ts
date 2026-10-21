export type AIMemoryValue =
  | string
  | number
  | boolean
  | null
  | readonly AIMemoryValue[]
  | { readonly [key: string]: AIMemoryValue };
export type AIMemoryData = Readonly<Record<string, AIMemoryValue>>;

export interface AIMemoryAction {
  readonly id: number;
  readonly scope: string;
  readonly type: string;
  readonly source?: string;
  readonly data: AIMemoryValue;
  readonly timestamp: string;
}
export interface AIMemorySnapshot {
  readonly scopes: Readonly<Record<string, AIMemoryData>>;
  readonly actions: readonly AIMemoryAction[];
  /** Monotonic across persistence, even after clearing retained history. */
  readonly nextActionId?: number;
}
export interface AIMemoryActionInput {
  type: string;
  source?: string;
  data: AIMemoryValue;
}
export interface AIMemoryStore {
  getSnapshot(): AIMemorySnapshot;
  subscribe(listener: () => void): () => void;
  update(scope: string, patch: AIMemoryData | ((current: AIMemoryData) => AIMemoryData)): void;
  recordAction(scope: string, action: AIMemoryActionInput): void;
  /** Atomically publish accepted state and its action, so readers see a consistent snapshot. */
  remember(
    scope: string,
    key: string,
    value: unknown,
    action: { type: string; source?: string },
  ): void;
  /** Clears data and history for one scope. */
  clear(scope: string): void;
  clearAll(): void;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const EMPTY_MEMORY: AIMemoryData = Object.freeze({});

export function readMemory(snapshot: AIMemorySnapshot, scope: string): AIMemoryData {
  return Object.hasOwn(snapshot.scopes, scope) ? snapshot.scopes[scope] : EMPTY_MEMORY;
}

/** A session-local store. Construct one per application/user boundary, never as an SSR singleton. */
export function createAIMemory(
  options: {
    initial?: Record<string, AIMemoryData>;
    snapshot?: AIMemorySnapshot;
    maxActions?: number;
    clock?: () => string;
  } = {},
): AIMemoryStore {
  const maxActions = options.maxActions ?? 50;
  if (!Number.isInteger(maxActions) || maxActions < 0)
    throw new Error('maxActions must be a nonnegative integer.');
  if (options.initial && options.snapshot) throw new Error('Choose initial memory or a snapshot.');
  const restored = options.snapshot ? restoreAIMemorySnapshot(options.snapshot) : undefined;
  const listeners = new Set<() => void>();
  let nextId = restored?.nextActionId ?? 1;
  const initialScopes: Record<string, AIMemoryData> = {};
  for (const [scope, data] of Object.entries(restored?.scopes ?? options.initial ?? {})) {
    validateKey(scope);
    initialScopes[scope] = cloneMemoryData(data);
  }
  let snapshot: AIMemorySnapshot = Object.freeze({
    scopes: Object.freeze(initialScopes),
    actions: Object.freeze(maxActions === 0 ? [] : (restored?.actions ?? []).slice(-maxActions)),
    nextActionId: nextId,
  });

  function publish(scopes: AIMemorySnapshot['scopes'], actions = snapshot.actions) {
    snapshot = Object.freeze({
      scopes: Object.freeze(scopes),
      actions: Object.freeze(actions),
      nextActionId: nextId,
    });
    for (const listener of listeners) listener();
  }
  function appendAction(scope: string, action: AIMemoryActionInput): readonly AIMemoryAction[] {
    validateKey(scope);
    if (typeof action.type !== 'string' || !action.type.trim())
      throw new Error('An action needs a nonempty type.');
    if (action.source !== undefined && typeof action.source !== 'string')
      throw new Error('Action source must be text.');
    if (!Number.isSafeInteger(nextId) || nextId >= Number.MAX_SAFE_INTEGER)
      throw new Error('Memory action IDs are exhausted.');
    const data = cloneMemoryValue(action.data);
    const timestamp = (options.clock ?? (() => new Date().toISOString()))();
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)))
      throw new Error('Memory clocks must return a valid date string.');
    const event: AIMemoryAction = Object.freeze({
      id: nextId++,
      scope,
      type: action.type,
      source: action.source,
      data,
      timestamp,
    });
    return maxActions === 0 ? [] : [...snapshot.actions, event].slice(-maxActions);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(scope, patch) {
      validateKey(scope);
      const current = readMemory(snapshot, scope);
      const values = cloneMemoryData(typeof patch === 'function' ? patch(current) : patch);
      publish({ ...snapshot.scopes, [scope]: Object.freeze({ ...current, ...values }) });
    },
    recordAction(scope, action) {
      publish(snapshot.scopes, appendAction(scope, action));
    },
    remember(scope, key, value, action) {
      validateKey(scope);
      validateKey(key);
      const data = cloneMemoryValue(value);
      const actions = appendAction(scope, { ...action, data });
      publish(
        {
          ...snapshot.scopes,
          [scope]: Object.freeze({ ...readMemory(snapshot, scope), [key]: data }),
        },
        actions,
      );
    },
    clear(scope) {
      validateKey(scope);
      const scopes = { ...snapshot.scopes };
      delete scopes[scope];
      publish(
        scopes,
        snapshot.actions.filter((action) => action.scope !== scope),
      );
    },
    clearAll() {
      publish({}, []);
    },
  };
}

function validateKey(key: string) {
  if (!key.trim() || FORBIDDEN_KEYS.has(key))
    throw new Error('Memory keys and scopes must be nonempty, ordinary names.');
}

/** Clone and freeze data so consumers cannot mutate a previously published snapshot. */
function cloneMemoryValue(value: unknown, ancestors = new Set<object>()): AIMemoryValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value))
    throw new Error('Memory values must be finite, acyclic JSON data.');
  const isArray = Array.isArray(value);
  if (
    !isArray &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error('Memory values must be plain JSON data.');
  ancestors.add(value);
  try {
    if (isArray) return Object.freeze(value.map((item) => cloneMemoryValue(item, ancestors)));
    const result: Record<string, AIMemoryValue> = {};
    for (const [key, item] of Object.entries(value)) {
      validateKey(key);
      // Optional object properties are omitted; undefined array values are rejected.
      if (item !== undefined) result[key] = cloneMemoryValue(item, ancestors);
    }
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

function cloneMemoryData(value: unknown): AIMemoryData {
  const result = cloneMemoryValue(value);
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Memory updates must be objects.');
  return result as AIMemoryData;
}

/** Validate and defensively clone a checkpoint before making restored state observable. */
export function restoreAIMemorySnapshot(value: unknown): AIMemorySnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid memory snapshot.');
  const input = value as AIMemorySnapshot;
  const scopes = cloneMemoryData(input.scopes) as Readonly<Record<string, AIMemoryData>>;
  for (const scope of Object.values(scopes)) cloneMemoryData(scope);
  if (!Array.isArray(input.actions)) throw new Error('Invalid memory action history.');
  let previousId = 0;
  const actions = input.actions.map((action): AIMemoryAction => {
    if (
      !action ||
      typeof action !== 'object' ||
      !Number.isSafeInteger(action.id) ||
      action.id <= previousId ||
      typeof action.scope !== 'string' ||
      typeof action.type !== 'string' ||
      !action.type.trim() ||
      (action.source !== undefined && typeof action.source !== 'string') ||
      typeof action.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(action.timestamp))
    )
      throw new Error('Invalid memory action history.');
    validateKey(action.scope);
    previousId = action.id;
    return Object.freeze({
      id: action.id,
      scope: action.scope,
      type: action.type,
      ...(action.source === undefined ? {} : { source: action.source }),
      data: cloneMemoryValue(action.data),
      timestamp: action.timestamp,
    });
  });
  const nextActionId = input.nextActionId ?? previousId + 1;
  if (!Number.isSafeInteger(nextActionId) || nextActionId <= previousId || nextActionId < 1)
    throw new Error('Invalid next memory action ID.');
  return Object.freeze({ scopes, actions: Object.freeze(actions), nextActionId });
}
