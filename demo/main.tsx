import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AIProvider, AIInput, AITextarea, AISearch, createFetchTransport } from '../src/index.js';
import { demoTransport } from './mock.js';
import '../src/styles.css';
import './style.css';

type Filters = {
  status: 'paid' | 'unpaid' | null;
  minAmount: number | null;
  customer: string | null;
};
function parseFilters(data: unknown): Filters {
  if (!data || typeof data !== 'object') throw new Error('Expected an object of invoice filters.');
  const { status, minAmount, customer } = data as Record<string, unknown>;
  if (status !== 'paid' && status !== 'unpaid' && status !== null) {
    throw new Error('The model returned unsupported filters.');
  }
  if (
    minAmount !== null &&
    (typeof minAmount !== 'number' || !Number.isFinite(minAmount) || minAmount < 0)
  ) {
    throw new Error('The model returned unsupported filters.');
  }
  if (customer !== null && typeof customer !== 'string') {
    throw new Error('The model returned unsupported filters.');
  }
  return { status, minAmount, customer };
}

const playgroundTabs = {
  search: {
    icon: '⌕',
    label: 'Natural search',
    eyebrow: '01 / DISCOVER',
    title: 'Search in your own words',
  },
  write: {
    icon: '≡',
    label: 'Writing assistant',
    eyebrow: '02 / COMPOSE',
    title: 'A thoughtful writing partner',
  },
  input: {
    icon: '↹',
    label: 'Autocomplete',
    eyebrow: '03 / COMPLETE',
    title: 'Keep your train of thought',
  },
} as const;
type PlaygroundTab = keyof typeof playgroundTabs;
const tabIds = Object.keys(playgroundTabs) as PlaygroundTab[];
const invoices = [
  { id: 'INV-1048', customer: 'Acme', amount: 1250, status: 'unpaid' },
  { id: 'INV-1047', customer: 'Linear Studio', amount: 340, status: 'paid' },
  { id: 'INV-1046', customer: 'Acme', amount: 780, status: 'paid' },
  { id: 'INV-1045', customer: 'Northwind', amount: 925, status: 'unpaid' },
];
const liveTransport = createFetchTransport('/api/ai');
function App() {
  const [tab, setTab] = useState<PlaygroundTab>('search');
  const activeTab = playgroundTabs[tab];
  const [basePrompt, setBasePrompt] = useState('Be helpful, clear, and concise.');
  const [live, setLive] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState('unpaid invoices over $500');
  const [filters, setFilters] = useState<Filters | null>(null);
  const [writing, setWriting] = useState('Thanks for your message');
  const [subject, setSubject] = useState('Following up on our conversation');
  const results = invoices.filter(
    (item) =>
      !filters ||
      ((!filters.status || item.status === filters.status) &&
        (filters.minAmount === null || item.amount > filters.minAmount) &&
        (!filters.customer ||
          item.customer.toLowerCase().includes(filters.customer.toLowerCase()))),
  );
  return (
    <AIProvider
      transport={live ? liveTransport : demoTransport}
      basePrompt={basePrompt}
      enabled={enabled}
    >
      <div className="shell">
        <aside>
          <a className="brand" href="#">
            <span className="mark">aı</span> components
          </a>
          <div className="aside-label">THE FRAMEWORK</div>
          <nav aria-label="Playground navigation">
            {tabIds.map((item, index) => (
              <button
                key={item}
                aria-current={tab === item ? 'page' : undefined}
                onClick={() => setTab(item)}
              >
                <span>{playgroundTabs[item].icon}</span>
                {playgroundTabs[item].label}
                <small>0{index + 1}</small>
              </button>
            ))}
          </nav>
          <div className="aside-bottom">
            React + TypeScript
            <br />
            <span>Open source · MIT</span>
          </div>
        </aside>
        <main>
          <header>
            <span>COMPONENT PLAYGROUND</span>
            <span className="version">v0.1.0</span>
          </header>
          <section className="intro">
            <div className="eyebrow">FAMILIAR INTERFACES. A LITTLE MORE CAPABLE.</div>
            <h1>
              AI, where you
              <br />
              already work.
            </h1>
            <p>
              Everyday inputs with understanding built in.
              <br />
              One provider. Your prompts. Your models.
            </p>
          </section>
          <div className="workspace">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{activeTab.eyebrow}</span>
                  <h2>{activeTab.title}</h2>
                </div>
                <span className="tag">{live ? 'Live endpoint' : 'Demo transport'}</span>
              </div>
              {tab === 'search' ? (
                <>
                  <p className="description">
                    Turn a natural-language query into validated invoice filters.
                  </p>
                  <label className="field-label" htmlFor="invoice-search">
                    Find invoices
                  </label>
                  <AISearch
                    id="invoice-search"
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Unpaid invoices over $500"
                    parse={parseFilters}
                    onSearch={setFilters}
                    onPlainSearch={() => setFilters(null)}
                    ai={{
                      prompt:
                        'Return data with status (paid, unpaid, or null), minAmount (nonnegative number or null), customer (string or null). Use null for unspecified filters.',
                    }}
                  />
                  <div className="examples">
                    Try <button onClick={() => setQuery('Acme invoices')}>Acme invoices</button>
                    <button onClick={() => setQuery('paid invoices over $500')}>
                      paid over $500
                    </button>
                  </div>
                  <div className="results-title">
                    <span>{results.length} invoices</span>
                    <button
                      onClick={() => {
                        setFilters(null);
                        setQuery('');
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="invoices">
                    {results.map((item) => (
                      <div key={item.id}>
                        <div>
                          <strong>{item.customer}</strong>
                          <small>{item.id}</small>
                        </div>
                        <span className={`badge ${item.status}`}>{item.status}</span>
                        <strong>${item.amount.toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
                  {filters && (
                    <pre className="filter-output">{JSON.stringify(filters, null, 2)}</pre>
                  )}
                </>
              ) : tab === 'write' ? (
                <>
                  <p className="description">
                    Write naturally. Ask for a draft, review it, then make it yours.
                  </p>
                  <label className="field-label" htmlFor="reply">
                    Customer reply
                  </label>
                  <AITextarea
                    id="reply"
                    rows={6}
                    value={writing}
                    onValueChange={setWriting}
                    ai={{
                      autocomplete: true,
                      helpMeWrite: true,
                      prompt: 'Help draft a warm customer-support reply.',
                    }}
                  />
                  <p className="footnote">
                    Pause to see a completion. Tab accepts it. Escape dismisses it.
                  </p>
                </>
              ) : (
                <>
                  <p className="description">
                    Optional completion for an ordinary, controlled text input.
                  </p>
                  <label className="field-label" htmlFor="subject">
                    Email subject
                  </label>
                  <AIInput
                    id="subject"
                    value={subject}
                    onValueChange={setSubject}
                    ai={{
                      autocomplete: true,
                      prompt: 'Complete this email subject. Return only the suffix to append.',
                    }}
                  />
                  <p className="footnote">
                    Suggestions appear beneath the field in this first version.
                  </p>
                </>
              )}
            </section>
            <section className="config panel">
              <span className="eyebrow">SHARED CONFIGURATION</span>
              <h2>Set the context.</h2>
              <p className="description">Every component inherits the provider’s instructions.</p>
              <label className="field-label" htmlFor="base-prompt">
                Base prompt
              </label>
              <textarea
                id="base-prompt"
                rows={5}
                value={basePrompt}
                onChange={(event) => setBasePrompt(event.target.value)}
              />
              <label className="toggle">
                <span>AI capabilities</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
              </label>
              <label className="toggle">
                <span>Use /api/ai endpoint</span>
                <input
                  type="checkbox"
                  checked={live}
                  onChange={(event) => {
                    setLive(event.target.checked);
                    setFilters(null);
                  }}
                />
              </label>
              <div className="note">
                <strong>{live ? 'Bring your model' : 'No API key needed'}</strong>
                <p>
                  {live
                    ? 'Connect the server handler described in the README. This playground does not run an API server.'
                    : 'Sample responses are deterministic, not model-generated. The mock recognizes paid/unpaid, “over $N,” and Acme. Prompt changes select concise or longer sample drafts.'}
                </p>
              </div>
            </section>
          </div>
          <section className="code-section">
            <div>
              <span className="eyebrow">SMALL API. USEFUL DEFAULTS.</span>
              <h2>Fits into your app.</h2>
              <p>
                Keep your data, styles, and backend.
                <br />
                Add capabilities a component at a time.
              </p>
            </div>
            <pre>{`<AIProvider endpoint="/api/ai" basePrompt="…">\n  <AISearch\n    value={query}\n    onValueChange={setQuery}\n    parse={validateFilters}\n    onSearch={setFilters}\n  />\n</AIProvider>`}</pre>
          </section>
          <footer>
            Built for ordinary interfaces.<span>Credentials stay on your server ↗</span>
          </footer>
        </main>
      </div>
    </AIProvider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
