# @gertsai/pg-client

## 3.0.0

### Patch Changes

- 8aa7198: Wave 21 — close 9 HIGH + 2 MED + 2 CP findings from EVID-076 across 5 platform packages.

  **Tests: +44** (17 from Teammate W + 27 from Teammate X). All 5 affected packages pass; workspace typecheck 0 errors across 45 projects.

  **Teammate W — ws-rpc + hsm + query-dsl/sql.ts (+154/+101/+23/+18 src LOC)**:

  - **H-WS-1** (`ws-rpc/client.ts:541`) — reconnect chain no longer dies on pre-onopen `createWebSocket()` rejection (DNS/ECONNREFUSED). Synth `handleClose(1006)` in connect catch + tracked `pendingSyntheticCloseTimer`.
  - **H-WS-2** (`ws-rpc/subscription.ts:143`) — wildcardMatch ReDoS bounded via `MAX_DOUBLE_STAR_SEGMENTS=3` + `MAX_TOPIC_SEGMENTS=64` + `MAX_WILDCARD_RECURSION_DEPTH=100`. Adversarial patterns rejected at subscribe time via new `InvalidSubscriptionPatternError`.
  - **H-WS-3** — Node protocol-ping via `ws.ping()` + pong watchdog; browser falls back to app-level heartbeat.
  - **H-HSM-1** (`hsm/convergent-encryption.ts`) — ALWAYS recompute SHA-256 on decrypt + throw `HSMError(INVALID_CONTEXT)` on mismatch.
  - **M-WS-1** (`ws-rpc reconnect`) — off-by-one fix: `getDelay()` BEFORE `recordAttempt()`.
  - **M-QDS-1** (`query-dsl/sql.ts`) — `quoteIdent` emits `"<name>"` with `""` escape (Postgres-safe).

  **Teammate X — entity-storage + storage-core + query-dsl/validate + entity-audit (+176/+64/+217 LOC across files)**:

  - **H-ENT-1+H-ENT-2** (`entity-storage/InMemoryStorageProvider.ts`) — `runTransaction` rewritten with per-key version snapshot + per-key merge commit + read-set+write-set verification. Concurrent commits touching disjoint keys no longer clobber. Writes-without-reads use implicit pre-snapshot version → no longer bypass conflict detection. Chose Option 3 (fail-on-conflict, matches PG MVCC + ADR-005 `TransactionConflictError`).
  - **H-ENT-3** (`entity-storage/applyQueryFilter.ts`) — `offset` now applied (was silently ignored).
  - **H-ENT-4** (`entity-storage/applyQueryFilter.ts`) — `limitToLast` now applied (was silently ignored).
  - **CP-2** (`@gertsai/query-dsl/src/capabilities.ts` NEW) — `QueryCapabilities` type + 4 preset constants; `validateQuery(query, capabilities)` rejects constraints unsupported by target backend. Same query now provably returns same rows on InMemory vs Pg (or fails validation at the boundary).
  - **CP-1** (`@gertsai/entity-audit/src/index.ts`) — `AUDIT_FIELDS` + `CREATOR_AUDIT_FIELDS` shared constants exported. InMemoryStorageProvider + PgStorageProvider import; hardcoded strings eliminated from runtime code (2 remaining hits are JSDoc comments).
  - `@gertsai/pg-client` gains peer-optional dep on `@gertsai/entity-audit` for `/storage` subpath (mirrors existing query-dsl peer-optional pattern).

  **Tests** (+44 total):

  - ws-rpc 113 → 124 (+11)
  - hsm 32 → 35 (+3)
  - query-dsl 56 → 64 (+8 capability gating)
  - entity-storage 103 → 117 (+14 — 8 offset/limitToLast + 6 concurrent commit)
  - entity-audit 30 → 35 (+5 AUDIT_FIELDS)

  **Behaviour breaks (pre-1.0 minor bumps allowed):**

  - ws-rpc subscribe throws `InvalidSubscriptionPatternError` on adversarial patterns (was silently accepted)
  - hsm `decrypt` throws on hash-mismatch (was silently trusted)
  - query-dsl `validateQuery` now requires capabilities arg (or backwards-compat path TBD)
  - query-dsl `quoteIdent` emits quoted output (was raw)
  - entity-storage InMemoryStorageProvider commits now throw `TransactionConflictError` on race (was silent clobber)
  - entity-storage `applyQueryFilter` now honors `offset` + `limitToLast` (was silently ignored)

  Per-adapter bumps:

  - @gertsai/ws-rpc: minor (4 new error classes, behaviour break)
  - @gertsai/hsm: minor (decrypt now throws on mismatch)
  - @gertsai/query-dsl: minor (quoteIdent + capabilities)
  - @gertsai/entity-storage: minor (transaction + applyQueryFilter behaviour changes)
  - @gertsai/entity-audit: minor (new exports)
  - @gertsai/pg-client: patch (only uses AUDIT_FIELDS internally)

  Refs: PRD-059, EVID-076 (Wave 20 audit), ADR-005 (storage-core architecture).

- Updated dependencies [8aa7198]
  - @gertsai/query-dsl@2.1.0
  - @gertsai/entity-audit@0.2.0

## 2.0.0

### Patch Changes

- @gertsai/storage-core@2.0.0
- @gertsai/query-dsl@2.0.0

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
