import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIMultiSelect, AIProvider } from '../src/index.js';
afterEach(cleanup);
const options = [
  { value: 'a', label: 'Alice' },
  { value: 'b', label: 'Bob' },
  { value: 'c', label: 'Carol' },
  { value: 'disabled', label: 'Disabled', disabled: true },
];
it('reviews additions, deduplicates, and preserves current selections', async () => {
  const onChange = vi.fn();
  render(
    <AIProvider
      transport={{ generate: async () => ({ text: '', data: { values: ['a', 'b', 'b'] } }) }}
    >
      <AIMultiSelect options={options} value={['a']} onValueChange={onChange} />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe choices'), { target: { value: 'team' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Find matches'));
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Add matches'));
  expect(onChange).toHaveBeenCalledWith(['a', 'b']);
});
it.each([['missing'], ['disabled']])('rejects unavailable match %s', async (match) => {
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data: { values: [match] } }) }}>
      <AIMultiSelect options={options} value={[]} onValueChange={() => {}} />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe choices'), { target: { value: 'team' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Find matches'));
  });
  expect(screen.getByText('The model suggested an unavailable option.')).toBeTruthy();
});
it('rejects a batch that exceeds the remaining selection capacity', async () => {
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data: { values: ['b', 'c'] } }) }}>
      <AIMultiSelect options={options} value={['a']} maxSelected={2} onValueChange={() => {}} />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Describe choices'), { target: { value: 'team' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Find matches'));
  });
  expect(screen.queryByText('Add matches')).toBeNull();
  expect(
    screen.getByText('Too many matches for the selection limit. Narrow your description.'),
  ).toBeTruthy();
});
it('uses native named checkboxes when AI is off', () => {
  const onChange = vi.fn();
  render(
    <AIProvider enabled={false}>
      <form aria-label="People">
        <AIMultiSelect
          options={options}
          value={['a']}
          name="people"
          maxSelected={1}
          onValueChange={onChange}
        />
      </form>
    </AIProvider>,
  );
  const data = new FormData(screen.getByRole('form', { name: 'People' }) as HTMLFormElement);
  expect(data.getAll('people')).toEqual(['a']);
  expect((screen.getByLabelText('Bob') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Alice'));
  expect(onChange).toHaveBeenCalledWith([]);
});
