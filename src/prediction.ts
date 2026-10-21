import { resolveAIContext, type AIContextRecipe } from './context-recipe.js';
import { cloneAIMemoryValue, type AIMemorySnapshot, type AIMemoryValue } from './memory.js';
import { validateAIActionProposal, type AIActionProposal } from './actions.js';
import type { AIRequest } from './types.js';

export interface AIContextInspection {
  name: string;
  purpose: string;
  scope: string;
  sources: Readonly<Record<string, string>>;
  borrowed: Readonly<Record<string, unknown>>;
  expectedUse?: string;
}
export interface AIPredictionPolicy<T extends AIMemoryValue = AIMemoryValue> extends Pick<
  AIContextRecipe,
  'name' | 'purpose' | 'borrow'
> {
  actionType: string;
  /** Pure, local policy. Only explicitly selected JSON context is supplied. */
  predict(input: {
    scope: string;
    borrowed: Readonly<Record<string, AIMemoryValue>>;
  }): readonly AIActionProposal<T>[];
}
export interface AIPrediction<T extends AIMemoryValue = AIMemoryValue> {
  policy: string;
  actionType: string;
  proposal: AIActionProposal<T>;
  inspection: AIContextInspection;
}
export interface AIPredictionResult<T extends AIMemoryValue = AIMemoryValue> {
  predictions: readonly AIPrediction<T>[];
  errors: readonly { policy: string; message: string }[];
}
export function defineAIPolicy<T extends AIMemoryValue>(
  policy: AIPredictionPolicy<T>,
): AIPredictionPolicy<T> {
  return policy;
}

/** No transport, execution, or memory writes. Failed policies expose no partial candidates. */
export function evaluateAIPolicies<T extends AIMemoryValue>(options: {
  policies: readonly AIPredictionPolicy<T>[];
  snapshot: AIMemorySnapshot;
  scope: string;
  context?: Record<string, unknown>;
  maxPredictions?: number;
}): AIPredictionResult<T> {
  const limit = options.maxPredictions ?? 20;
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error('Prediction limit must be a nonnegative integer.');
  if (new Set(options.policies.map((policy) => policy.name)).size !== options.policies.length)
    throw new Error('Prediction policy names must be unique.');
  const predictions: AIPrediction<T>[] = [];
  const errors: { policy: string; message: string }[] = [];
  const seen = new Set<string>();
  for (const policy of options.policies) {
    try {
      if (!policy.actionType.trim()) throw new Error('A prediction policy needs an action type.');
      const resolved = resolveAIContext(
        policy,
        { action: 'extract', text: '' },
        {
          context: options.context ?? {},
          memoryScope: options.scope,
          snapshot: options.snapshot,
        },
      );
      const borrowed = cloneAIMemoryValue(resolved.view.borrowed) as Readonly<
        Record<string, AIMemoryValue>
      >;
      const output = policy.predict({ scope: options.scope, borrowed });
      if (!Array.isArray(output) || output.length > 1000)
        throw new Error('Policies must return at most 1,000 proposals.');
      // Validate the entire policy result before exposing any of it.
      const proposals: AIActionProposal<T>[] = output.map((proposal) =>
        validateAIActionProposal<T>(proposal),
      );
      for (const proposal of proposals) {
        const key = `${policy.actionType}:${proposal.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const reviewed = options.snapshot.actions.some(
          (event) =>
            event.scope === options.scope &&
            ['accepted', 'dismissed', 'undone'].some(
              (outcome) => event.type === `${policy.actionType}.${outcome}`,
            ) &&
            event.data &&
            typeof event.data === 'object' &&
            Reflect.get(event.data, 'proposalId') === proposal.id,
        );
        if (reviewed || predictions.length >= limit) continue;
        predictions.push(
          Object.freeze({
            policy: policy.name,
            actionType: policy.actionType,
            proposal,
            inspection: Object.freeze({
              name: policy.name,
              purpose: policy.purpose,
              scope: options.scope,
              sources: Object.freeze(resolved.sources),
              borrowed,
            }),
          }),
        );
      }
    } catch (cause) {
      errors.push({
        policy: policy.name,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return Object.freeze({ predictions: Object.freeze(predictions), errors: Object.freeze(errors) });
}

/** Inspect only recipe-selected context, never the full provider context or prompt. */
export function inspectAIRequest(request: AIRequest, scope = 'shared'): AIContextInspection | null {
  const metadata = request.context?._ai as
    { recipe?: unknown; borrowed?: unknown; sources?: unknown; expectedUse?: unknown } | undefined;
  if (
    !metadata ||
    typeof metadata.recipe !== 'string' ||
    !metadata.borrowed ||
    typeof metadata.borrowed !== 'object' ||
    !metadata.sources ||
    typeof metadata.sources !== 'object'
  )
    return null;
  const sources = Object.fromEntries(
    Object.entries(metadata.sources).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  return {
    name: metadata.recipe,
    purpose: 'Context selected for this request',
    scope,
    sources,
    borrowed: metadata.borrowed as Record<string, unknown>,
    ...(typeof metadata.expectedUse === 'string' ? { expectedUse: metadata.expectedUse } : {}),
  };
}
