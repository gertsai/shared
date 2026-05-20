# @gertsai/entity-audit

## 0.2.0

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

## 0.1.1

### Patch Changes

- @gertsai/session@2.0.0

## 0.1.0

### Minor Changes

- c19e12a: Initial release of `@gertsai/entity-audit` — audit trail types (MutationMarks, UpdateAction, UpdateActionMap module-augmentable) + pure builder functions (buildDataForSet/Update/Delete/Restore) with session-aware mutation marks. Generic Timestamp interface (replaces Firelord ServerTimestamp) + injectable TimestampProvider. Mirrors Orchestra orchlab/core meta patterns 1:1 per ADR-005. Per PRD-002 FR-W4-007..009.

### Patch Changes

- 121cb7b: Sprint 3.7 E+ refactor (per ADR-007 Amendment 1.1.4): re-export Timestamp / TimestampProvider / timestampToMillis / timestampFromDate / dateTimestampProvider from new `@gertsai/audit-primitives` package.

  **Strictly additive backward-compat** — entity-audit's existing exports preserved:

  - `Timestamp` interface unchanged shape; canonical home moved upstream to audit-primitives, re-exported here.
  - `TimestampProvider` type unchanged signature; canonical home moved upstream, re-exported here.
  - `timestampToMillis` and `timestampFromDate` re-exported from audit-primitives (own implementations removed; same behavior).
  - `defaultTimestampProvider` retained as deprecated alias (`@deprecated`) for `dateTimestampProvider` from audit-primitives.

  Consumers MAY migrate to direct `@gertsai/audit-primitives` import for Timestamp utilities; entity-audit continues as the Entity-augmented audit layer (session-bound `MutationMarks` + `buildDataFor*` builders).

  New dependency: `@gertsai/audit-primitives: workspace:^`.

- Updated dependencies [782a3e0]
- Updated dependencies [c19e12a]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
  - @gertsai/session@1.0.0
  - @gertsai/audit-primitives@0.2.0

## 0.0.0

Initial scaffold (unreleased).
