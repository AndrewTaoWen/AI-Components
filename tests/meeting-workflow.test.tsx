import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIProvider } from '../src/index.js';
import example from '../demo/examples/meeting.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('reviews paraphrased offline follow-ups without applying during generation', async () => {
  vi.useFakeTimers();
  render(
    <AIProvider>
      <example.Component />
    </AIProvider>,
  );
  expect(screen.getByText('Rule baseline: No explicit Action: marker found')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Generate meeting follow-up' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(screen.getByRole('list', { name: 'Meeting follow-up tasks' }).textContent).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Review meeting proposal' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply action (1)' }));
  });
  expect(screen.getByRole('list', { name: 'Meeting follow-up tasks' }).textContent).toBe(
    'Send meeting recap',
  );
});
it('clears generated candidates when meeting context changes', async () => {
  vi.useFakeTimers();
  render(
    <AIProvider>
      <example.Component />
    </AIProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generate meeting follow-up' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Prediction meeting note' }), {
    target: { value: 'Unrelated lunch' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(screen.queryByRole('button', { name: 'Review meeting proposal' })).toBeNull();
});

it('rejects a reviewed meeting action after the source note changes', async () => {
  vi.useFakeTimers();
  render(
    <AIProvider>
      <example.Component />
    </AIProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generate meeting follow-up' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review meeting proposal' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Prediction meeting note' }), {
    target: { value: 'Different decision' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply action (1)' }));
  });
  expect(screen.getByRole('alert').textContent).toContain('changed');
  expect(screen.getByRole('list', { name: 'Meeting follow-up tasks' }).textContent).toBe('');
});
