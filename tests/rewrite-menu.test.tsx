import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIProvider, AIRewriteMenu, type AIResponse, type AITransport } from '../src/index.js';
afterEach(cleanup);
it('leaves original text intact until a reviewed rewrite is accepted', async () => {
  const onChange = vi.fn();
  render(
    <AIProvider transport={{ generate: async () => ({ text: 'Short draft' }) }}>
      <AIRewriteMenu value="Original message" onValueChange={onChange} />
    </AIProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('Shorten'));
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('Short draft')).toBeTruthy();
  fireEvent.click(screen.getByText('Use rewrite'));
  expect(onChange).toHaveBeenCalledWith('Short draft');
});
it('ignores a stale rewrite after an external text edit', async () => {
  let resolve!: (response: AIResponse) => void;
  const generate = vi.fn<AITransport['generate']>(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const transport = { generate };
  const onChange = vi.fn();
  const view = (value: string) => (
    <AIProvider transport={transport}>
      <AIRewriteMenu value={value} onValueChange={onChange} />
    </AIProvider>
  );
  const { rerender } = render(view('Original'));
  fireEvent.click(screen.getByText('Shorten'));
  rerender(view('User edit'));
  await act(async () => {
    resolve({ text: 'Late draft' });
  });
  expect(screen.queryByText('Use rewrite')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
it('supports application-defined rewrite and translation instructions', async () => {
  const generate = vi.fn<AITransport['generate']>(async () => ({ text: 'Bonjour' }));
  render(
    <AIProvider transport={{ generate }}>
      <AIRewriteMenu
        value="Hello"
        onValueChange={() => {}}
        actions={[{ id: 'fr', label: 'French', instruction: 'Translate into French.' }]}
      />
    </AIProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('French'));
  });
  expect(generate.mock.calls[0][0]).toMatchObject({
    action: 'rewrite',
    instruction: 'Translate into French.',
    text: 'Hello',
  });
});
it('rejects empty rewrites and can be disabled', async () => {
  const generate = vi.fn<AITransport['generate']>(async () => ({ text: ' ' }));
  const view = (disabled: boolean) => (
    <AIProvider transport={{ generate }}>
      <AIRewriteMenu value="Hello" onValueChange={() => {}} disabled={disabled} />
    </AIProvider>
  );
  const { rerender } = render(view(false));
  await act(async () => {
    fireEvent.click(screen.getByText('Shorten'));
  });
  expect(screen.getByText('The model returned an empty rewrite.')).toBeTruthy();
  rerender(view(true));
  fireEvent.click(screen.getByText('Shorten'));
  expect(generate).toHaveBeenCalledTimes(1);
});
