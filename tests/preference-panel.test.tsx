import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AIProvider, AIPreferencePanel, createAIMemory } from '../src/index.js';
afterEach(cleanup);
it('renders editable preferences and allows users to reset them', () => {
  const memory = createAIMemory();
  render(
    <AIProvider memory={memory}>
      <AIPreferencePanel policyId="notes" proposalId="p1" />
    </AIProvider>,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Suggestion frequency' }), {
    target: { value: 'off' },
  });
  expect(screen.getByRole('status').textContent).toContain('disabled');
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset suggestion preferences' }));
  });
  expect(
    (screen.getByRole('combobox', { name: 'Suggestion frequency' }) as HTMLSelectElement).value,
  ).toBe('normal');
});
