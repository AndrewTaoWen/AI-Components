import type { AIRequest, AIResponse } from './types.js';
import { AI_ACTIONS } from './types.js';
export type { AIRequest, AIResponse } from './types.js';

export interface AIHandlerOptions {
  /** Plug in your preferred model SDK here. Credentials stay in this closure. */
  generate(request: AIRequest, options: { signal: AbortSignal }): Promise<AIResponse>;
  /** Required: authenticate and apply your application's access policy. */
  authorize(request: Request): boolean | Promise<boolean>;
  basePrompt?: string;
  context?: Record<string, unknown>;
  maxBodyBytes?: number;
}
const ALLOWED_ACTIONS = new Set<string>(AI_ACTIONS);
const DEFAULT_MAX_BODY_BYTES = 32_768;
/** Web-standard handler for Next.js routes, workers, and other Fetch runtimes. */
export function createAIHandler(options: AIHandlerOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST')
      return Response.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { Allow: 'POST' } },
      );
    try {
      if (!(await options.authorize(request)))
        return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    } catch {
      return Response.json({ error: 'Authorization failed.' }, { status: 403 });
    }
    if (!request.headers.get('content-type')?.includes('application/json'))
      return Response.json({ error: 'Expected JSON.' }, { status: 415 });
    const body = await readJsonBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
    if ('error' in body) return body.error;
    if (!isAIRequest(body.value)) {
      return Response.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const input = body.value;

    try {
      const result = await options.generate(
        {
          action: input.action,
          text: input.text,
          instruction: input.instruction,
          prompt: [options.basePrompt, input.prompt].filter(Boolean).join('\n\n'),
          context: { ...input.context, ...options.context },
        },
        { signal: request.signal },
      );
      if (typeof result.text !== 'string') throw new Error('Invalid response');
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'AI generation failed.' }, { status: 502 });
    }
  };
}

/** Validate untrusted JSON before passing it to the model adapter. */
function isAIRequest(value: unknown): value is AIRequest {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  const hasValidAction = typeof input.action === 'string' && ALLOWED_ACTIONS.has(input.action);
  const hasValidText = typeof input.text === 'string' && typeof input.prompt === 'string';
  const hasValidInstruction =
    input.instruction === undefined || typeof input.instruction === 'string';
  const hasValidContext =
    input.context === undefined ||
    (input.context !== null && typeof input.context === 'object' && !Array.isArray(input.context));
  return hasValidAction && hasValidText && hasValidInstruction && hasValidContext;
}

type JsonBodyResult = { value: unknown } | { error: Response };

/** Enforce the limit while reading, rather than after buffering the whole body. */
async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const reader = request.body?.getReader();
  if (!reader) {
    return { error: Response.json({ error: 'Missing body.' }, { status: 400 }) };
  }

  try {
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { error: Response.json({ error: 'Request too large.' }, { status: 413 }) };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: Response.json({ error: 'Invalid JSON.' }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }
}
