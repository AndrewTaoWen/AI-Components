import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIProvider, AITagInput, type AITransport } from '../src/index.js';
afterEach(cleanup);
const options = [
  { value: 'billing', label: 'Billing' },
  { value: 'legacy', label: 'Legacy', disabled: true },
];
it('reviews tags before adding and rejects invented or disabled options', async () => {
  const onChange = vi.fn();
  const transport: AITransport = {
    generate: async () => ({ text: '', data: { values: ['billing', 'billing'] } }),
  };
  render(
    <AIProvider transport={transport}>
      <AITagInput value={[]} onValueChange={onChange} options={options} text="Invoice issue" />
    </AIProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('Suggest tags'));
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
  expect(onChange).toHaveBeenCalledWith(['billing']);
});
it.each(['legacy', 'invented'])('rejects unavailable tag %s', async (tag) => {
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data: { values: [tag] } }) }}>
      <AITagInput value={[]} onValueChange={() => {}} options={options} text="Invoice" />
    </AIProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('Suggest tags'));
  });
  expect(screen.getByText('The model suggested an unavailable option.')).toBeTruthy();
});
it('keeps manual selection when AI is disabled and respects the tag limit', () => {
  const onChange = vi.fn();
  const transport: AITransport = { generate: vi.fn() };
  const { rerender } = render(
    <AIProvider enabled={false} transport={transport}>
      <AITagInput
        value={[]}
        onValueChange={onChange}
        options={options}
        text="Invoice"
        maxTags={1}
      />
    </AIProvider>,
  );
  fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'billing' } });
  expect(onChange).toHaveBeenCalledWith(['billing']);
  rerender(
    <AIProvider enabled={false} transport={transport}>
      <AITagInput
        value={['billing']}
        onValueChange={onChange}
        options={options}
        text="Invoice"
        maxTags={1}
      />
    </AIProvider>,
  );
  expect((screen.getByLabelText('Tags') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Billing' }));
  expect(onChange).toHaveBeenLastCalledWith([]);
  expect(transport.generate).not.toHaveBeenCalled();
});
