---
depth: standard
id: EVID-011
kind: evidence
last_modified_at: 2026-05-06T09:42:18.557879+00:00
last_modified_by: claude-code/2.1.129
links:
- target: SPEC-009
  relation: informs
- target: EVID-010
  relation: informs
- target: ADR-005
  relation: informs
- target: PRD-002
  relation: informs
status: active
title: Sprint 3.5.1 complete — fidelity audit fixes shipped + reference coverage triage (87 new tests, 8 W-items)
---

# EVID-011: Sprint 3.5.1 — fidelity audit fixes + reference coverage triage

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.5.1 (SPEC-009) — post-Sprint-3.5 fidelity fix sprint per audit-post-sprint-3-5 (7 reviewers, Hindsight Group 31). 6 fix W-items + 2 reference coverage scans done через AgentTeams team-lead pattern с 7 teammates ∥ + team-lead Phase B/C.

**Result**: All P0 + P1 findings closed. Test count Sprint 3.5 baseline 4352 → **4439 passed / 103 skipped** (+87 new tests). 0 regressions. All CI gates green. ADR-005 + ADR-011 invariants preserved.

**Reference coverage triage**: Orchestra scan (W-7) → 4 HIGH candidates Wave 5/6 (REST request manager, RPC proxy builder, async task queue, logger factory). gertsai_codex scan (W-8) → 6 HIGH candidates (errors, tenant-resolver, session-guard, audit-primitives, request-context lazy getters submodule). Total 10 HIGH triage candidates ready для Wave 5/6 planning.

## Measurement (full repo verify)

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean (workspace 26 packages + m9s-example + root) |
| `pnpm build` | ✅ 26 packages + m9s-example green (ESM+CJS+dts) |
| `pnpm test` | ✅ **4439 passed / 103 skipped** (Sprint 3.5 baseline 4352 + 87 new) |
| `pnpm typecheck` | ✅ all 26 + m9s-example green |
| `pnpm run lint` | ✅ All good |
| `pnpm run publint` | ✅ All good |
| `pnpm run depcruise` | ✅ 0 violations (98 modules, 192 deps cruised) |
| grep audit (firestore/firelord/firebase in core src) | ✅ 0 runtime imports (only JSDoc comment listing forbidden) |
| grep audit (prisma/drizzle/pg in pg-client/storage-provider) | ✅ 0 hits |

## Test count progression per package

| Package | Baseline | Post-3.5.1 | Δ | Source |
|---------|----------|------------|----|--------|
| storage-core | 44 | 48 | +4 | W-4 type-d (asymmetric defineStorageMetadata) |
| entity-storage | 29 | 94 | +65 | W-1 27 query filter + W-2 13 runTransaction + W-5 9 destroy/F8 + W-4 6 type-d + 10 misc |
| query-dsl | 35 | 53 | +18 | W-6 12 limitToLast/offset + W-4 4 curried + 2 type-d |
| pg-client | 35 | 35 | 0 | W-3 README only, no test changes |
| **Total Sprint 3.5.1** | — | — | **+87** | — |

## P0 fix evidence

### W-1 — F1: InMemoryStorageProvider applies query filter

`packages/entity-storage/src/applyQueryFilter.ts` NEW pure evaluator mirrors compileToSql pipeline (WHERE → ORDER BY → cursors → LIMIT). Wired в getDocs/count/_emitColl/onCollectionSnapshot initial fire.

Pre-fix: `getDocs(path, _query)` ignored query parameter → tests passing against InMemory diverged от Pg behavior. **Test fidelity restored.**

10 WhereOp tests (==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any) + 3 orderBy + 2 limit + 5 cursor + 3 combined + 4 in-suite parity = **27 new tests**.

Implementation note: cursors honored when `orderBy` precedes; degrade к no-op otherwise (strictly more capable than compileToSql, consistent с its semantic description).

### W-2 — F2: BaseEntityStorageService transactions audit-stamped

`packages/entity-storage/src/AuditedRunners.ts` NEW — `AuditedTxRunner<Meta, UpdateActionTypes>` + `AuditedBatchRunner<Meta, UpdateActionTypes>` interfaces.

`BaseEntityStorageService.runTransaction(fn)` + `runBatch(fn)` методы wrap `provider.runTransaction` / `runBatch`. Inside callback `tx.set/update/delete/restore` flow через `buildDataForSet/Update/Delete/Restore` builders с session context. Same audit semantics as service-level methods.

