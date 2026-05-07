---
depth: standard
id: SPEC-009
kind: spec
last_modified_at: 2026-05-06T09:27:23.401929+00:00
last_modified_by: claude-code/2.1.129
links:
- target: PRD-002
  relation: based_on
- target: ADR-005
  relation: based_on
- target: SPEC-008
  relation: refines
- target: EVID-010
  relation: refines
status: draft
title: Sprint 3.5.1 — fidelity fix sprint (post-audit P0/P1) + reference coverage check (Orchestra/gertsai_codex)
---

# SPEC-009: Sprint 3.5.1 — fidelity fix sprint + reference coverage

## Summary

Post-Sprint-3.5 fix sprint per audit-post-sprint-3-5 (7 reviewers via AgentTeams team-lead pattern, Hindsight Group 31). Closes P0/P1/P2 findings + adds reference-coverage scan по 2 upstream codebases (Orchestra `orchdev/orchlab/web/api` + gertsai_codex). 6-7∥ AgentTeams workers (5 fix + 2 reference coverage) + team-lead Phase B/C.

## Scope

### Track 1: P0 Critical fixes (block production)

**W-3.5.1-1 — F1: InMemoryStorageProvider query filter** (entity-storage)
- `getDocs(path, query)` and `count(path, query)` MUST apply `query` filter (currently `_query` ignored).
- `onCollectionSnapshot` `_emitColl` MUST apply query filter в notification.
- Use `validateQuery` runtime sanity + apply WhereOp/orderBy/limit на in-memory data.
- New parity test: same query against InMemory vs `mockPgClient`-backed PgStorageProvider produces same result count + ordering.

**W-3.5.1-2 — F2: BaseEntityStorageService transactions audit-stamped** (entity-storage)
- Add `runTransaction<R>(fn: (tx: AuditedTxRunner<Meta, UpdateActionTypes>) => Promise<R>): Promise<R>`.
- Add `runBatch<R>(fn: (batch: AuditedBatchRunner<Meta, UpdateActionTypes>) => Promise<R>): Promise<R>`.
- `AuditedTxRunner.set/update/delete/restore` flow через `buildDataFor*` builders с session context. Same audit semantics as service-level methods.
- `AuditedBatchRunner` similarly wraps `IBatchRunner` с audit-stamping.
- New tests: tx writes carry MutationMarks + update_action; conflict retry round-trips audit fields.

**W-3.5.1-3 — README NO-GO: pg-client `/storage` subpath section** (pg-client)
- Add full `/storage` section в `packages/pg-client/README.md`.
- Cover: install с peer-deps, `PgStorageProvider` constructor + opts, capabilities `{ listeners: false, transactions: true, batches: true }`, schema requirement (`id text PK, data jsonb`), TableMap example, retry pattern для `TransactionConflictError`, future PG LISTEN/NOTIFY note.
- Migration story для existing pg-client root users (additive, root unchanged).

### Track 2: P1 Convergent fixes

**W-3.5.1-4 — DX type fixes** (entity-storage + storage-core)
- **C-5**: `StorageEventPayload<Meta>` data type — split per event: SET/UPDATED/RESTORED/DELETED carry full record OR Partial<Write>; document discriminated union.
- **F3**: `whereField` narrowing leak — add curried `defineQueryConstraints<Meta>()` factory bound to Meta context (returns Meta-narrowed whereField/orderBy/etc.). Document in query-dsl README.
- **F4**: `defineStorageMetadata<Read, Write>()` asymmetric variant — current `defineStorageMetadata<Read>()` forces Write=Read. Add second curried variant. Update README sample (audited storage = dominant case).
- **F5**: `SetEntityInput<Meta>` type — must be `Meta['write']` (input shape, pre-audit), not `Meta['read']`. Verify + tests.

**W-3.5.1-5 — API completion** (entity-storage)
- **F7**: `destroy(uid)` hard-delete method — emits `STORAGE_EVENTS.ENTITY_DESTROYED`. Tests.
- **F8**: per-method `batch?` / `transaction?` parameter on set/update/delete/restore — Orchestra parity. Optional opts arg overload.
- **F9**: Pluggable `StorageLogger` interface in storage-core — `{ debug, info, warn, error }`. Default no-op. Inject via `BaseEntityStorageServiceOpts.logger`. Adapter integration optional.
- Add canonical "Entity 'patched' → repository.update" bridge example to entity-storage README (F6).

