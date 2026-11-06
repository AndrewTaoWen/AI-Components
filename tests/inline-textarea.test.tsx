import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIProvider, AIInlineTextarea } from '../src/index.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function advance() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
}
function Input({ readOnly = false }: { readOnly?: boolean }) {
  const [value, setValue] = useState('Hello');
  return (
    <AIInlineTextarea
      aria-label="Reply"
      value={value}
      onValueChange={setValue}
      readOnly={readOnly}
    />
  );
}
it('accepts Tab, preserves Shift+Tab, and restores the caret', async () => {
  vi.useFakeTimers();
  render(
    <AIProvider transport={{ generate: async () => ({ text: ' world' }) }}>
      <Input />
    </AIProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Reply' }) as HTMLTextAreaElement;
  fireEvent.focus(input);
  input.setSelectionRange(5, 5);
  fireEvent.select(input);
  await advance();
  expect(screen.getByRole('status').textContent).toContain('Suggestion available');
  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
  expect(input.value).toBe('Hello');
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input.value).toBe('Hello world');
  expect(input.selectionStart).toBe(11);
});
it('dismisses Escape and suppresses composition and read-only generation', async () => {
  vi.useFakeTimers();
  const generate = vi.fn(async () => ({ text: ' world' }));
  const first = render(
    <AIProvider transport={{ generate }}>
      <Input />
    </AIProvider>,
  );
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.focus(input);
  input.setSelectionRange(5, 5);
  fireEvent.select(input);
  await advance();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.compositionStart(input);
  await advance();
  fireEvent.keyDown(input, { key: 'Tab', isComposing: true });
  expect(input.value).toBe('Hello');
  first.unmount();
  generate.mockClear();
  render(
    <AIProvider transport={{ generate }}>
      <Input readOnly />
    </AIProvider>,
  );
  fireEvent.focus(screen.getByRole('textbox'));
  await advance();
  expect(generate).not.toHaveBeenCalled();
});
