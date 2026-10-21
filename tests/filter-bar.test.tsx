import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIFilterBar, AIProvider, type AIFilterField } from '../src/index.js';
afterEach(cleanup);
const fields: AIFilterField[] = [
  { name: 'amount', label: 'Amount', type: 'number', operators: ['greater than'] },
];
it('reviews typed filters before replacing active filters', async () => {
  const onChange = vi.fn();
  render(
    <AIProvider
      transport={{
        generate: async () => ({
          text: '',
          data: { filters: [{ field: 'amount', operator: 'greater than', value: 500 }] },
        }),
      }}
    >
      <AIFilterBar fields={fields} value={[]} onValueChange={onChange} />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe filters'), { target: { value: 'over 500' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Suggest filters'));
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Apply filters'));
  expect(onChange).toHaveBeenCalledWith([
    { field: 'amount', operator: 'greater than', value: 500 },
  ]);
});
it.each([
  { field: 'unknown', operator: 'greater than', value: 1 },
  { field: 'amount', operator: 'delete', value: 1 },
  { field: 'amount', operator: 'greater than', value: '500' },
])('rejects invalid filter %j', async (filter) => {
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data: { filters: [filter] } }) }}>
      <AIFilterBar fields={fields} value={[]} onValueChange={() => {}} />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe filters'), { target: { value: 'query' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Suggest filters'));
  });
  expect(screen.queryByText('Apply filters')).toBeNull();
  expect(screen.getByRole('status').textContent).not.toBe('');
});
it('edits and removes filters without AI', () => {
  const onChange = vi.fn();
  render(
    <AIProvider enabled={false}>
      <AIFilterBar
        fields={fields}
        value={[{ field: 'amount', operator: 'greater than', value: 500 }]}
        onValueChange={onChange}
      />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Amount value 1'), { target: { value: '600' } });
  expect(onChange.mock.calls[0][0][0].value).toBe(600);
  fireEvent.click(screen.getByLabelText('Remove Amount filter 1'));
  expect(onChange).toHaveBeenLastCalledWith([]);
});
