import { createServer } from 'node:http';
import { ReferenceWorkflowStore, createReferenceHandler } from './backend.ts';
const token = process.env.REFERENCE_SESSION_TOKEN;
if (!token || token.length < 32)
  throw new Error('Set REFERENCE_SESSION_TOKEN to a long random secret.');
const store = new ReferenceWorkflowStore(
  process.env.REFERENCE_DB_PATH ?? '.data/reference-workflow.sqlite',
);
store.grant('demo-user', 'demo-workspace');
// Do not replace an existing session silently; restart requires a fresh bootstrap token.
store.createSession('demo-user', token);
const handler = createReferenceHandler(store);
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 64000) {
        outgoing.writeHead(413);
        outgoing.end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(`http://127.0.0.1:5200${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }),
    });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(5200, '127.0.0.1', () =>
  console.log('Reference workflow API listening on http://127.0.0.1:5200'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
