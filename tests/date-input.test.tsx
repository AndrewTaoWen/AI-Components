import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIDateInput, AIProvider } from '../src/index.js';
afterEach(cleanup);
const referenceDate = '2026-10-20T12:00:00Z';
const timeZone = 'America/Toronto';
it('requires explicit acceptance and supplies a reference and timezone', async () => {
  const onChange = vi.fn();
  const generate = vi.fn(async () => ({
    text: '',
    data: { date: '2026-10-23', time: '15:00', timeZone },
  }));
  render(
    <AIProvider transport={{ generate }}>
      <AIDateInput
        value={null}
        onValueChange={onChange}
        referenceDate={referenceDate}
        timeZone={timeZone}
      />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe a date'), {
    target: { value: 'Friday afternoon' },
  });
  await act(async () => {
    fireEvent.click(screen.getByText('Interpret date'));
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Use date'));
  expect(onChange).toHaveBeenCalledWith({ date: '2026-10-23', time: '15:00', timeZone });
});
it.each([
  { date: '2026-02-30', timeZone },
  { date: '2026-10-23', timeZone: 'UTC' },
  { date: '2026-10-23', time: '25:00', timeZone },
])('rejects invalid or timezone-shifted output %j', async (data) => {
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data }) }}>
      <AIDateInput
        value={null}
        onValueChange={() => {}}
        referenceDate={referenceDate}
        timeZone={timeZone}
      />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe a date'), { target: { value: 'Friday' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Interpret date'));
  });
  expect(screen.queryByText('Use date')).toBeNull();
  expect(screen.getByRole('status').textContent).not.toBe('');
});
it('preserves ordinary date editing when AI is disabled', () => {
  const onChange = vi.fn();
  render(
    <AIProvider enabled={false}>
      <AIDateInput
        value={null}
        onValueChange={onChange}
        referenceDate={referenceDate}
        timeZone={timeZone}
      />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-23' } });
  expect(onChange).toHaveBeenCalledWith({ date: '2026-10-23', time: undefined, timeZone });
  expect(screen.queryByText('Interpret date')).toBeNull();
});
