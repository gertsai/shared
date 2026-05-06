---
depth: standard
id: EVID-010
kind: evidence
last_modified_at: 2026-05-06T08:54:09.535418+00:00
last_modified_by: claude-code/2.1.129
links:
- target: SPEC-008
  relation: informs
- target: ADR-005
  relation: informs
- target: PRD-002
  relation: informs
- target: EVID-009
  relation: informs
status: active
title: Sprint 3.5 complete — Wave 4B storage layer + pg-client adapter shipped (3 packages + additive adapter, 23 → 26)
---

# EVID-010: Sprint 3.5 complete — Wave 4B storage layer shipped

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.5 (SPEC-008) — Wave 4B storage layer extraction shipped per PRD-002 + ADR-005 Decision A. 3 NEW Tier 2-3 packages (`@gertsai/storage-core`, `@gertsai/entity-storage`, `@gertsai/query-dsl`) + additive `PgStorageProvider` adapter в `@gertsai/pg-client` через `./storage` subpath. Существующий 3-method PgClient interface unchanged (preserves ADR-011 invariants I-1, I-2, I-3 + ADR-005 I-3). Monorepo grew **23 → 26 packages**.

**Branch**: `feat/api-core-decomposition` (Sprint 2 + 3.0 + 3.1 + 3.0.1 + scope redesign + 3.2 + Wave 4 plan + Sprint 3.4 + Sprint 3.4.1 + Sprint 3.5 combined; **27 commits ahead of `main`**).

## Measurement (full repo verify)

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean (workspace 26 packages + m9s-example + root) |
| `pnpm build` | ✅ 26 packages + m9s-example green (ESM+CJS+dts) |
| `pnpm test` | ✅ **4352 passed / 103 skipped** (Sprint 3.4.1 baseline 4220 + 132 new Wave 4B) |
| `pnpm typecheck` | ✅ all 26 + m9s-example green |
| `pnpm run lint` | ✅ All good |
| `pnpm run publint` | ✅ All good |
| `pnpm run depcruise` | ✅ 0 violations (98 modules, 192 deps cruised) |
| Per-package `pnpm pack --dry-run` × 3 new + pg-client | ✅ 0 leak |
| grep audit (firestore/firelord/firebase/firebase-admin in core src) | ✅ 0 runtime imports |
| grep audit (prisma/drizzle-orm/pg in pg-client/storage-provider) | ✅ 0 imports |

## Implementation evidence per task

### W-4B-1 — `@gertsai/storage-core` (Tier 2, F fresh, 44 tests, d295ee8)

`packages/storage-core/` — backend-agnostic storage interface foundation.

Public API:
- `IStorageProvider<Meta>` — CRUD (set/getDoc/getDocs/count/update/delete) + optional listeners (onDocumentSnapshot/onCollectionSnapshot) + capabilities flag + runner-pattern (runBatch/runTransaction).
- `StorageMetadata<Read, Write, Indexed>` generic interface — pure TypeScript, replaces Firelord MetaType.
- `StorageCapabilities { listeners, transactions, batches }` — adapter advertises support.
- `IBatchRunner<Meta>` / `ITransactionRunner<Meta>` — runner pattern, не magic globals.
- `ListenersNotSupportedError` / `TransactionConflictError` — errors с specific shape для retry/skip handling.
- `storageProviderIdentifier` — DI token via `@gertsai/di`.
- `defineStorageMetadata` helper — convenient declarative API.

44 tests cover types (test-d typing), errors, identifier, capabilities flag.

### W-4B-2 — `@gertsai/entity-storage` (Tier 3, F fresh, 29 tests, d295ee8)

`packages/entity-storage/` — repository pattern + in-memory test fixture.

Public API:
- abstract `BaseEntityStorageService<Meta, UpdateActionTypes>` extends EventEmitter — wraps `IStorageProvider`. Session-aware audit-stamped CRUD: `set`/`update(uid, partial, opts?)` (с optional `action` для UpdateAction stamping)/`delete`/`restore`/`get`/`list`/`count`. Listener wrappers (`onDocument`/`onCollection`) если provider supports. `$destroy()` для lifecycle. `STORAGE_EVENTS` const (set, update, delete, restore, error).
- `InMemoryStorageProvider<Meta>` — Map-backed full IStorageProvider implementation. capabilities { listeners: true, transactions: true, batches: true } — все listeners + batches + transactions работают, ideal для unit tests + sample applications.

29 tests cover service-level CRUD + soft-delete + restore + EventEmitter + listener wrappers + InMemoryStorageProvider conformance.

Deps: storage-core, entity, entity-audit, session, di — формирует full Wave 4 stack.

### W-4B-3 — `@gertsai/query-dsl` (Tier 2, F fresh, 35 tests, d295ee8)

`packages/query-dsl/` — type-safe query builder constraints.