`tx.delete` is **soft** (uses `rawTx.update` + `buildDataForDelete`, not `rawTx.delete`).

Pre-fix: consumer reaching `provider.runTransaction(tx => ...)` directly bypassed `buildDataFor*` audit-stamping entirely. **Audit log integrity restored для transactional writes.**

13 new tests covering audit stamping, soft-delete invariants, restore reverses, tx.get reads, conflict surfaces, callback throws → rollback, destroyed-service throws.

### W-3 — Pg-client README `/storage` subpath section (P0 NO-GO closed)

`packages/pg-client/README.md` 86 → 219 LOC.

NEW Storage adapter (/storage subpath) section: intro + ADR-005/ADR-011 framing → Install (peer-optional clarification) → Schema requirement (`id text PK, data jsonb`) → Quickstart (~20 LOC) → Capabilities table (listeners=false, transactions=true с SQLSTATE 40001/40P01 mapping, batches=true) → Retry pattern для TransactionConflictError → TableMap example + identifier-validation note → Migration story (root-only users vs adopters) → Future PG LISTEN/NOTIFY note.

Plus Compatibility section.

Pre-fix: Sprint 3.5 W-4B-4 shipped PgStorageProvider but README had ZERO mention. Adapter shipped invisibly to consumers. **Discoverability restored.**

## P1 fix evidence

### W-4 — DX type fixes (4 findings)

**C-5**: `StorageEventPayload<Meta>` теперь discriminated union per event variant:
- `'entity-created'` carries `data: Meta['read']`.
- `'entity-updated'` carries `partial: Partial<Meta['write']>`.
- `'entity-deleted'` / `'entity-restored'` / `'entity-destroyed'` carry no data.

Pre-fix: typed как `Meta['read']` но runtime эмитит `Partial<Meta['write']>` для update/delete/restore. **Type lies eliminated.**

**F3**: `defineQueryConstraints<Meta>()` curried factory captures Meta once; all factories (where/orderBy/limit/limitToLast/offset/cursors) infer F from field literal alone:
```typescript
const q = defineQueryConstraints<UserMeta>();
repo.list([q.where('email', '==', 'foo'), q.orderBy('name'), q.limit(10)]);
```
Standalone factories preserved (non-breaking).

**F4**: `defineStorageMetadata<Read, Write = Read>()` asymmetric variant via single function с default. Audit-stamped storage (Read = Data & MutationMarks; Write = Data) — теперь idiomatic case.

**F5**: `SetEntityInput<Meta>` verified — `Meta['write'] & { _uid?: string }`. Type-d tests prove consumer can `set({ name, email })` без MutationMarks.

### W-5 — API completion (3 findings)

**F7**: `destroy(uid)` hard-delete method — emits `STORAGE_EVENTS.ENTITY_DESTROYED`. Provider.delete (NOT update). Idempotent при InMemory; rejects after `$destroy()`.

**F8**: per-method `{ batch?, transaction? }` opts on set/update/delete/restore. `MutationRoutingOpts<Meta, UpdateActionTypes>` type. Routing knob delegates к AuditedTxRunner/AuditedBatchRunner.

**F9**: `StorageLogger` pluggable interface в storage-core (4 methods: debug/info/warn/error). `noopStorageLogger` default. Inject via `BaseEntityStorageServiceOpts.logger`. `_logger.debug` calls на key paths; `_logger.error` на fail paths.

### W-6 — Migration tables + READMEs polish + query-dsl new factories

All 4 Sprint 3.5 READMEs (storage-core/entity-storage/query-dsl/pg-client) gain Migration-from-Orchestra mapping tables per Sprint 3.4.1 standard.

Quickstart fix: entity-storage missing `IStorageProvider` import added. Compatibility tables (Node 22 LTS, peer deps). Troubleshooting/FAQ sections (3+ entries each). License footers `[Apache-2.0](./LICENSE)` link form per first-wave consistency.

query-dsl factories: NEW `limitToLast(n)` + `offset(n)` factories с tests + sql compile + AND-only limitation note. Factory count "seven" → "nine". `defineQueryConstraints` curried form documented в README (recommended).

`limitToLast` throws `Error('limitToLast is not supported by the reference Postgres compiler — reverse the leading orderBy direction and use limit(n) instead')` — explicit fail loud rather than silent no-op.

