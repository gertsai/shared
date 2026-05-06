---
depth: standard
id: EVID-012
kind: evidence
last_modified_at: 2026-05-06T10:48:35.225590+00:00
last_modified_by: claude-code/2.1.131
links:
- target: SPEC-010
  relation: informs
- target: PRD-002
  relation: informs
- target: ADR-005
  relation: informs
- target: EVID-011
  relation: informs
status: active
title: Sprint 3.5.2 complete — m9s-example migrated to Wave 4 stack (DocumentRepository + audit propagation)
---

# EVID-012: Sprint 3.5.2 — m9s-example Wave 4 migration shipped

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.5.2 (SPEC-010) — m9s-example migration к canonical Wave 4 stack shipped per AgentTeams team-lead pattern с 4 teammates (T1 infra-types-worker, T4 readme-worker [Wave 1 parallel] → T2 wiring-worker, T3 audit-tests-worker [Wave 2 parallel after T1]). Single atomic commit `14fc826`.

**Result**: Wave 4 production-grade now demonstrated в reference example. Domain `Document` shape UNCHANGED (port contract preservation = key DDD insight). Wave 4 envelope (DocumentReadShape с MutationMarks) лежит entirely INSIDE `document.repository.ts` as internal type. `IDocumentStore` port → use case → use case tests все unchanged. Test count Sprint 3.5.1 baseline 4439 → **4443 passed / 103 skipped** (+4 audit-propagation tests).

## Measurement (full repo verify)

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean (workspace 26 packages + m9s-example + root) |
| `pnpm build` | ✅ 26 packages + m9s-example green (tspc + typia transformer) |
| `pnpm test` | ✅ **4443 passed / 103 skipped** (Sprint 3.5.1 baseline 4439 + 4 new) |
| `pnpm typecheck` | ✅ all 26 + m9s-example green |
| `pnpm run lint` | ✅ All good |
| `pnpm run depcruise` | ✅ 0 violations (107 modules, 209 deps cruised) |
| m9s-example tests | ✅ 16 passed / 1 skipped (12 baseline + 4 new audit-propagation) |

## Per-track outcomes

### T1 — infra-types-worker (Wave 1)

**Files modified**:
- `examples/m9s-example/package.json`: + `@gertsai/{entity-audit, entity-storage, session, storage-core}` (workspace:*).
- `examples/m9s-example/src/infrastructure/document.repository.ts` (NEW): DocumentRepository with internal Wave 4 envelope. SPDX header. `DocumentMeta` exported для composition-root explicit generic binding (added by T2 в follow-up).
- `examples/m9s-example/src/infrastructure/memory-document.store.ts` (DELETED).

**Domain `src/domain/document.ts` UNCHANGED** — port contract preservation key insight verified.

**JSDoc gotcha noted**: `(created_*/updated_*/deleted_*)` mid-comment terminates block early due к `*/` sequence. Fixed by rewording. Worth flagging для future templates.

### T4 — readme-worker (Wave 1, parallel-safe)

**Files modified**:
- `examples/m9s-example/README.md`: 405 → 499 LOC (+94). NEW "Wave 4 stack reference" section inserted at line 88, between folder-layout section и "Run" section. Includes:
  - Architecture map table (per-layer responsibilities).
  - Repository code skeleton (DocumentMeta + DocumentRepository pattern).
  - Provider wiring example (InMemory for example, Pg for prod).
  - Audit propagation explanation (creator_uuid, created_*, updated_*).
  - "What stays unchanged" note (Chunk/cosine deferred к Phase 5).
  - 5 cross-references к Wave 4 package READMEs.

### T2 — wiring-worker (Wave 2, blockedBy T1)

**Files modified**:
- `examples/m9s-example/src/composition/infrastructure.ts`: replaces `MemoryDocumentStore` import + instantiation. NEW `createSystemSession()` helper (operatorUuid 'system', no-op dialog). +30/-2 lines.
- `examples/m9s-example/src/infrastructure/document.repository.ts`: +2 LOC (added `export type { DocumentMeta };`).

**Why DocumentMeta export needed**: `InMemoryStorageProvider<Meta extends StorageMetadata>` has no default; `new InMemoryStorageProvider()` doesn't infer от DocumentRepository ctor (provider built BEFORE repository). Explicit `<DocumentMeta>` generic binding required.

**lifecycle.ts UNCHANGED** ✅ — `IngestServiceContext.docStore: IDocumentStore` accepts DocumentRepository (it implements IDocumentStore).

### T3 — audit-tests-worker (Wave 2, parallel с T2)

**Files created**:
- `examples/m9s-example/tests/audit-propagation.test.ts` (NEW): 121 LOC, 4 tests:
  1. `stamps creator_uuid from session on first save` — verifies `buildDataForSet` propagates `operatorUuid` into `creator_uuid` + complete audit triplet.
  2. `preserves created_at on re-save (upsert via update)` — verifies repository's get→update branching preserves `created_at` while refreshing `updated_*`.
  3. `emits STORAGE_EVENTS.ENTITY_CREATED with correct payload shape` — verifies discriminated union shape `{ event, path, id, data }` per Sprint 3.5.1 C-5 fix.
  4. `findById strips audit envelope to plain Document` — verifies domain layer never sees `creator_uuid`/`_uid`/`created_at`.

