---
'@gertsai/pg-client': minor
---

Sprint 3.5 W-4B-4 (additive **A** marker per ADR-005 I-6): new `./storage` subpath ships `PgStorageProvider<Meta>` adapter implementing `IStorageProvider` from `@gertsai/storage-core`. Existing root surface (`PgClient`, `mockPgClient`, `RecordedQuery`, `MockPgClient`) **unchanged** — ADR-011 I-1/I-2 + ADR-005 I-3 preserved.

`PgStorageProvider` capabilities: `{ listeners: false, transactions: true, batches: true }`. Listener methods throw `ListenersNotSupportedError` per ADR-005 I-4. SQLSTATE 40001 (serialization failure) and 40P01 (deadlock) are mapped to `TransactionConflictError`. Optional `TableMap` configures path → table-name overrides; default identity mapping; invalid SQL identifiers throw at constructor.

Cross-provider parity: same behavioural test suite passes against PgStorageProvider (with mockPgClient) AND InMemoryStorageProvider per AC-W4-2.

`@gertsai/storage-core` and `@gertsai/query-dsl` declared as **optional peer dependencies** — root `@gertsai/pg-client` consumers without storage-layer needs unaffected.