**W-3.5.1-6 — Migration tables + READMEs** (cross-cutting)
- All 4 Sprint 3.5 READMEs (storage-core/entity-storage/query-dsl/pg-client) gain Migration-from-Orchestra mapping table per Sprint 3.4.1 standard.
- Quickstart fixes (entity-storage IStorageProvider import + Session shape verification).
- Compatibility tables (Node ≥22, peer-deps, browsers где applicable).
- Troubleshooting/FAQ sections (≥3 entries).
- query-dsl: add `limitToLast(n)`, `offset(n)` factories с tests + sql compile + AND-only limitation note.

### Track 3: Reference coverage check

**W-3.5.1-7 — Orchestra reference coverage scan**
- Read-only Explore: `/Users/explosovebit/Work/Orchestra/orchdev/orchestra/{orchdev,orchlab,web,api}/`.
- Goal: identify ANY reusable, abstract, backend-agnostic packages that should become future `@gertsai/*` candidates. NOT Orchestra-specific business logic (Spaces/Chats/Messages — already excluded per ADR-005).
- Output: triage list (HIGH/MEDIUM/LOW priority candidates) per package: pure utility / framework adapter / pattern. Each candidate: location, rationale, effort estimate, target wave (Wave 5 / 6 / future).
- Special focus: error handling / retry / circuit-breaker libs; DI patterns не покрытые `@gertsai/di` enhancement (Sprint 3.4 W-4A-4); cache primitives beyond `@gertsai/m9s-cache`; queue patterns beyond `@gertsai/queue`; logger / observability.
- Cap report ~1500 words. Ground every claim в file:line.

**W-3.5.1-8 — gertsai_codex reference coverage scan**
- Read-only Explore: `/Users/explosovebit/Work/GertsAi/gertsai_codex/`.
- Goal: same as W-7 — backend-agnostic OSS-friendly reusable patterns we may have missed.
- Special focus: `apps/pipeline/src/{lib,middlewares,services,utils}/` — request-context layer (Group 27 research уже identified runtime-context candidate Wave 5; verify nothing else missed); error classes; security primitives; observability hooks; locale/i18n.
- Cap report ~1500 words.

### Phase B (team-lead): Integration verify

Full repo: install/build/test/typecheck/lint/publint/depcruise/attw + per-package pack dry-run + grep audits. Tests count target: Sprint 3.5 baseline 4352 → ≥4400 (estimated +50-80 new from fix work).

### Phase C (team-lead): Evidence + activation + planning roll-up

3 atomic commits:
- `fix(monorepo): Sprint 3.5.1 — fidelity audit fixes + reference coverage`
- `docs(forgeplan): Sprint 3.5.1 evidence — EVID-011 active`
- (optional if reference coverage finds new packages) `docs(forgeplan): Wave 5+ candidate triage from W-7/W-8`

EVID-011 (verdict=supports, CL3, measurement) + activate SPEC-009 + Hindsight Group 32 retain.

## Out of scope

- Wave 5 packages (entity-vue/-react/-svelte/-solid; runtime-context; session scoping) — separate sprints.
- v0.2.0 publish — gated by user explicit Y, separate decision.
- Concrete Firestore adapter — future wave per ADR-005 admissibility.
- Major version breaking changes (e.g. parameterized identifier in @gertsai/di) — separate major bump sprint.
- m9s-example migration to Wave 4 stack — opportunistic post-audit.

## Strategy markers (per ADR-004 I-2 + ADR-005 I-6)

All Sprint 3.5.1 work strictly **F+ (Fix on existing F-strategy packages)**. No new packages в этом sprint.

## Acceptance Checklist

