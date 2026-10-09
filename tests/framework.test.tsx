import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import {
  AIProvider,
  AIInput,
  AITextarea,
  AISearch,
  useAITask,
  createFetchTransport,
  type AIRequest,
  type AIResponse,
  type AITransport,
} from '../src/index.js';
import { createAIHandler } from '../src/server.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('provider and request lifecycle', () => {
  it('inherits transport, appends prompts, and overrides context at the component', async () => {
    const generate = vi.fn(async () => ({ text: 'ok' }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AIProvider
        transport={{ generate }}
        basePrompt="global"
        context={{ team: 'global', locale: 'en' }}
      >
        <AIProvider basePrompt="nested" context={{ team: 'nested' }}>
          {children}
        </AIProvider>
      </AIProvider>
    );
    const { result } = renderHook(
      () => useAITask({ prompt: 'field', context: { team: 'field' } }),
      { wrapper },
    );
    await act(async () => {
      await result.current.run({ action: 'complete', text: 'hello' });
    });
    expect(generate.mock.calls[0]).toMatchObject([
      { prompt: 'global\n\nnested\n\nfield', context: { team: 'field', locale: 'en' } },
      { signal: expect.any(AbortSignal) },
    ]);
  });
  it('ignores stale results even when the transport does not respect cancellation', async () => {
    const pending: ((value: AIResponse) => void)[] = [];
    const signals: AbortSignal[] = [];
    const transport: AITransport = {
      generate: (_request, { signal }) => {
        signals.push(signal);
        return new Promise((resolve) => pending.push(resolve));
      },
    };
    const { result } = renderHook(() => useAITask(), {
      wrapper: ({ children }) => <AIProvider transport={transport}>{children}</AIProvider>,
    });
    let first!: Promise<AIResponse | null>;
    let second!: Promise<AIResponse | null>;
    act(() => {
      first = result.current.run({ action: 'complete', text: 'first' });
    });
    act(() => {
      second = result.current.run({ action: 'complete', text: 'second' });
    });
    expect(signals[0].aborted).toBe(true);
    await act(async () => {
      pending[1]({ text: 'new' });
      expect(await second).toEqual({ text: 'new' });
    });
    await act(async () => {
      pending[0]({ text: 'old' });
      expect(await first).toBeNull();
    });
    expect(result.current.status).toBe('success');
  });
  it('aborts on unmount and respects an inherited kill switch', async () => {
    const generate = vi.fn<AITransport['generate']>(() => new Promise(() => {}));
    const transport = { generate };
    const hook = renderHook(() => useAITask(), {
      wrapper: ({ children }) => <AIProvider transport={transport}>{children}</AIProvider>,
    });
    act(() => {
      void hook.result.current.run({ action: 'write', text: '' });
    });
    const signal = generate.mock.calls[0][1].signal;
    hook.unmount();
    expect(signal.aborted).toBe(true);
    const disabled = renderHook(() => useAITask(), {
      wrapper: ({ children }) => (
        <AIProvider transport={transport} enabled={false}>
          <AIProvider enabled>{children}</AIProvider>
        </AIProvider>
      ),
    });
    await act(async () => {
      expect(await disabled.result.current.run({ action: 'write', text: '' })).toBeNull();
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('everyday components', () => {
  it('debounces completion and accepts only a visible suggestion with Tab', async () => {
    vi.useFakeTimers();
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: ' world' }));
    function Form() {
      const [value, setValue] = useState('hello');
      return (
        <AIProvider transport={transport}>
          <AIInput
            aria-label="Title"
            value={value}
            onValueChange={setValue}
            ai={{ autocomplete: true }}
          />
        </AIProvider>
      );
    }
    const transport = { generate };
    render(<Form />);
    const input = screen.getByLabelText('Title');
    fireEvent.focus(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(generate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('world')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect((input as HTMLInputElement).value).toBe('hello world');
    expect(screen.queryByRole('button', { name: 'Accept ↹' })).toBeNull();
  });
  it('previews writing assistance without overwriting text until accepted', async () => {
    const transport: AITransport = { generate: async () => ({ text: 'Improved draft' }) };
    function Form() {
      const [value, setValue] = useState('Original');
      return (
        <AIProvider transport={transport}>
          <AITextarea
            aria-label="Reply"
            value={value}
            onValueChange={setValue}
            ai={{ helpMeWrite: true }}
          />
        </AIProvider>
      );
    }
    render(<Form />);
    fireEvent.click(screen.getByText('✦ Help me write'));
    await act(async () => {
      fireEvent.click(screen.getByText('Generate draft'));
    });
    expect((screen.getByLabelText('Reply') as HTMLTextAreaElement).value).toBe('Original');
    fireEvent.click(screen.getByText('Use draft'));
    expect((screen.getByLabelText('Reply') as HTMLTextAreaElement).value).toBe('Improved draft');
  });
  it('cancels completions during composition and never generates for read-only inputs', async () => {
    vi.useFakeTimers();
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: ' suffix' }));
    const transport = { generate };
    render(
      <AIProvider transport={transport}>
        <AIInput
          aria-label="Editable"
          value="hello"
          onValueChange={() => {}}
          ai={{ autocomplete: true }}
        />
        <AIInput
          aria-label="Locked"
          readOnly
          value="hello"
          onValueChange={() => {}}
          ai={{ autocomplete: true }}
        />
      </AIProvider>,
    );
    const input = screen.getByLabelText('Editable');
    fireEvent.focus(input);
    fireEvent.compositionStart(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(generate).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(generate).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    fireEvent.focus(screen.getByLabelText('Locked'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed structured filters before notifying the application', async () => {
    const onSearch = vi.fn();
    render(
      <AIProvider transport={{ generate: async () => ({ text: '', data: { amount: 'bad' } }) }}>
        <AISearch
          aria-label="Search"
          value="over 500"
          onValueChange={() => {}}
          parse={(data) => {
            if (typeof (data as { amount: unknown }).amount !== 'number')
              throw new Error('Invalid amount');
            return data;
          }}
          onSearch={onSearch}
        />
      </AIProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    });
    expect(screen.getByText('Invalid amount')).toBeTruthy();
    expect(onSearch).not.toHaveBeenCalled();
  });
  it('uses plain search when AI is disabled', () => {
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: '' }));
    const onPlainSearch = vi.fn();
    const onSearch = vi.fn();
    render(
      <AIProvider enabled={false} transport={{ generate }}>
        <AISearch
          value="Acme"
          onValueChange={() => {}}
          parse={(data) => data}
          onSearch={onSearch}
          onPlainSearch={onPlainSearch}
        />
      </AIProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onPlainSearch).toHaveBeenCalledWith('Acme');
    expect(generate).not.toHaveBeenCalled();
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe('server boundary', () => {
  const payload: AIRequest = {
    action: 'complete',
    text: 'hello',
    prompt: 'client',
    context: { team: 'spoof' },
  };
  function request(body: unknown = payload) {
    return new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  it('authenticates before generation and validates actions', async () => {
    const generate = vi.fn(async () => ({ text: 'ok' }));
    expect((await createAIHandler({ authorize: () => false, generate })(request())).status).toBe(
      401,
    );
    expect(
      (
        await createAIHandler({ authorize: () => true, generate })(
          request({ ...payload, action: 'unknown' }),
        )
      ).status,
    ).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it('bounds body size and protects trusted context from client overrides', async () => {
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: 'ok' }));
    expect(
      (await createAIHandler({ authorize: () => true, generate, maxBodyBytes: 10 })(request()))
        .status,
    ).toBe(413);
    const response = await createAIHandler({
      authorize: () => true,
      generate,
      basePrompt: 'server',
      context: { team: 'trusted' },
    })(request());
    expect(response.status).toBe(200);
    expect(generate.mock.calls[0][0]).toMatchObject({
      prompt: 'server\n\nclient',
      context: { team: 'trusted' },
    });
  });
  it('does not expose provider errors or credentials', async () => {
    const response = await createAIHandler({
      authorize: () => true,
      generate: async () => {
        throw new Error('secret-key');
      },
    })(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret-key');
  });
  it('rejects malformed transport responses', async () => {
    const transport = createFetchTransport('/api/ai', {
      fetch: vi.fn<typeof fetch>(async () => Response.json({ text: 42 })),
    });
    await expect(
      transport.generate(payload, { signal: new AbortController().signal }),
    ).rejects.toThrow('invalid response');
  });
});