Public API:
- `Query<Meta> = ReadonlyArray<QueryConstraint<Meta>>` — query as array of constraints.
- `WhereConstraint<Meta, Field>`, `OrderByConstraint<Meta, Field>`, `LimitConstraint<Meta>`, `StartAt/StartAfter/EndAt/EndBefore` constraints.
- Constraint factories (compile-validated против `Meta['indexed']`):
  - `whereField(field, op, value)` — op: `'==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any'`.
  - `orderBy(field, dir?)`, `limit(n)`, `startAt`/`startAfter`/`endAt`/`endBefore`.
- `validateQuery(query)` — runtime sanity check.
- `compileToSql(query, table)` — reference Postgres SQL compiler at `./sql` subpath; returns `{ sql, params }` для PgClient.

35 tests: 20 constraint tests + 6 validate tests + 7 sql compile tests + 2 type-d tests.

Subpaths: root + `./sql`. typesVersions added per Sprint 3.0.1 F-4 pattern.

### W-4B-4 — `@gertsai/pg-client` adapter additive (Tier 1, A, +24 tests, d295ee8)

NEW file `packages/pg-client/src/storage-provider.ts`. Existing `src/index.ts` unchanged (preserves ADR-011 I-1/I-2 + ADR-005 I-3).

Public API:
- `PgStorageProvider<Meta>` implements `IStorageProvider<Meta>` via raw SQL through `compileToSql` (from `@gertsai/query-dsl/sql`). Constructor `new PgStorageProvider({ client: PgClient, tableMap?: TableMap })`.
- `capabilities { listeners: false, transactions: true, batches: true }` — listeners explicitly unsupported (PG LISTEN/NOTIFY future enhancement, throws `ListenersNotSupportedError` if called).
- `PgBatchRunner` + `PgTransactionRunner` — Postgres транзакции через `BEGIN/COMMIT/ROLLBACK`. SQLSTATE `40001` (serialization failure) и `40P01` (deadlock) mapped → `TransactionConflictError`.
- `TableMap` — path → table name resolution; default identity (path == table name).

NEW peer-deps `@gertsai/storage-core`, `@gertsai/query-dsl` (workspace:^, peerDependenciesMeta optional).

NEW `./storage` subpath export + typesVersions per Sprint 3.0.1 F-4 pattern.

24 tests: PgStorageProvider CRUD against mockPgClient + capabilities verification + runner pattern + listener throws + SQLSTATE conflict mapping.

**Critical invariant audit**: 0 references на `@prisma`, `drizzle-orm`, или `pg` package в `storage-provider.ts` — adapter использует ТОЛЬКО raw SQL templates через `compileToSql`. Preserves ADR-011 I-3 (no ORM/driver dependency).

### W-4B-5 — CLAUDE.md tier table update (23 → 26)

- Project description: 23 → 26 packages.
- Tier 1: pg-client annotated с дополнительной (Sprint 3.5 W-4B-4 A additive ./storage adapter).
- Tier 2: + `@gertsai/storage-core` (F fresh).
- Tier 2: + `@gertsai/query-dsl` (F fresh).
- Tier 3: + `@gertsai/entity-storage` (F fresh).
- Strategy markers legend already extended per ADR-005 (E + A markers).

### W-4B-6 — Phase B integration verify (this evidence section "Measurement")

All gates green. Per-package pack dry-run для 3 new + pg-client confirms 0 source/test/.env/tsconfig leak (только dist + README + LICENSE + CHANGELOG).

### W-4B-7 — Phase C evidence + activation (this commit)

2 atomic commits:
```
<this>   docs(forgeplan): Sprint 3.5 Phase C — EVID-010 active
d295ee8 feat(monorepo): Sprint 3.5 — Wave 4B storage layer + pg-client adapter (W-4B-1..W-4B-5)
```

4 changeset entries:
- `@gertsai/storage-core`, `@gertsai/entity-storage`, `@gertsai/query-dsl` — minor (initial 0.0.0 → 0.1.0).
- `@gertsai/pg-client` — minor (0.1.0 → 0.2.0; additive adapter, no breaking).

## ADR-005 invariants verified (post-Sprint 3.5)

| Invariant | Status | Evidence |
|-----------|--------|----------|
| I-1: storage-core MUST NOT import concrete-backend SDK | ✅ | grep 0 firestore/firelord/firebase imports |
| I-2: entity MUST NOT have hard UI-framework runtime dependency | ✅ | (no UI runtime needed в storage layer) |
| I-3: pg-client 3-method core interface unchanged | ✅ | git diff src/index.ts shows зеро changes |
| I-4: listener methods optional in adapters via capabilities flag | ✅ | PgStorageProvider capabilities.listeners = false |
| I-5: SPDX + Orchestra attribution headers | ✅ | all NEW .ts files start с SPDX header |
| I-6: per-package strategy markers (F/A) appear в SPEC | ✅ | SPEC-008 declares F/A per package |
| I-7: tests use InMemoryStorageProvider, not real backend | ✅ | InMemoryStorageProvider test fixture used |

## Decisions made during Sprint 3.5

