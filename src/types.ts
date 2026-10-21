import type { AIContextRecipe } from './context-recipe.js';
import type { AIMemoryValue } from './memory.js';

export const AI_ACTIONS = ['complete', 'write', 'rewrite', 'search', 'select', 'extract'] as const;
export type AIAction = (typeof AI_ACTIONS)[number];
export interface AIRequest {
  action: AIAction;
  text: string;
  /** Inherited instructions plus the component's instructions. */
  prompt: string;
  context?: Record<string, unknown>;
  instruction?: string;
}
export interface AIResponse {
  text: string;
  data?: unknown;
}
/** Implement this interface for any model, SDK, or server endpoint. */
export interface AITransport {
  generate(request: AIRequest, options: { signal: AbortSignal }): Promise<AIResponse>;
}
export interface AIConfig {
  enabled?: boolean;
  prompt?: string;
  context?: Record<string, unknown>;
  recipe?: AIContextRecipe;
  /** Opt in to recording an accepted result. Generation alone never writes memory. */
  remember?: {
    key: string;
    action?: string;
    source?: string;
    scope?: string;
    /** Project application values (e.g. Dates) into plain JSON memory. */
    project?(value: unknown): AIMemoryValue;
  };
}
export interface WritingConfig extends AIConfig {
  autocomplete?: boolean;
  helpMeWrite?: boolean;
  debounceMs?: number;
  minLength?: number;
}
