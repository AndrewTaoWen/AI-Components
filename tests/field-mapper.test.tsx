import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AIFieldMapper, AIProvider } from '../src/index.js';
afterEach(cleanup);
const sources = ['Client Email', 'Other Email'];
const targets = [
  { value: 'email', label: 'Email' },
  { value: 'legacy', label: 'Legacy', disabled: true },
];
it('previews mappings before applying them', async () => {
  const onChange = vi.fn();
  const mappings = [{ source: 'Client Email', target: 'email' }];
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data: { mappings } }) }}>
      <AIFieldMapper sources={sources} targets={targets} value={[]} onValueChange={onChange} />
    </AIProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('Suggest mappings'));
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Apply mappings'));
  expect(onChange).toHaveBeenCalledWith(mappings);
});
it.each(
  [
    [{ source: 'Unknown', target: 'email' }],
    [{ source: 'Client Email', target: 'legacy' }],
    [
      { source: 'Client Email', target: 'email' },
      { source: 'Other Email', target: 'email' },
    ],
    [
      { source: 'Client Email', target: 'email' },
      { source: 'Client Email', target: 'email' },
    ],
  ].map((mappings) => [mappings]),
)('rejects invalid or duplicate mappings %j', async (mappings) => {
  render(
    <AIProvider transport={{ generate: async () => ({ text: '', data: { mappings } }) }}>
      <AIFieldMapper sources={sources} targets={targets} value={[]} onValueChange={() => {}} />
    </AIProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('Suggest mappings'));
  });
  expect(screen.queryByText('Apply mappings')).toBeNull();
  expect(screen.getByRole('status').textContent).not.toBe('');
});
it('supports manual mapping when AI is off and prevents duplicate target selection', () => {
  const onChange = vi.fn();
  render(
    <AIProvider enabled={false}>
      <AIFieldMapper
        sources={sources}
        targets={targets}
        value={[{ source: 'Client Email', target: 'email' }]}
        onValueChange={onChange}
      />
    </AIProvider>,
  );
  const other = screen.getByLabelText('Map Other Email') as HTMLSelectElement;
  expect(other.options[1].disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Map Client Email'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith([]);
});
