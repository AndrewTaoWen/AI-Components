import {
  cloneAIMemoryValue,
  readMemory,
  type AIMemorySnapshot,
  type AIMemoryStore,
  type AIMemoryValue,
} from './memory.js';
import type { AIContextSource } from './context-recipe.js';
export interface AIMemoryFact {
  id: string;
  value: AIMemoryValue;
  source: { label: string; reference?: string };
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  confirmed: boolean;
}
const key = 'aiManagedFacts';
function validate(input: unknown): AIMemoryFact {
  const fact = cloneAIMemoryValue(input) as unknown as AIMemoryFact;
  if (
    !fact ||
    typeof fact.id !== 'string' ||
    !fact.id.trim() ||
    !Object.hasOwn(fact, 'value') ||
    !fact.source ||
    typeof fact.source.label !== 'string' ||
    !fact.source.label.trim() ||
    (fact.source.reference !== undefined && typeof fact.source.reference !== 'string') ||
    typeof fact.confirmed !== 'boolean' ||
    typeof fact.createdAt !== 'string' ||
    typeof fact.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(fact.createdAt)) ||
    !Number.isFinite(Date.parse(fact.updatedAt)) ||
    (fact.expiresAt !== undefined &&
      (typeof fact.expiresAt !== 'string' || !Number.isFinite(Date.parse(fact.expiresAt))))
  )
    throw new Error('Invalid managed memory fact.');
  return fact;
}
export function readAIFacts(snapshot: AIMemorySnapshot, scope: string): readonly AIMemoryFact[] {
  const map = readMemory(snapshot, scope)[key];
  if (map === undefined) return [];
  if (!map || typeof map !== 'object' || Array.isArray(map))
    throw new Error('Invalid fact collection.');
  return Object.values(map).map(validate);
}
export function rememberAIFact(
  memory: AIMemoryStore,
  scope: string,
  input: Omit<AIMemoryFact, 'createdAt' | 'updatedAt'>,
  now = Date.now(),
) {
  const existing = readAIFacts(memory.getSnapshot(), scope).find((fact) => fact.id === input.id);
  const timestamp = new Date(now).toISOString();
  const fact = validate({
    ...input,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
  const map = Object.fromEntries(
    readAIFacts(memory.getSnapshot(), scope).map((entry) => [entry.id, cloneAIMemoryValue(entry)]),
  );
  memory.update(scope, { [key]: { ...map, [fact.id]: cloneAIMemoryValue(fact) } });
}
export function forgetAIFact(memory: AIMemoryStore, scope: string, id: string) {
  const remaining = readAIFacts(memory.getSnapshot(), scope).filter((fact) => fact.id !== id);
  memory.update(scope, {
    [key]: Object.fromEntries(remaining.map((fact) => [fact.id, cloneAIMemoryValue(fact)])),
  });
}
export function expireAIFacts(memory: AIMemoryStore, scope: string, now = Date.now()) {
  const facts = readAIFacts(memory.getSnapshot(), scope);
  const remaining = facts.filter((fact) => !fact.expiresAt || Date.parse(fact.expiresAt) > now);
  if (remaining.length === facts.length) return 0;
  memory.update(scope, {
    [key]: Object.fromEntries(remaining.map((fact) => [fact.id, cloneAIMemoryValue(fact)])),
  });
  return facts.length - remaining.length;
}
/** Unconfirmed/expired facts are excluded unless explicitly allowed. */
export function fromFact(
  id: string,
  options: { scope?: string; allowUnconfirmed?: boolean; now?: () => number } = {},
): AIContextSource<AIMemoryValue | undefined> {
  return {
    description: `fact:${options.scope ?? 'current'}.${id}`,
    select(view) {
      const map = view.read(key, options.scope);
      if (!map || typeof map !== 'object' || !Object.hasOwn(map, id)) return undefined;
      const fact = validate(Reflect.get(map, id));
      if (
        (!fact.confirmed && !options.allowUnconfirmed) ||
        (fact.expiresAt && Date.parse(fact.expiresAt) <= (options.now ?? Date.now)())
      )
        return undefined;
      return fact.value;
    },
  };
}