`offset` → `OFFSET $N` parameterised в SQL output.

## Reference coverage triage (W-7 + W-8)

### Orchestra scan (W-7) — 4 HIGH candidates

| Candidate | Path | Effort | Recommended Wave |
|-----------|------|--------|------------------|
| REST Request Manager | `dev/rest/src/lib/{REST,SequentialHandler,BurstHandler,RateLimitError}` | M | Wave 6 |
| API RPC Proxy Builder | `orchlab/api-rpc/src/proxy/{createPathBuilder,createVersionProxy}` | L | Wave 5 |
| Async Task Queue | `orchlab/utils/src/async/{deferredPromise,promiseTimeout}` | L | Wave 5 (foundation) |
| Logger Factory | `orchlab/utils/src/logger/{createLogger,setLogLevels}` | L | Wave 5 |

Plus 1 ENHANCE: `@gertsai/di` lifecycle helpers review против orchlab/di Sprint 3.4 W-4A-4.

### gertsai_codex scan (W-8) — 6 HIGH candidates

| Candidate | Path | Effort | Recommended Wave |
|-----------|------|--------|------------------|
| `@gertsai/errors` | `packages/core/src/errors.ts` (ErrorKind enum + 10 error classes + HTTP↔gRPC mapping) | L | Sprint 3.6 |
| `@gertsai/tenant-resolver` | `apps/pipeline/src/middlewares/tenant.middleware.ts` | M | Sprint 3.6 |
| `@gertsai/session-guard` | `apps/pipeline/src/lib/session-helpers.ts` (4 errors + 19 helpers) | L | Sprint 3.7 |
| `@gertsai/audit-primitives` | `apps/pipeline/src/lib/audit-logger.ts` | L | Sprint 3.7 |
| `@gertsai/request-context` (lazy getters) | `apps/pipeline/src/lib/request-context.ts:220-350` | M | Sprint 3.7 |
| Plus error guard funcs + getUserMessage | `packages/core/src/errors.ts:542-600` + `packages/guardrails/src/errors.ts:60-120` | L | Subsume в @gertsai/errors |

**Wave 5/6 priority shortlist (combined Orchestra + codex)**:
1. `@gertsai/errors` (codex C-H-1 + C-H-5) — Tier 1, HIGH OSS value, L effort.
2. `@gertsai/tenant-resolver` (codex C-H-3) — Tier 1, HIGH OSS value, M effort.
3. `@gertsai/rpc-proxy-builder` (Orchestra C-H-2) — Tier 1, low effort, polished.
4. `@gertsai/logger-factory` (Orchestra C-H-4) — Tier 1, low effort.
5. `@gertsai/session-guard` (codex C-H-2) — Tier 2, MEDIUM-HIGH value.

(Wave 5 plan from Group 27 — entity-vue/-react/-svelte/-solid + session scoping + runtime-context — остаётся как было; reference coverage findings extend roadmap для Wave 6.)

## ADR-005 invariants verified (post-Sprint 3.5.1)

| Invariant | Status | Evidence |
|-----------|--------|----------|
| I-1: storage-core no concrete-backend SDK | ✅ | grep 0 firestore/firelord/firebase imports |
| I-2: entity no UI-framework runtime | ✅ | (no UI runtime в storage layer) |
| I-3: pg-client 3-method core unchanged | ✅ | git diff src/index.ts shows zero changes |
| I-4: listener methods optional via capabilities | ✅ | PgStorageProvider capabilities.listeners = false |
| I-5: SPDX + Orchestra attribution headers | ✅ | all NEW .ts files start с SPDX header |
| I-6: per-package strategy markers (F/A) | ✅ | SPEC-009 declares F+ для all fixes |
| I-7: tests use InMemoryStorageProvider | ✅ | InMemoryStorageProvider теперь fully functional |

## Decisions made during Sprint 3.5.1

