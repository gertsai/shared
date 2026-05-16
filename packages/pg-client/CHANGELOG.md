# @gertsai/pg-client

## 1.1.0

### Minor Changes

- 4415a5f: Wave 12.B-fix-2 — close HIGH data-integrity finding (EVID-044).

  **Problem:** `PgBatchRunner._apply` iterated queued ops sequentially
  without `BEGIN`/`COMMIT`. A failure on the Nth op left ops 0..N-1
  committed in the database; ops N+1..M never ran. The
  `capabilities.batches: true` flag was effectively false-positive
  about atomicity.

  **Fix:** `_apply()` now wraps all ops in `BEGIN ... COMMIT;` with
  `ROLLBACK` on any failure. Empty batches short-circuit early (no
  spurious `BEGIN`/`COMMIT` round-trip). When `ROLLBACK` itself fails
  (connection torn down), the rollback error is attached to the
  thrown error as `rollbackError` for diagnostic purposes.

  `capabilities.batches: true` is now honest — atomic.

  `runTransaction` is untouched and uses an independent `_flush` code
  path — there is no risk of nested `BEGIN`.

  **Tests:** existing "queues ops" test updated to assert `BEGIN`/
  `COMMIT` envelope; +2 new tests (empty-batch no-op, failure-mid-batch
  → ROLLBACK + rethrow). 37/37 total pass.

  **Consumer impact:** `runBatch` return type unchanged. Thrown errors
  may now carry an additive `rollbackError` field if ROLLBACK fails.
  Callers reading `err.message` continue to work; callers wanting
  rollback diagnostics can read `(err as { rollbackError?: unknown })
.rollbackError`.

  Refs: PRD-030, RFC-021, EVID-044.

### Patch Changes

- @gertsai/storage-core@1.0.0

## 1.0.0

### Minor Changes

- 23d088a: Initial release of `@gertsai/pg-client` — agnostic 3-method PostgreSQL client interface (`$queryRaw` / `$executeRaw` / `$disconnect`) + `mockPgClient()` test fixture. Zero dependencies on any specific Postgres driver/ORM (per ADR-004 I-3 + ADR-011 I-1/I-2). Replaces previously planned `@gertsai/database` per ADR-004 F-A-2.
- d295ee8: Sprint 3.5 W-4B-4 (additive **A** marker per ADR-005 I-6): new `./storage` subpath ships `PgStorageProvider<Meta>` adapter implementing `IStorageProvider` from `@gertsai/storage-core`. Existing root surface (`PgClient`, `mockPgClient`, `RecordedQuery`, `MockPgClient`) **unchanged** — ADR-011 I-1/I-2 + ADR-005 I-3 preserved.

  `PgStorageProvider` capabilities: `{ listeners: false, transactions: true, batches: true }`. Listener methods throw `ListenersNotSupportedError` per ADR-005 I-4. SQLSTATE 40001 (serialization failure) and 40P01 (deadlock) are mapped to `TransactionConflictError`. Optional `TableMap` configures path → table-name overrides; default identity mapping; invalid SQL identifiers throw at constructor.

  Cross-provider parity: same behavioural test suite passes against PgStorageProvider (with mockPgClient) AND InMemoryStorageProvider per AC-W4-2.

  `@gertsai/storage-core` and `@gertsai/query-dsl` declared as **optional peer dependencies** — root `@gertsai/pg-client` consumers without storage-layer needs unaffected.

### Patch Changes

- Updated dependencies [d295ee8]
- Updated dependencies [d295ee8]
  - @gertsai/query-dsl@1.0.0
  - @gertsai/storage-core@1.0.0

_Initial release pending._
