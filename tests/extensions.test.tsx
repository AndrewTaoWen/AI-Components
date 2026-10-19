import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  AIFormFill,
  AIProvider,
  AISelect,
  type AIResponse,
  type AITransport,
} from '../src/index.js';
import { createAIHandler } from '../src/server.js';

afterEach(cleanup);

const options = [
  { value: 'support', label: 'Support', description: 'Technical help' },
  { value: 'finance', label: 'Finance', description: 'Billing and payments' },
  { value: 'legacy', label: 'Legacy', disabled: true },
];
const fields = [
  { name: 'name', label: 'Name' },
  { name: 'email', label: 'Email' },
];
type Patch = Partial<Record<'name' | 'email', string>>;
function parsePatch(data: unknown): Patch {
  const values = data as Record<string, unknown>;
  for (const value of Object.values(values)) {
    if (typeof value !== 'string') throw new Error('Expected text values.');
  }
  return values as Patch;
}

describe('semantic select', () => {
  it('suggests existing options without changing selection until accepted', async () => {
    const onValueChange = vi.fn();
    const generate = vi.fn<AITransport['generate']>(async () => ({
      text: '',
      data: { values: ['finance', 'finance'] },
    }));
    render(
      <AIProvider transport={{ generate }}>
        <AISelect
          aria-label="Team"
          value="support"
          onValueChange={onValueChange}
          options={options}
        />
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Describe an option'), {
      target: { value: 'billing question' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Find options'));
    });
    expect(onValueChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Team') as HTMLSelectElement).value).toBe('support');
    expect(screen.getAllByRole('button', { name: /Finance/ })).toHaveLength(1);
    expect(generate.mock.calls[0][0]).toMatchObject({
      action: 'select',
      context: {
        options: [
          { value: 'support', label: 'Support' },
          { value: 'finance', label: 'Finance' },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Finance/ }));
    expect(onValueChange).toHaveBeenCalledWith('finance');
  });

  it.each(['invented', 'legacy'])('rejects unavailable option %s', async (value) => {
    const onValueChange = vi.fn();
    render(
      <AIProvider transport={{ generate: async () => ({ text: '', data: { values: [value] } }) }}>
        <AISelect aria-label="Team" value="" onValueChange={onValueChange} options={options} />
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Describe an option'), { target: { value: 'help' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Find options'));
    });
    expect(screen.getByText('The model suggested an unavailable option.')).toBeTruthy();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('discards an in-flight result when the description changes', async () => {
    let resolve!: (result: AIResponse) => void;
    const generate = vi.fn<AITransport['generate']>(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(
      <AIProvider transport={{ generate }}>
        <AISelect value="" onValueChange={() => {}} options={options} />
      </AIProvider>,
    );
    const query = screen.getByLabelText('Describe an option');
    fireEvent.change(query, { target: { value: 'billing' } });
    fireEvent.click(screen.getByText('Find options'));
    fireEvent.change(query, { target: { value: 'technical' } });
    expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      resolve({ text: '', data: { values: ['finance'] } });
    });
    expect(screen.queryByRole('button', { name: /Finance/ })).toBeNull();
  });

  it('retains native selection when AI is disabled', () => {
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: '' }));
    const onValueChange = vi.fn();
    render(
      <AIProvider enabled={false} transport={{ generate }}>
        <AISelect
          aria-label="Team"
          value=""
          name="team"
          options={options}
          onValueChange={onValueChange}
        />
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'finance' } });
    expect(onValueChange).toHaveBeenCalledWith('finance');
    expect(screen.queryByText('Find options')).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('handles option removal after generating suggestions', async () => {
    const transport: AITransport = {
      generate: async () => ({ text: '', data: { values: ['finance'] } }),
    };
    const view = (currentOptions: typeof options) => (
      <AIProvider transport={transport}>
        <AISelect value="" onValueChange={() => {}} options={currentOptions} />
      </AIProvider>
    );
    const { rerender } = render(view(options));
    fireEvent.change(screen.getByLabelText('Describe an option'), { target: { value: 'billing' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Find options'));
    });
    rerender(view(options.filter((option) => option.value !== 'finance')));
    expect(screen.queryByRole('button', { name: /Finance/ })).toBeNull();
  });
});