- **W-1 cursor semantics**: extracted impl honors cursors when orderBy precedes; degrades к no-op otherwise. Strictly more capable than compileToSql, consistent с its semantic description (callers can fall back к client-side slicing). No fidelity break.
- **W-2 tx.delete soft-only**: AuditedTxRunner.delete is soft (rawTx.update + buildDataForDelete), not hard. F8 destroy({ batch }) / destroy({ transaction }) throws explanatory error. Documented в JSDoc + caught by dedicated test. Hard-delete inside tx — follow-up wave если real requirement.
- **W-2 delete({action}) override**: tx.delete с opts.action keeps `deleted_*` + `status='deleted'` + overrides `update_action.type` from 'delete' к caller value. Documented; useful flexibility per team-lead approval.
- **W-4 defineStorageMetadata signature**: single function с `Write = Read` default chosen over overload (idiomatic, no overload needed).
- **W-5 limitToLast in compileToSql**: throws explanatory error (not silent no-op) — fail loud rather than silently incorrect output. Doc message tells consumer pattern: reverse orderBy direction + limit.
- **W-6 query-dsl ANDmonly status documented**: README "Limitations" section explicitly notes AND-only composition; OR/NOT not v0.1; consumers compose multiple queries client-side.

## Pattern observations

- **AgentTeams team-lead pattern scales к 7+ teammates** (5 fix workers + 2 reference coverage explorers). All workers parallel; total wall-clock ~12-15 minutes для most workers, full sprint Phase A ~25 min, Phase B/C ~15 min team-lead solo.
- **Race-condition diagnostics during parallel work**: TS server emits transient errors when worker A imports symbol from worker B's mid-edit. Resolves когда both workers ship full scope. Real builds (Phase B) clean.
- **Worker self-coordination**: dx-fix-worker (W-4) detected api-completion-worker (W-5) added entity-destroyed variant и updated own JSDoc + exhaustive switch test без team-lead intervention. Pattern: read teammate code via filesystem (since they ship to repo) instead of message-based coordination.
- **Convergent findings drive sprint scope correctly**: 11 P0/P1/P2 findings from Group 31 audit consolidated в 6 W-items с clean ownership boundaries. No rework. No deferred items vs Sprint 3.4.1 (where some items required revisits).

## Verdict rationale

`supports` SPEC-009 + EVID-010 (corrects gaps) + ADR-005 + PRD-002:
- All 8 W-items DONE.
- Zero test regressions (4439 = Sprint 3.5 baseline 4352 + 87 new).
- All CI gates green.
- All ADR-005 invariants preserved.
- ADR-011 invariants preserved (pg-client root unchanged).
- Reference coverage triage complete; 10 HIGH candidates documented для Wave 5/6 planning.

`congruence_level: 3` (CL3): full repo measurements, real tests, real CI gates.

`evidence_type: measurement`.

## Decisions driven by this evidence

1. **Wave 4 production-grade complete** (Sprint 3.4 + 3.4.1 + 3.5 + 3.5.1).
2. **v0.2.0 publish technically unblocked** — все P0/P1 closed; user explicit Y required.
3. **Wave 5/6 roadmap expanded** — original plan (entity adapters + session scoping + runtime-context) + 10 new candidates from reference coverage:
   - Sprint 3.6: @gertsai/errors + @gertsai/tenant-resolver (low effort, high OSS value)
   - Sprint 3.7 base plan unchanged + @gertsai/session-guard / @gertsai/audit-primitives
   - Sprint 3.8: 4 framework adapters
   - Sprint 3.9 (NEW): @gertsai/rpc-proxy-builder + @gertsai/logger-factory + @gertsai/async-utils (Orchestra HIGH candidates)
4. **Audit pattern (Pre-Build + Post-Build fidelity)** — three sprints validated (3.0/3.0.1, 3.4/3.4.1, 3.5/3.5.1). Canonical для multi-package extraction sprints going forward.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-009 (Sprint 3.5.1 fix sprint + reference coverage) | Spec | informs (full implementation evidence) |
| EVID-010 (Sprint 3.5 complete) | Evidence | informs (gaps documented in audit; corrected here) |
| SPEC-008 (Sprint 3.5 — Wave 4B) | Spec | informs (foundation extended) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (invariants verified) |
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | informs (Wave 4 production-grade complete) |
| audit-post-sprint-3-5 (7 reviewers, Group 31) | external | drives all W-1..W-6 |
| Hindsight Group 31 | external | full audit context |
| Orchestra orchdev/orchlab/web/api (W-7 scan) | external | reference coverage triage source |
| gertsai_codex (W-8 scan) | external | reference coverage triage source |

> **Next step**: Activate EVID-011 → optional v0.2.0 publish gate (user explicit Y) → Wave 5/6 planning expansion (PRD-003 + ADR-006).





