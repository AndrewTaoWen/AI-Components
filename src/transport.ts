import type { AITransport } from './types.js';
/** The endpoint owns credentials, authentication, and model selection. */
export function createFetchTransport(
  endpoint = '/api/ai',
  options: {
    headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
    fetch?: typeof fetch;
  } = {},
): AITransport {
  return {
    async generate(request, { signal }) {
      const headers = new Headers(
        typeof options.headers === 'function' ? await options.headers() : options.headers,
      );
      headers.set('Content-Type', 'application/json');
      const response = await (options.fetch ?? fetch)(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) throw new Error(`AI request failed (${response.status}).`);
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('text' in result) ||
        typeof result.text !== 'string'
      ) {
        throw new Error('AI endpoint returned an invalid response.');
      }
      return { text: result.text, data: 'data' in result ? result.data : undefined };
    },
  };
}
