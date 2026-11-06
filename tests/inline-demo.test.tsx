import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIProvider, type AITransport } from '../src/index.js';
import example from '../demo/examples/inline.js';
import { demoTransport } from '../demo/mock.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('borrows the demo customer context and applies the visible suffix only on Tab', async () => {
  vi.useFakeTimers();
  const requests: Parameters<AITransport['generate']>[0][] = [];
  const transport: AITransport = {
    generate: (request, options) => {
      requests.push(request);
      return demoTransport.generate(request, options);
    },
  };
  render(
    <AIProvider transport={transport}>
      <example.Component />
    </AIProvider>,
  );
  const field = screen.getByRole('textbox', {
    name: 'Inline support reply',
  }) as HTMLTextAreaElement;
  const original = field.value;
  fireEvent.focus(field);
  field.setSelectionRange(original.length, original.length);
  fireEvent.select(field);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(JSON.stringify(requests[0].context)).toContain('Northwind');
  expect(field.value).toBe(original);
  expect(screen.getByRole('status').textContent).toContain('Suggestion available');
  fireEvent.keyDown(field, { key: 'Tab' });
  expect(field.value).toContain('invoice details for Alex at Northwind');
  expect(field.value.startsWith(original)).toBe(true);
});
