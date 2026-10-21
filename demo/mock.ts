import type { AITransport } from '../src/index.js';
/** Deterministic sample responses. This is deliberately not an LLM. */
export const demoTransport: AITransport = {
  async generate(request, { signal }) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 500);
      function abort() {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
    if (request.action === 'select') {
      if (request.context?.selected) {
        const text = request.text.toLowerCase();
        return {
          text: '',
          data: {
            values: [
              /invoice|bill|charged/.test(text) ? 'billing' : '',
              /login|log in/.test(text) ? 'account' : '',
              /urgent/.test(text) ? 'urgent' : '',
            ].filter(Boolean),
          },
        };
      }
      const query = request.text.toLowerCase();
      const value = /bill|pay|invoice|money/.test(query)
        ? 'finance'
        : /login|log in|account|technical/.test(query)
          ? 'support'
          : /sales|product|subscription/.test(query)
            ? 'sales'
            : null;
      return { text: '', data: { values: value ? [value] : [] } };
    }
    if (request.action === 'extract') {
      const data: Record<string, string> = {};
      for (const key of ['name', 'email', 'company']) {
        const value = request.text.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1]?.trim();
        if (value) data[key] = value;
      }
      return { text: '', data };
    }
    if (request.action === 'search') {
      const lower = request.text.toLowerCase();
      const amount = lower.match(/(?:over|above|more than|>)\s*\$?(\d+)/);
      return {
        text: '',
        data: {
          status: lower.includes('unpaid') ? 'unpaid' : lower.includes('paid') ? 'paid' : null,
          minAmount: amount ? Number(amount[1]) : null,
          customer: lower.includes('acme') ? 'Acme' : null,
        },
      };
    }
    if (request.action === 'complete')
      return { text: ' and let me know if you have any questions.' };
    const concise =
      /short|concise/i.test(request.instruction ?? '') || /concise/i.test(request.prompt);
    return {
      text: concise
        ? 'Thanks for reaching out! We’ll review this and get back to you shortly.'
        : 'Thanks for reaching out. We’re happy to help and will take a closer look at your request. Please share any additional details so we can find the best next step together.',
    };
  },
};