**Existing tests UNCHANGED + green** ✅:
- `tests/ingest-use-case.test.ts` (7) — port mocks via `vi.fn()` repository-shape-agnostic.
- `tests/search-use-case.test.ts` (5).
- `tests/e2e.test.ts` (1 skipped).

**Test breakdown**: 16 passed / 1 skipped в m9s-example (12 baseline + 4 new).

### Phase B — team-lead integration verify

All gates green. ADR-005 invariants verified post-Sprint 3.5.2:
- I-1 (storage-core no concrete-backend SDK) ✅ — m9s uses InMemory.
- I-2 (entity no UI-framework runtime) ✅.
- I-3 (pg-client unchanged) ✅.
- I-4 (listeners optional) ✅ — InMemory has `listeners: true`.
- I-5 (SPDX headers) ✅ on document.repository.ts + audit-propagation.test.ts.
- I-6 (strategy markers F+) ✅ — example app migration на existing F-strategy packages.
- I-7 (in-memory test fixtures) ✅.

## DDD insights validated

1. **Hex boundary preservation = 0-line shim на existing tests**: domain `Document` shape unchanged → `IDocumentStore` port unchanged → use case tests (which mock port via `vi.fn()`) need ZERO changes. Wave 4 plumbing fully encapsulated в infrastructure layer.

2. **Repository pattern adapter**: `class DocumentRepository extends BaseEntityStorageService<DocumentMeta> implements IDocumentStore` — двойная extension/implements. Wave 4 base provides audit-stamped CRUD; domain port provides hex-boundary contract. Conversion happens в `save()` (id → _uid) и `findById()` (strip audit envelope).

3. **Upsert semantic preservation**: `BaseEntityStorageService.set` re-stamps `created_at` каждый раз — это would break legacy `MemoryDocumentStore.byId.set` upsert semantic. `DocumentRepository.save` branches `get → update OR set` to preserve original behavior. Tests verify (Test 2 of audit-propagation suite).

4. **Internal types stay internal**: `DocumentReadShape` (с MutationMarks) is NOT exported — only `DocumentMeta` exported for composition-root generic binding. Audit envelope never reaches domain layer.

5. **System session at composition root**: m9s-example uses one Session for ALL writes (not per-request). Adequate для example demo; production deployment would scope sessions per-request via lifecycle hook (deferred к Wave 5+ per SPEC-010 out-of-scope).

## AgentTeams pattern reflections

- **Team `sprint-3-5-2` с 4 teammates (Wave 1: 2∥, Wave 2: 2∥)** + team-lead Phase B/C — clean dep graph (T1+T4 parallel; T2+T3 parallel after T1). Wall-clock ~10 min total Phase A через 4 parallel + 1-min team-lead Phase B + ~2-min Phase C.
- **JSDoc `*/` gotcha** noted by infra-types-worker — generic learning для documentation templates.
- **Worker self-coordination**: T2 added `export type { DocumentMeta }` independently when discovering generic-inference fallback needed; T3 used the export when it appeared. No team-lead intervention required.
- **Validate gate over-fit для example migration sprints** — same pattern observed Sprint 3.4.1 + 3.5.1. SPEC-010 stays valid через `## Data Models` block (Repository skeleton). Force-activation NOT needed here.

## Sprint 3.5.2 commits

```
14fc826 feat(m9s-example): Sprint 3.5.2 — migrate to Wave 4 stack (Entity envelope + Repository)
<this>  docs(forgeplan): Sprint 3.5.2 evidence — EVID-012 + SPEC-010 active
```

## Wave 4 status (post-Sprint 3.5.2)

- **7 new packages + 1 enhanced** + **m9s-example reference migrated**.
- 26 packages total, 4443 tests passed.
- All ADR-005 + ADR-011 invariants preserved.
- m9s-example now serves as "build any app" canonical reference example.
- Branch state: feat/api-core-decomposition, **30+ commits ahead of `main`**.

## Decisions driven by this evidence

- **Wave 4 fully demonstrated** в reference application. PRD-002 G-5 satisfied.
- **v0.2.0 publish** technically unblocked + теперь имеет canonical example. User explicit Y still required для push/PR/changeset publish.
- **Phase 5 follow-ups**: Chunk cosine search refactor к `@gertsai/query-dsl` (when vector ops land), Postgres adapter `PgStorageProvider` for Document, per-request Session scoping, BullMQ refactor.
- **Sprint 3.5 audit pattern fully validated** через Sprint 3.5.2 — фактически 0 P0/P1 audit findings emerged because reference example exercise каждый Wave 4 path end-to-end.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-010 (Sprint 3.5.2 — m9s-example Wave 4 migration) | Spec | informs (full implementation evidence) |
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | informs (G-5 satisfied) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (invariants verified) |
| EVID-011 (Sprint 3.5.1 complete) | Evidence | informs (baseline) |
| Plan file `/Users/explosovebit/.claude/plans/iterative-percolating-koala.md` | external | user-approved migration plan |

> **Next step**: Activate EVID-012 + SPEC-010 → optional v0.2.0 publish gate (user explicit Y) → Wave 5 planning expansion (PRD-003 + ADR-006 для @gertsai/{errors, tenant-resolver, runtime-context, entity-vue/-react/-svelte/-solid}).