- **storage-core-worker chose `capabilities` flag pattern** — enables adapters to advertise listener support без forcing all backends в LISTEN/NOTIFY/CDC implementations. SQL adapters (PG, MySQL) могут throws ListenersNotSupportedError or эмулировать через polling если consumer requests.
- **InMemoryStorageProvider supports full listeners + transactions + batches** — ideal для unit tests, ensures repository code тестируется against same interface as production adapters.
- **PgStorageProvider listeners=false** — explicit choice. PG LISTEN/NOTIFY enhancement deferred to Sprint 3.x; consumers pollу или используют WebSocket/SSE для real-time.
- **SQLSTATE mapping для conflicts** — `40001` (serialization) + `40P01` (deadlock) → TransactionConflictError. Consumers retry с exponential backoff (pattern документирован в README).
- **Path → table-name** — default identity, TableMap override для consumers с разными conventions.

## Sample reference (Wave 4 deliverable)

```typescript
// Repository: write once
class UserRepository extends BaseEntityStorageService<UserMeta> {
  // implementation backend-agnostic
}

// Production: PostgreSQL via pg-client adapter
const pgRepo = new UserRepository({
  provider: new PgStorageProvider({ client: pgClient }),
  session,
});

// Tests: in-memory
const memoryRepo = new UserRepository({
  provider: new InMemoryStorageProvider(),
  session,
});

// Same test suite passes for both — Wave 4 vision realized.
```

## Commits на feature branch (Sprint 3.5)

```
<this>   docs(forgeplan): Sprint 3.5 Phase C — EVID-010 active
d295ee8 feat(monorepo): Sprint 3.5 — Wave 4B storage layer + pg-client adapter (W-4B-1..W-4B-5)
c67cc69 docs(forgeplan): Sprint 3.4.1 evidence — EVID-009 active
c4b1182 fix(monorepo): Sprint 3.4.1 — fidelity audit fixes
f706135 docs(forgeplan): Sprint 3.4 Phase C — EVID-008 + SPEC-007 active
f200fd2 chore(monorepo): Sprint 3.4 Phase B — CLAUDE.md tier table 19 → 23
c19e12a feat(monorepo): Sprint 3.4 Phase A — Wave 4A entity/session/audit + di enhancement
```

## AgentTeams pattern (Sprint 3.5)

- Phase A pre-staged по cycle (storage-core + entity-storage + query-dsl) — было готово в working tree от earlier session.
- Phase B (pg-client adapter additive) + integration verify + CLAUDE.md update — team-lead solo.
- Phase C — team-lead evidence + activation.

Pattern proven: Wave 4 split на 4A (abstractions) + 4B (storage layer) — clean phased delivery; Sprint 3.4.1 fidelity fix sprint между ними обеспечивает production-grade foundation для Sprint 3.5.

## Verdict rationale

`supports` SPEC-008 + ADR-005 + PRD-002 + EVID-008 + EVID-009:
- All W-4B-* acceptance met.
- Zero test regressions (4352 = Sprint 3.4.1 baseline 4220 + 132 new).
- All CI gates green.
- All ADR-005 invariants preserved.
- Sample reference (BaseEntityStorageService swappable между PgStorageProvider ↔ InMemoryStorageProvider) — Wave 4 vision realized.
- ADR-011 invariants на @gertsai/pg-client (I-1, I-2, I-3) preserved — additive adapter only, existing 3-method interface unchanged.

`congruence_level: 3` (CL3): full repo measurements, real tests, real CI gates, all 26 + m9s-example.

`evidence_type: measurement`.

## Decisions driven by this evidence

- Wave 4 complete (Wave 4A + Wave 4B + Sprint 3.4.1 fidelity fixes).
- v0.2.0 publish technically unblocked: 26 packages production-grade.
- Wave 5 plan (PRD-003 + ADR-006 + Sprints 3.6/3.7/3.8 — entity-vue/-react/-svelte/-solid + session scoping + runtime-context) ready для drafting after publish.
- Pre-Build (Group 21) + Post-Build fidelity audit (Group 28) pattern теперь canonical для multi-package extraction.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-008 (Sprint 3.5 — Wave 4B checklist) | Spec | informs (full implementation evidence) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (Decision A: abstract IStorageProvider; Decision B: extraction policy applied) |
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | informs (Wave 4B FR-W4-012..020 fulfilled) |
| ADR-004 (Foundation libs naming) | ADR | informs (per-package P/F/S/E/A markers extended) |
| EVID-008 (Sprint 3.4 complete) | Evidence | informs (Wave 4A baseline) |
| EVID-009 (Sprint 3.4.1 complete) | Evidence | informs (fidelity fixes consolidated foundation) |
| ADR-011 (api-rlr / pg-client agnostic invariants) | external (Hub) | informs (I-1, I-2, I-3 preserved by additive adapter) |
| Orchestra orchlab/storage | external | informs (extraction reference, contributor consent confirmed) |

> **Next step**: Activate EVID-010 → optional v0.2.0 publish gate (user explicit Y) → Wave 5 planning (PRD-003 + ADR-006).







