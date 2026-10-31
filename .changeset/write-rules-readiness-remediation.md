---
"@gertsai/storage-core": major
"@gertsai/entity-storage": major
"@gertsai/pg-client": major
"@gertsai/query-dsl": minor
---

Repair write readiness and the original write-rules changes: `storage-core` updates the write contract, `entity-storage` corrects shallow literal-key patches and same-service audited routing, and `pg-client` advances its version/CAS semantics and `SetWriteOpts` contract. `query-dsl` adds qualified identifier support. Also stabilize single-write `get`/`getAfter` reads and reuse stamped lifecycle payloads across evaluation and persistence. `entity-storage` now owns deep snapshots of claims and mutation payloads and closes audited mutation runners when their user callbacks settle, before deferred policy checks.

Resolve PostgreSQL query fields from JSONB payloads with collision-free positional parameters. Correct `array-contains-any` for string, numeric, and null candidates while preserving flat-column compiler consumers.

Keep the original authorization action and optimistic-concurrency precondition across asynchronous reads and policy evaluation, so caller mutations cannot change the authorized journal or remove a stale-write guard. Resolve only explicitly owned action and wildcard predicates; inherited object methods cannot authorize writes.

**Breaking default:** provider `set(path, id, data, opts?)`, including raw batch and transaction runners, now merges with an existing document by default instead of overwriting it. Pass `{ merge: false }` explicitly to retain overwrite semantics.
