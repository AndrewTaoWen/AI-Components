import {
  readMemory,
  type AIMemoryAction,
  type AIMemorySnapshot,
  type AIMemoryValue,
} from './memory.js';
import type { AIConfig, AIRequest } from './types.js';

export type AITaskInput = Omit<AIRequest, 'prompt' | 'context'>;
export interface AIContextView {
  readonly input: AITaskInput;
  readonly context: Readonly<Record<string, unknown>>;
  readonly scope: string;
  read(key: string, scope?: string): AIMemoryValue | undefined;
  history(type?: string, scope?: string): readonly AIMemoryAction[];
}
export interface AIContextSource<T = unknown> {
  readonly description: string;
  select(view: AIContextView): T;
}
export interface AIRecipeView extends AIContextView {
  readonly borrowed: Readonly<Record<string, unknown>>;
}
export interface AIContextRecipe {
  readonly name: string;
  readonly purpose: string;
  readonly borrow?: Readonly<Record<string, AIContextSource | ((view: AIContextView) => unknown)>>;
  readonly instructions?: string | ((view: AIRecipeView) => string);
  /** Describe the expected consumer/next step. This is a planning hint, not an executed action. */
  readonly anticipate?: (view: AIRecipeView) => string;
}

export function defineAIContext<T extends AIContextRecipe>(recipe: T): T {
  return recipe;
}
export function fromMemory(
  key: string,
  scope?: string,
): AIContextSource<AIMemoryValue | undefined> {
  return {
    description: `memory:${scope ?? 'current'}.${key}`,
    select: (view) => view.read(key, scope),
  };
}
export function fromAction(
  type: string,
  scope?: string,
): AIContextSource<AIMemoryAction | undefined> {
  return {
    description: `action:${scope ?? 'current'}.${type}`,
    select: (view) => view.history(type, scope).at(-1),
  };
}
/** Explicit, bounded history retrieval. Other scopes remain excluded unless named. */
export function fromActions(
  type: string,
  options: { scope?: string; limit?: number } = {},
): AIContextSource<readonly AIMemoryAction[]> {
  const limit = options.limit ?? 5;
  if (!type.trim() || !Number.isInteger(limit) || limit < 0)
    throw new Error('Action retrieval needs a type and a nonnegative integer limit.');
  return {
    description: `actions:${options.scope ?? 'current'}.${type} (last ${limit})`,
    select: (view) => (limit === 0 ? [] : view.history(type, options.scope).slice(-limit)),
  };
}
export function fromContext(key: string): AIContextSource {
  return {
    description: `context:${key}`,
    select: (view) => (Object.hasOwn(view.context, key) ? view.context[key] : undefined),
  };
}

export function resolveAIContext(
  recipe: AIContextRecipe,
  input: AITaskInput,
  environment: {
    context: Record<string, unknown>;
    memoryScope: string;
    snapshot: AIMemorySnapshot;
  },
) {
  const context = environment.context;
  if (!recipe.name.trim() || !recipe.purpose.trim())
    throw new Error('A context recipe needs a name and purpose.');
  const view: AIContextView = {
    input,
    context,
    scope: environment.memoryScope,
    read: (key, scope = environment.memoryScope) => {
      const memory = readMemory(environment.snapshot, scope);
      return Object.hasOwn(memory, key) ? memory[key] : undefined;
    },
    history: (type, scope = environment.memoryScope) =>
      environment.snapshot.actions.filter(
        (action) => action.scope === scope && (type === undefined || action.type === type),
      ),
  };
  const borrowed: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  for (const [name, source] of Object.entries(recipe.borrow ?? {})) {
    const value = typeof source === 'function' ? source(view) : source.select(view);
    if (value !== undefined) {
      Object.defineProperty(borrowed, name, { value, enumerable: true });
      Object.defineProperty(sources, name, {
        value: typeof source === 'function' ? 'custom selector' : source.description,
        enumerable: true,
      });
    }
  }
  const recipeView = { ...view, borrowed };
  return { view: recipeView, sources };
}

/** Pure request assembly. No model call, memory write, or automatic retrieval occurs. */
export function prepareAIRequest(
  input: AITaskInput,
  environment: {
    basePrompt: string;
    context: Record<string, unknown>;
    memoryScope: string;
    snapshot: AIMemorySnapshot;
  },
  config: AIConfig = {},
): AIRequest {
  const context = { ...environment.context, ...config.context };
  const prompts = [environment.basePrompt, config.prompt];
  const recipe = config.recipe;
  if (recipe) {
    const { view: recipeView, sources } = resolveAIContext(recipe, input, {
      ...environment,
      context,
    });
    const borrowed = recipeView.borrowed;
    const instructions =
      typeof recipe.instructions === 'function'
        ? recipe.instructions(recipeView)
        : recipe.instructions;
    const usage = recipe.anticipate?.(recipeView);
    prompts.push(`Purpose (${recipe.name}): ${recipe.purpose}`, instructions);
    if (usage)
      prompts.push(
        `Expected downstream use (planning hint, not an action already taken): ${usage}`,
      );
    context._ai = {
      recipe: recipe.name,
      borrowed,
      sources,
      ...(usage ? { expectedUse: usage } : {}),
    };
  }
  return { ...input, prompt: prompts.filter(Boolean).join('\n\n'), context };
}
