# @gertsai/entity-storage

## 5.0.0

### Patch Changes

- Updated dependencies [98f41f1]
  - @gertsai/session@2.1.0
  - @gertsai/entity-audit@0.2.3
  - @gertsai/entity@1.1.5

## 4.0.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [8aa7198]
  - @gertsai/entity-audit@0.2.0

## 3.0.0

### Minor Changes

- 05258e5: Wave 12.D-fix Teammate D — close 7 HIGH/MED logic findings per PRD-036:

  - **FR-017 (async-utils)** — `sleep(ms, signal?)` now accepts an
    `AbortSignal` and rejects with `signal.reason` (or `Error('Sleep aborted')`)
    when aborted. `retry()` propagates its signal into the back-off sleep
    AND re-checks the signal after `await sleep()` so a mid-back-off abort
    surfaces immediately instead of completing the full delay window.
  - **FR-018 (session-guard)** — `isImpersonating(session)` is now a
    pure predicate that returns `false` for `undefined` / `null` / empty
    UUIDs (CWE-1188 fail-closed). New companion helpers added:
    `assertImpersonating(session)` (throws `DataAccessUuidMissingError` on
    empty UUIDs, plain `Error` when UUIDs equal) and
    `checkImpersonating(session)` (returns `CheckResult<{ impersonating }>`
    discriminating the three failure modes).
  - **FR-019 (runtime-context)** — `RequestContext.$setSession` now throws
    with an explicit single-middleware-invariant message (EVID-051 L-3) so
    accidental "middleware ran twice" races surface as a hard error rather
    than a silent authorisation downgrade. JSDoc on `$freeze()` documents
    the invariant.
  - **FR-020 (runtime-context)** — `DefaultFeatureContext` accepts an
    optional `FeatureContextLogger` (structural `Pick<Logger, 'warn'>`
    shape, no hard import on `@gertsai/logger-factory`). When a logger is
    configured, flag-provider exceptions are logged at `warn` level before
    defaulting to `false`. Back-compat preserved (no logger = silent).
  - **FR-021 (entity-storage)** — `set` / `update` / `delete` / `destroy` /
    `restore` / `upsert` now re-check `_destroyed` after every
    `await provider.*` and suppress the emit if the service was destroyed
    mid-operation (EVID-051 L-5). Upsert JSDoc documents the 2-RTT TOCTOU
    race and recommended mitigations (native 1-RTT fast path or
    `runTransaction`). Full transactional upsert fallback tracked for
    Wave 14 / D2.
  - **FR-011 (arch)** — `engines.node ">=22"` added to `runtime-context`
    and `entity-storage` (both use `node:crypto` / `node:events`).
    `async-utils` and `session-guard` remain Node-builtin-free.

### Patch Changes

- @gertsai/session@2.0.0
- @gertsai/entity@1.1.1
- @gertsai/entity-audit@0.1.1

## 2.0.0

### Patch Changes

- Updated dependencies [80ca808]
- Updated dependencies [f662fa5]
  - @gertsai/entity@1.1.0
  - @gertsai/di@0.3.0
  - @gertsai/storage-core@2.0.0

## 1.0.0

### Minor Changes

- d295ee8: Sprint 3.5 W-4B-2: initial release. abstract `BaseEntityStorageService<Meta, UpdateActionTypes>` wraps `IStorageProvider` from `@gertsai/storage-core` with session-aware audit-stamped CRUD + soft-delete + restore. EventEmitter integration (`STORAGE_EVENTS` const-object: ENTITY_CREATED/UPDATED/DELETED/RESTORED/DESTROYED). Implements `IDestroyable` from `@gertsai/di`.

  Ships `InMemoryStorageProvider<Meta>` test fixture: Map-backed store supporting full listeners, batch atomicity (clone-on-throw), transaction conflict detection (per-doc version counter → `TransactionConflictError`).

  Per ADR-005 Decision A: backend-agnostic; consumes `@gertsai/{storage-core,entity,entity-audit,session,di}` as workspace peers; zero concrete backend SDK imports.

