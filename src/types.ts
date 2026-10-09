export type AIAction = 'complete' | 'write' | 'rewrite' | 'search';
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
}
export interface WritingConfig extends AIConfig {
  autocomplete?: boolean;
  helpMeWrite?: boolean;
  debounceMs?: number;
  minLength?: number;
}
