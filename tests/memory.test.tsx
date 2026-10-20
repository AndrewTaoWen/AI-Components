import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  AIFormFill,
  AIProvider,
  AIRewriteMenu,
  createAIMemory,
  defineAIContext,
  fromAction,
  fromContext,
  fromMemory,
  useAIMemory,
  useAITask,
  type AIConfig,
  type AIFormField,
  type AIResponse,
  type AITransport,
} from '../src/index.js';

afterEach(cleanup);
const recipe = defineAIContext({
  name: 'support.reply',
  purpose: 'Draft a customer reply.',
  borrow: { customer: fromMemory('customer') },
  anticipate: () => 'The user will review this reply before sending.',
});

describe('session memory store', () => {
  it('publishes accepted values and actions atomically without retaining caller-owned objects', () => {
    const memory = createAIMemory({ clock: () => '2026-10-20T12:00:00Z' });
    const customer = { name: 'Alex', tags: ['billing'] };
    const listener = vi.fn();
    memory.subscribe(listener);
    memory.remember('shared', 'customer', customer, {
      type: 'customer.accepted',
      source: 'contact-form',
    });
    customer.tags.push('mutated');
    const snapshot = memory.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot.scopes.shared.customer).toEqual({ name: 'Alex', tags: ['billing'] });
    expect(snapshot.actions[0]).toMatchObject({
      scope: 'shared',
      type: 'customer.accepted',
      source: 'contact-form',
      timestamp: '2026-10-20T12:00:00Z',
    });
    expect(Object.isFrozen(snapshot.scopes.shared.customer)).toBe(true);
  });

  it('bounds history, isolates scopes, and clears both state and scoped history', () => {
    const memory = createAIMemory({ maxActions: 2 });
    memory.remember('shared', 'tone', 'friendly', { type: 'tone.accepted' });
    memory.remember('ticket', 'subject', 'Billing', { type: 'subject.accepted' });
    memory.recordAction('ticket', { type: 'reply.accepted', data: 'Hello' });
    expect(memory.getSnapshot().actions.map((action) => action.type)).toEqual([
      'subject.accepted',
      'reply.accepted',
    ]);
    memory.clear('ticket');
    expect(memory.getSnapshot().scopes).toEqual({ shared: { tone: 'friendly' } });
    expect(memory.getSnapshot().actions).toEqual([]);
    memory.clearAll();
    expect(memory.getSnapshot().scopes).toEqual({});
  });

  it('rejects invalid data without partially publishing state or history', () => {
    const memory = createAIMemory();
    const before = memory.getSnapshot();
    expect(() =>
      memory.remember('shared', 'bad', { value: Infinity }, { type: 'bad.accepted' }),
    ).toThrow();
    expect(() => memory.update('__proto__', {})).toThrow();
    expect(() => createAIMemory({ initial: { shared: 5 } } as never)).toThrow();
    expect(memory.getSnapshot()).toBe(before);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => memory.remember('shared', 'bad', cyclic, { type: 'bad.accepted' })).toThrow();
    expect(memory.getSnapshot()).toBe(before);
  });

  it('supports updater functions and unsubscribing', () => {
    const memory = createAIMemory({ initial: { shared: { count: 1 } } });
    const listener = vi.fn();
    const unsubscribe = memory.subscribe(listener);
    unsubscribe();
    memory.update('shared', (current) => ({ count: Number(current.count) + 1 }));
    expect(memory.getSnapshot().scopes.shared.count).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('React memory scopes', () => {
  it('shares updates across hooks while keeping named scopes separate', () => {
    const memory = createAIMemory();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AIProvider memory={memory}>{children}</AIProvider>
    );
    const { result } = renderHook(
      () => ({ first: useAIMemory(), second: useAIMemory(), ticket: useAIMemory('ticket') }),
      { wrapper },
    );
    act(() => result.current.first.updateMemory({ tone: 'friendly' }));
    expect(result.current.second.memory.tone).toBe('friendly');
    expect(result.current.ticket.memory.tone).toBeUndefined();
    act(() => result.current.ticket.remember('name', 'Alex', { type: 'name.accepted' }));
    expect(result.current.first.actions).toHaveLength(0);
    expect(result.current.ticket.actions).toHaveLength(1);
  });

  it('inherits stores through nested providers and creates separate stores for independent roots', () => {
    const root = renderHook(() => useAIMemory(), {
      wrapper: ({ children }) => <AIProvider>{children}</AIProvider>,
    });
    const other = renderHook(() => useAIMemory(), {
      wrapper: ({ children }) => <AIProvider>{children}</AIProvider>,
    });
    act(() => root.result.current.updateMemory({ account: 'one' }));
    expect(other.result.current.memory).toEqual({});
    const store = createAIMemory();
    const nested = renderHook(() => useAIMemory(), {
      wrapper: ({ children }) => (
        <AIProvider memory={store}>
          <AIProvider memoryScope="ticket">{children}</AIProvider>
        </AIProvider>
      ),
    });
    act(() => nested.result.current.updateMemory({ account: 'nested' }));
    expect(store.getSnapshot().scopes.ticket).toEqual({ account: 'nested' });
  });
});

describe('context recipes', () => {
  it('borrows explicit sources, records provenance, and explains expected use without sending a request', () => {
    const memory = createAIMemory({
      initial: { shared: { customer: { name: 'Alex' }, unselected: 'not sent' } },
    });
    memory.recordAction('shared', { type: 'tags.accepted', data: ['billing'] });
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: 'Hello' }));
    const context = { product: 'Acme', other: 'ordinary static context' };
    const config: AIConfig = {
      prompt: 'Be clear.',
      recipe: defineAIContext({
        name: 'reply',
        purpose: 'Draft a support reply.',
        borrow: {
          customer: fromMemory('customer'),
          tags: fromAction('tags.accepted'),
          product: fromContext('product'),
          absent: fromMemory('missing'),
        },
        instructions: ({ borrowed }) =>
          borrowed.customer ? 'Use the accepted customer.' : 'Ask for a customer.',
        anticipate: ({ input }) =>
          input.action === 'complete'
            ? 'Tab will append a suffix.'
            : 'The user will review a full draft.',
      }),
    };
    const { result } = renderHook(() => useAITask(config), {
      wrapper: ({ children }) => (
        <AIProvider
          transport={{ generate }}
          memory={memory}
          basePrompt="Brand voice."
          context={context}
        >
          {children}
        </AIProvider>
      ),
    });
    const prepared = result.current.prepare({ action: 'complete', text: 'Hi' });
    expect(prepared.prompt).toContain('Brand voice.');
    expect(prepared.prompt).toContain('Tab will append a suffix.');
    expect(prepared.context?._ai).toMatchObject({
      recipe: 'reply',
      borrowed: {
        customer: { name: 'Alex' },
        product: 'Acme',
        tags: { type: 'tags.accepted', data: ['billing'] },
      },
      sources: { customer: 'memory:current.customer' },
    });
    expect(JSON.stringify(prepared.context?._ai)).not.toContain('not sent');
    expect(JSON.stringify(prepared.context?._ai)).not.toContain('absent');
    expect(generate).not.toHaveBeenCalled();
    expect(memory.getSnapshot().actions).toHaveLength(1);
  });

  it('uses the current scope unless an explicit cross-scope source is selected', () => {
    const memory = createAIMemory({
      initial: {
        shared: { tone: 'friendly' },
        ticket: { customer: 'Alex' },
        other: { customer: 'Hidden' },
      },
    });
    const config: AIConfig = {
      recipe: defineAIContext({
        name: 'scoped',
        purpose: 'Scoped reply',
        borrow: { customer: fromMemory('customer'), tone: fromMemory('tone', 'shared') },
      }),
    };
    const { result } = renderHook(() => useAITask(config), {
      wrapper: ({ children }) => (
        <AIProvider memory={memory} memoryScope="ticket">
          {children}
        </AIProvider>
      ),
    });
    expect(result.current.prepare({ action: 'write', text: '' }).context?._ai).toMatchObject({
      borrowed: { customer: 'Alex', tone: 'friendly' },
    });
    expect(JSON.stringify(result.current.prepare({ action: 'write', text: '' }))).not.toContain(
      'Hidden',
    );
  });

  it('only invalidates an in-flight request when its selected context changes', async () => {
    const memory = createAIMemory({ initial: { shared: { customer: 'Alex' } } });
    let resolve!: (value: AIResponse) => void;
    const generate = vi.fn<AITransport['generate']>(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const config = { recipe };
    const transport = { generate };
    const { result } = renderHook(() => useAITask(config), {
      wrapper: ({ children }) => (
        <AIProvider memory={memory} transport={transport}>
          {children}
        </AIProvider>
      ),
    });
    let request!: Promise<AIResponse | null>;
    act(() => {
      request = result.current.run({ action: 'write', text: '' });
    });
    act(() => memory.update('shared', { unrelated: 'value' }));
    expect(generate.mock.calls[0][1].signal.aborted).toBe(false);
    act(() => memory.update('shared', { customer: 'Noah' }));
    expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      resolve({ text: 'Stale' });
      expect(await request).toBeNull();
    });
  });

  it('invalidates a reviewed proposal when borrowed memory is cleared', async () => {
    const memory = createAIMemory({ initial: { shared: { customer: 'Alex' } } });
    const config = { recipe };
    render(
      <AIProvider memory={memory} transport={{ generate: async () => ({ text: 'Hi Alex' }) }}>
        <AIRewriteMenu value="Hello" onValueChange={() => {}} ai={config} />
      </AIProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Shorten'));
    });
    expect(screen.getByText('Use rewrite')).toBeTruthy();
    act(() => memory.clear('shared'));
    expect(screen.queryByText('Use rewrite')).toBeNull();
  });

  it('reports failing selectors without sending a partial request', async () => {
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: 'unused' }));
    const config = {
      recipe: defineAIContext({
        name: 'broken',
        purpose: 'Test',
        borrow: {
          broken: () => {
            throw new Error('Missing workflow record');
          },
        },
      }),
    };
    const { result } = renderHook(() => useAITask(config), {
      wrapper: ({ children }) => <AIProvider transport={{ generate }}>{children}</AIProvider>,
    });
    await act(async () => {
      expect(await result.current.run({ action: 'write', text: '' })).toBeNull();
    });
    expect(result.current.error?.message).toBe('Missing workflow record');
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('accepted actions across components', () => {
  const fields: readonly AIFormField[] = [{ name: 'name', label: 'Name' }];
  const parse = (data: unknown) => data as { name: string };

  it('remembers accepted form values, then lets a separate writer borrow them', async () => {
    const memory = createAIMemory();
    const generate = vi.fn<AITransport['generate']>(async (request) =>
      request.action === 'extract' ? { text: '', data: { name: 'Alex' } } : { text: 'Hi Alex' },
    );
    const customerAI: AIConfig = {
      remember: { key: 'customer', action: 'customer.accepted', source: 'contact-form' },
    };
    const replyAI: AIConfig = { recipe, remember: { key: 'reply', action: 'reply.accepted' } };
    render(
      <AIProvider memory={memory} transport={{ generate }}>
        <AIFormFill fields={fields} parse={parse} onApply={() => {}} ai={customerAI} />
        <AIRewriteMenu value="Hello" onValueChange={() => {}} ai={replyAI} />
      </AIProvider>,
    );
    fireEvent.change(screen.getByLabelText('Paste text to fill this form'), {
      target: { value: 'Name: Alex' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    expect(memory.getSnapshot().actions).toEqual([]);
    fireEvent.click(screen.getByText('Discard'));
    expect(memory.getSnapshot().actions).toEqual([]);
    await act(async () => {
      fireEvent.click(screen.getByText('Suggest field values'));
    });
    fireEvent.click(screen.getByText('Apply values'));
    expect(memory.getSnapshot().scopes.shared.customer).toEqual({ name: 'Alex' });
    await act(async () => {
      fireEvent.click(screen.getByText('Shorten'));
    });
    expect(generate.mock.calls.at(-1)?.[0].context?._ai).toMatchObject({
      borrowed: { customer: { name: 'Alex' } },
    });
    expect(memory.getSnapshot().actions).toHaveLength(1);
    fireEvent.click(screen.getByText('Use rewrite'));
    expect(memory.getSnapshot().actions.map((action) => action.type)).toEqual([
      'customer.accepted',
      'reply.accepted',
    ]);
  });

  it('does not implicitly send stored memory to hooks without a recipe', async () => {
    const memory = createAIMemory({ initial: { shared: { customer: 'Not selected' } } });
    const generate = vi.fn<AITransport['generate']>(async () => ({ text: 'Hi' }));
    const { result } = renderHook(() => useAITask(), {
      wrapper: ({ children }) => (
        <AIProvider memory={memory} transport={{ generate }}>
          {children}
        </AIProvider>
      ),
    });
    await act(async () => {
      await result.current.run({ action: 'write', text: '' });
    });
    expect(generate.mock.calls[0][0].context).toEqual({});
    expect(memory.getSnapshot().actions).toEqual([]);
  });
});