- 6debc97: Sprint 3.6 P2 polish batch (post-Sprint-3.5.2 audit findings).

  **BREAKING for consumers without `@gertsai/storage-core` install**: `peerDependenciesMeta.@gertsai/storage-core.optional: true` flag removed. `@gertsai/storage-core` is now strictly required as a peer dependency (was optional during Wave 4B Phase A intermediate state). Consumers without storage-core installed will see install-time error instead of runtime resolve failure. Per architecture review, this is appropriately classified as `minor` SemVer bump (changes consumer install behavior).

  Additive (non-breaking):

  - `InMemoryStorageProvider<Meta extends StorageMetadata = StorageMetadata>` default generic — call sites without explicit `<Meta>` now compile cleanly. Existing call sites with explicit generic continue to work unchanged.
  - `BaseEntityStorageService.upsert(entity & { _uid }, options?)` atomic upsert helper — branches `get → update vs set` to preserve `created_at` semantic. Returns `{ id }` for parity with `set`. Routing options (`runTransaction`, `runBatch`) propagate. 3 tests added (`__tests__/upsert.test.ts`).
  - `README.md` cleanup: removed "Wave 4B Phase A/B" intermediate-state language at lines 80, 152. Documented current canonical state per ADR-005.

### Patch Changes

- 782a3e0: Sprint 3.10 — Wave 5 P2 polish batch (additive non-breaking).

  `@gertsai/errors` (MINOR — observable behavior change for nested redaction):

  - `wrapUnknownError(x, kind?, correlationId?)` — `kind?` now applied via closed allow-list `'INTERNAL' | 'EXTERNAL'` (TS 2-arity union). `isAppError(x)` early-return preserved (no kind override on already-typed errors). Mitigates CWE-285 (error coercion for auth bypass).
  - `AppError` constructor JSDoc note re shallow `Object.freeze` (deep-freeze deferred).
  - `redactDetails()` now deep-scans recursively (max depth 5, breadth cap 1000, WeakSet anti-cycle, non-plain objects passthrough — Date/RegExp/Buffer left as-is). Mitigates CWE-209 nested info exposure + CWE-400/674 DoS via crafted payloads.
  - `errors/internal.ts` JSDoc clarification (catch-all `D` intentional; subclassing path documented).
  - README cross-references switched to absolute repo URLs (post-publish friendliness; scope expanded to all 13 Wave 5 package READMEs).

  Other Wave 5 packages (PATCH — JSDoc/comment polish, no behavior change):

  - `@gertsai/tenant-resolver`: `MOLECULER_*_HINT` message split (`NON_MOLECULER_CTX_ERROR` vs `MOLECULER_PEER_DEP_ERROR`), `PathStrategy` `...` wildcard JSDoc (trailing-only), `lookupHeader()` precedence note (exact-case-first short-circuit).
  - `@gertsai/runtime-context`: `requireAuthContextWithDataAccess` JSDoc clarified Session.dataAccessUuid getter fallback semantic.
  - `@gertsai/entity-storage`: `BaseEntityStorageService.upsert` 2-RTT cost JSDoc (cross-link KNOWN-ISSUES §10).
  - `@gertsai/entity-react`: `markRaw` `configurable: false` JSDoc (escape-hatch intentionally irreversible).
  - `@gertsai/rest-request-manager`: log `error.cause` chain on transport failure (5-level WeakSet bounded).
  - `@gertsai/async-utils`: `retry` JSDoc cross-ref to thundering herd Sprint 3.9 Amendment 1.2.7 default `'full'` jitter rationale.

  Refs ADR-010 §A + Amendment 1 §A1.2 (wrapUnknownError allow-list) + §A1.3 (redactDetails deep-scan).

- Updated dependencies [0755c6d]
- Updated dependencies [782a3e0]
- Updated dependencies [c19e12a]
- Updated dependencies [c19e12a]
- Updated dependencies [c19e12a]
- Updated dependencies [c19e12a]
- Updated dependencies [d295ee8]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
- Updated dependencies [7c3535f]
  - @gertsai/di@0.2.0
  - @gertsai/session@1.0.0
  - @gertsai/entity-audit@0.1.0
  - @gertsai/entity@1.0.0
  - @gertsai/storage-core@1.0.0

## 0.1.0

Initial scaffold (unreleased). Wave 4B per SPEC-008 W-4B-2.