describe('form autofill', () => {
  it('reviews a partial patch and preserves omitted fields when accepted', async () => {
    const transport: AITransport = { generate: async () => ({ text: '', data: { name: 'Alex' } }) };
    function Example() {
      const [contact, setContact] = useState({ name: 'Original', email: 'kept@example.com' });
      return (
        <AIProvider transport={transport}>
          <AIFormFill
            fields={fields}
            parse={parsePatch}
            onApply={(patch) => setContact((current) => ({ ...current, ...patch }))}
          />
          <output>
            {contact.name} / {contact.email}
          </output>
        </AIProvider>
      );
    }
    render(<Example />);
    fireEvent.change(screen.getByLabelText('Paste text to fill this form'), {
      target: { value: 'Name: Alex' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    expect(screen.getByText('Original / kept@example.com')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Proposed form values' })).toBeTruthy();
    fireEvent.click(screen.getByText('Apply values'));
    expect(screen.getByText('Alex / kept@example.com')).toBeTruthy();
    expect(screen.queryByText('Apply values')).toBeNull();
  });

  it.each([
    [{ admin: true }, 'The model returned an unsupported field.'],
    [{ name: 42 }, 'Expected text values.'],
    [{}, 'No matching fields found.'],
  ])('rejects invalid extracted data %j', async (data, message) => {
    const onApply = vi.fn();
    render(
      <AIProvider transport={{ generate: async () => ({ text: '', data }) }}>
        <AIFormFill fields={fields} parse={parsePatch} onApply={onApply} />
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Paste text to fill this form'), {
      target: { value: 'anything' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    expect(screen.getByText(message as string)).toBeTruthy();
    expect(screen.queryByText('Apply values')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('validates the parser output against the field whitelist too', async () => {
    render(
      <AIProvider transport={{ generate: async () => ({ text: '', data: { name: 'Alex' } }) }}>
        <AIFormFill
          fields={fields}
          parse={() => ({ name: 'Alex', admin: true })}
          onApply={() => {}}
        />
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Paste text to fill this form'), {
      target: { value: 'Alex' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    expect(screen.getByText('The model returned an unsupported field.')).toBeTruthy();
  });

  it('invalidates proposals when source text changes or AI is disabled', async () => {
    const onApply = vi.fn();
    const transport: AITransport = { generate: async () => ({ text: '', data: { name: 'Alex' } }) };
    const view = (enabled: boolean) => (
      <AIProvider enabled={enabled} transport={transport}>
        <AIFormFill fields={fields} parse={parsePatch} onApply={onApply} />
      </AIProvider>
    );
    const { rerender } = render(view(true));
    const source = screen.getByLabelText('Paste text to fill this form');
    fireEvent.change(source, { target: { value: 'Alex' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    fireEvent.change(source, { target: { value: 'Someone else' } });
    expect(screen.queryByText('Apply values')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    rerender(view(false));
    expect(screen.queryByText('Apply values')).toBeNull();
    expect((source as HTMLTextAreaElement).disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('does not submit an enclosing form when extracting, discarding, or applying', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onApply = vi.fn();
    render(
      <AIProvider transport={{ generate: async () => ({ text: '', data: { name: 'Alex' } }) }}>
        <form onSubmit={onSubmit}>
          <AIFormFill fields={fields} parse={parsePatch} onApply={onApply} />
        </form>
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Paste text to fill this form'), {
      target: { value: 'Alex' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    fireEvent.click(screen.getByText('Discard'));
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    fireEvent.click(screen.getByText('Apply values'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onApply).toHaveBeenCalledWith({ name: 'Alex' });
  });
});

describe('server action support', () => {
  it.each(['select', 'extract'] as const)(
    'accepts %s requests through the server adapter',
    async (action) => {
      const generate = vi.fn<AITransport['generate']>(async () => ({ text: '', data: {} }));
      const response = await createAIHandler({ authorize: () => true, generate })(
        new Request('http://localhost/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, text: 'test', prompt: '', context: {} }),
        }),
      );
      expect(response.status).toBe(200);
      expect(generate.mock.calls[0][0].action).toBe(action);
    },
  );
});