- [ ] **W-1** InMemoryStorageProvider query filter applied; parity test InMemory ↔ Pg passes.
- [ ] **W-2** BaseEntityStorageService.runTransaction + runBatch wrappers; audit-stamped tx tests.
- [ ] **W-3** pg-client README `/storage` subpath section complete.
- [ ] **W-4** DX type fixes (C-5 StorageEventPayload, F3 whereField narrowing, F4 asymmetric defineStorageMetadata, F5 SetEntityInput).
- [ ] **W-5** API completion (F7 destroy hard-delete, F8 per-method batch/tx params, F9 StorageLogger).
- [ ] **W-6** Migration tables + READMEs polish + query-dsl new factories.
- [ ] **W-7** Orchestra reference coverage scan complete; triage report.
- [ ] **W-8** gertsai_codex reference coverage scan complete; triage report.
- [ ] Phase B verify: 4352 baseline → ≥4400 tests passed; all CI gates green; per-pkg pack 0 leak.
- [ ] Phase C: 3 atomic commits + EVID-011 active + Hindsight Group 32 retained.

## Risks (Sprint 3.5.1)

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | runTransaction wrapper breaks existing pattern (consumers reaching provider.runTransaction directly) | Additive — both paths work; document canonical preference |
| R-2 | InMemory query filter perf regression (Map.values + filter) | Acceptable — InMemory is test fixture, prod uses adapter |
| R-3 | StorageLogger pluggable contract leaks abstraction | Minimal interface (4 methods); adapter opt-in not mandatory |
| R-4 | Migration tables expand README size noticeably | Acceptable trade-off; consumers value migration clarity |
| R-5 | Reference coverage scan finds many packages → scope creep | Strictly read-only triage; Sprint 3.5.1 NOT extracts new packages |

## Implementation Plan — sequenced для AgentTeams

Phase A (5∥ fix + 2∥ reference coverage workers parallel, total 7 workers):

| Worker | Subagent | Scope | Effort |
|--------|----------|-------|--------|
| **inmemory-fix-worker** | typescript-pro | W-1 | 3-4h |
| **transaction-wrapper-worker** | typescript-pro | W-2 | 4-5h |
| **dx-fix-worker** | typescript-pro | W-4 | 4-5h |
| **api-completion-worker** | coder | W-5 | 4-5h |
| **readme-fix-worker** | documentation-engineer | W-3 + W-6 | 5-6h |
| **orchestra-coverage-explorer** | Explore (read-only) | W-7 | parallel ~15min |
| **codex-coverage-explorer** | Explore (read-only) | W-8 | parallel ~15min |

Phase B (team-lead solo): integration verify; convergence check between workers; resolve any cross-worker conflicts (e.g. dx-fix changes Meta default, api-completion needs to know).

Phase C (team-lead solo): commits + EVID-011 + activation + Hindsight Group 32 + reference coverage roll-up to Wave 5+ planning notes.

## Affected Files (predicted)

- `packages/entity-storage/src/{InMemoryStorageProvider,BaseEntityStorageService}.ts` (W-1, W-2, W-5)
- `packages/entity-storage/src/STORAGE_EVENTS.ts` (W-5: ENTITY_DESTROYED)
- `packages/entity-storage/src/__tests__/*.ts` (parity, audit-stamped tx, hard-delete tests)
- `packages/storage-core/src/{types,index}.ts` (W-4: payload types; W-5: StorageLogger)
- `packages/query-dsl/src/{constraints,sql}.ts` + tests (W-6: limitToLast, offset)
- `packages/pg-client/README.md` (W-3)
- `packages/{storage-core,entity-storage,query-dsl,pg-client}/README.md` (W-6: Migration tables)
- `.changeset/sprint-3-5-1-*.md` (4-5 new entries)
- `.forgeplan/evidence/EVID-011-*.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-002 | PRD | based_on |
| ADR-005 | ADR | based_on |
| SPEC-008 | Spec | refines |
| EVID-010 | Evidence | refines (corrects gaps) |
| audit-post-sprint-3-5 | external | drives all W-1..W-6 |
| Hindsight Group 31 | external | full audit context preserved |
| Orchestra orchdev/orchlab/web/api | external | W-7 reference scan |
| gertsai_codex | external | W-8 reference scan |

> Next step: SPEC-009 → forgeplan_validate → activate (force) → Phase A 7∥ workers → Phase B → Phase C.





