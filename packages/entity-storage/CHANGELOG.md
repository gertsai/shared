# @gertsai/entity-storage

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
