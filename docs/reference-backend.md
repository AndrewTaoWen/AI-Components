# Transactional TypeScript reference backend

Use Node 24+ (native TypeScript stripping and built-in SQLite). Set a fresh, random opaque
`REFERENCE_SESSION_TOKEN` of at least 32 characters, then run
`node examples/reference-backend/start.mjs`. The example binds loopback port 5200 and stores its DB
under ignored `.data/`. It never logs the token; only its SHA-256 digest is stored. Bootstrap grants
one user membership in demo-workspace and creates a one-hour session. Real sign-in/identity-provider
integration and membership administration must remain trusted server operations.

GET/POST `/workspaces/demo-workspace/tasks` uses an Authorization Bearer header. POST accepts only
`{type:'add',mutationId,expectedRevision,additions}` or
`{type:'undo',mutationId,expectedRevision,originalMutationId}`. Additions are bounded, unique strings.
Commands reauthorize the session/membership inside an IMMEDIATE SQLite transaction and atomically
write task state, typed outcome history, and a signed-command idempotency receipt. Receipts are scoped
to workspace and actor; ID reuse for another command conflicts. Undo requires the original actor and
unchanged revision, and writes a compensating event. Replayed responses show current state rather
than an obsolete cached view. DELETE `/session` revokes the supplied session.

The fetch handler bounds actual streamed body bytes, rejects cross-origin browser requests, limits
requests per authenticated session, and returns generic internal errors without credential/body logs.
No model/API-key endpoint, arbitrary action runner, cookie auth, or automatic AI execution is exposed.
Applications must add TLS/reverse-proxy controls, real sign-in, distributed rate limiting, durable audit
retention/erasure, operational backups and deployment review. The in-process rate limit and single-file
SQLite example are a runnable reference, not a hosted production service. No cross-user credentials or
sessions should be created from untrusted request fields. Run the tests to verify isolation, retries,
rollback on event failure, stale conflicts, revocation and guarded undo.
