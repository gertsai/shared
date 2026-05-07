---
depth: standard
id: RFC-002
kind: rfc
last_modified_at: 2026-05-07T12:58:37.370326+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-004
  relation: based_on
- target: ADR-011
  relation: refines
status: active
title: Sprint 3.11 — cross-package coordination strategy for production-grade m9s-example
---

# RFC-002: Sprint 3.11 — cross-package coordination strategy for production-grade m9s-example

## Summary

This RFC documents the **cross-package coordination strategy** for Sprint 3.11. PRD-004 captures business goals; ADR-011 captures architectural decisions; SPEC-016 captures W-items. **RFC-002 captures HOW packages interact**: which `@gertsai/*` packages m9s-example consumes for each subsystem, what the consumption shape looks like, and how to verify cross-package contracts hold under real-infra conditions without modifying the packages themselves (per ADR-011 I-2).

## Motivation

Sprint 3.11 ships m9s-example wired to real backends. m9s-example is a CONSUMER of Wave 5 packages — it does NOT modify them. This is non-trivial because:

1. **Wave 5 packages have abstract contracts** (`IStorageProvider`, `IPermissionGate`, `IDocumentRepository`, etc.). Sprint 3.11 wires concrete implementations against these contracts.
2. **Some integrations span multiple packages** — e.g. real authorization touches `@gertsai/auth-openfga` (gate factory), `@gertsai/runtime-context` (gate plugged into middleware chain), `@gertsai/session` (operator identity passed to gate), `@gertsai/errors` (error mapping at gate boundary).
3. **Contract assumptions live in package READMEs** — Sprint 3.11 must validate every assumption holds in m9s-example's consumption pattern.

This RFC enumerates each cross-package edge in m9s-example post-Sprint-3.11, the contracts it relies on, and the verification approach (test or attestation).

## Proposed Direction (Architecture)

**Strategy**: m9s-example consumes Wave 5 packages exclusively at **composition root** (`composition/infrastructure.ts` + `composition/wave5-middlewares.ts`). All env-driven backend selection lives in composition root. Domain + application layers stay package-agnostic, depend only on port interfaces (`IDocumentRepository`, `IPermissionGate`, `IChunkStore`, `IEmbedder`).

**Concrete approach per Edge** (see §Detailed Design below for each):

- **Edge 1 (Postgres+pgvector)** — composition wires `PgStorageProvider` + raw `PgClient` for vector queries. m9s-example owns its own pg-vector infrastructure file (vector queries are pgvector-specific, outside `@gertsai/pg-client/storage` IStorageProvider abstraction).
- **Edge 2 (OpenFGA)** — m9s-example instantiates `@gertsai/auth-openfga` factory with `OPENFGA_API_URL`+`OPENFGA_STORE_ID` env config. Pre-Build verification confirms factory shape exists in package (currently peer-dep but unused; assumption to validate).
- **Edge 3 (RequestContext middleware)** — UNCHANGED from Sprint 3.10. Sprint 3.11 reuses the existing wiring; only consumers (gate, repository) change.
- **Edge 4 (Redis cache driver)** — composition swaps `MemoryCacheDriver` for `RedisCacheDriver` based on `REDIS_URL` presence.
- **Edge 5 (BullMQ + channels + workflows)** — UNCHANGED gating in `services/index.ts` + `moleculer.config.ts`. Sprint 3.11 only flips `REDIS_URL` default.
- **Edge 6 (Error taxonomy)** — UNCHANGED from Sprint 3.10 Addendum 2. Action handlers map session-guard errors to APIError; OpenFGA gate raises same session-guard error types.
- **Edge 7 (Migration runner)** — TBD per Decision E ADI. Initial preference E1 (raw SQL + custom runner using `@gertsai/pg-client` directly).
- **Edge 8 (oxlint)** — workspace-level addition, no `@gertsai/*` consumption.
- **Edge 9 (docker-compose)** — orchestration-only, no `@gertsai/*` consumption.

**Architectural invariants enforced by this strategy**:
- Composition root is the ONLY place env-driven backend selection happens (no scattered `if (env.STORAGE_PROVIDER === 'postgres')` in domain/application).
- Domain + application layers don't import `@gertsai/*` infrastructure packages directly — only port interfaces from `domain/ports/*`.
- Wave 5 packages frozen — m9s-example fits their existing contracts, doesn't extend.

## Detailed Design

### Edge 1 — m9s-example → `@gertsai/pg-client/storage`

**Contract**: `PgStorageProvider implements IStorageProvider<Meta>` per ADR-005. Supports `capabilities: { listeners: false, transactions: true, batches: true }`.

**Consumption shape in m9s**:
- `infrastructure/pg-document.repository.ts` constructs `PgStorageProvider` with `PgClient` (3-method agnostic interface).
- `infrastructure/pg-vector.store.ts` issues raw SQL via `PgClient.query` for vector ops (pgvector cosine `<=>` operator). pgvector queries are NOT covered by `IStorageProvider` abstraction — uses pg-client directly per ADR-011 (storage-core `query-dsl` doesn't compile vector ops).
- Both wired into `composition/infrastructure.ts` env-driven branch (`STORAGE_PROVIDER=postgres`).

**Verified by**: W-3-11-8 pg-vector.test.ts — ingest persists, search returns via cosine sim, cross-tenant query filter correctness.

**No package changes required** — `@gertsai/pg-client` capability already shipped Sprint 3.5 W-4B-4.

### Edge 2 — m9s-example → `@gertsai/auth-openfga`

**Contract**: `@gertsai/auth-openfga` exports a `PermissionGate` factory accepting `{ apiUrl, storeId }` config + returning an `IPermissionGate` impl.

**Consumption shape in m9s**:
- `infrastructure/openfga-permission.gate.ts` instantiates the factory + implements `can(operatorUuid, action, resourceId): Promise<boolean>` by issuing `check` RPC to OpenFGA HTTP API.
- Wired into `composition/infrastructure.ts` env-driven branch (`AUTH_GATE=openfga`).
- Permission gate plugs into existing gate consumption sites in use cases (`IngestDocumentUseCase`, `SearchDocumentsUseCase`) — Sprint 3.10 already passes session through; gate selection is composition-only.

**Pre-Build verification needed**: confirm `@gertsai/auth-openfga` actually exports the expected factory shape. The package has been a peer-dep on m9s-example since the example shipped but never used. **Pre-Build audit task**: openfga-worker reads `@gertsai/auth-openfga` source + README before designing wiring; if package surface is incomplete, **escalate** (separate ADR for `@gertsai/auth-openfga` API completion — outside Sprint 3.11 scope per ADR-011 I-2).

**Verified by**: W-3-11-15 openfga.test.ts — cross-tenant DENY at gate, default-deny on errors.

### Edge 3 — m9s-example → `@gertsai/runtime-context` (middleware chain)

**Contract**: `sessionMiddleware({ resolver, sessionFactory })` from `@gertsai/runtime-context/moleculer`. Composes RequestContext per request, attaches to `ctx.locals.requestContext`, auto-`$freeze()`s.

**Consumption shape in m9s**:
- `composition/wave5-middlewares.ts` already wires sessionMiddleware (Sprint 3.10) — unchanged in 3.11.
- Action handlers already read `ctx.locals.requestContext` via `tryGetRequestContextFromCtx` (Sprint 3.10 Addendum 2) — unchanged in 3.11.
- New in 3.11: `infrastructure/openfga-permission.gate.ts` consumes `session.operatorUuid` (from RequestContext) when invoked from use case. Use case → gate path: `useCase.execute({ session, ... })` → `gate.can(session.operatorUuid, action, docId)`.

**Verified by**: existing 24 tests + 8 e2e (no regression) + new W-3-11-15 openfga.test.ts (proves session.operatorUuid reaches gate).

**No package changes required**.

### Edge 4 — m9s-example → `@gertsai/m9s-cache` (Redis driver activation)

**Contract**: `@gertsai/m9s-cache` ships `MemoryCacheDriver` (in-memory Map) AND `RedisCacheDriver` (ioredis-backed). Both implement `M9sCacheDriver` interface.

**Consumption shape in m9s**:
- Existing `moleculer.config.ts` constructs `M9sCacheCacher({ driver: new MemoryCacheDriver(...) })` unconditionally.
- Sprint 3.11 modifies to env-driven swap: `if (REDIS_URL) new RedisCacheDriver({ url: REDIS_URL }) else new MemoryCacheDriver(...)`.

**Verified by**: existing tests pass under both drivers (cache invalidation tags identical). Phase B confirms.

**Pre-Build verification**: confirm `@gertsai/m9s-cache` exports `RedisCacheDriver` named import. If the export shape is different, openfga-worker (or queue-worker) flags before Build.

### Edge 5 — m9s-example → `@moleculer/channels` + `@moleculer/workflows` + `BullMQ`

**Contract**: Already imported in `moleculer.config.ts`, gated on `if (config.REDIS_URL)`. BullMQ queue config in `services/index.ts` similarly gated.

**Consumption shape in m9s**:
- Sprint 3.11 only flips `REDIS_URL` default — no source changes to gating logic.
- `services/ingest/src/queues/ingest-chunk.worker.ts` already exists with worker handler — activates when `addJob` is available (which is when REDIS_URL set).

**Verified by**: W-3-11-19 bullmq.test.ts — enqueue → dequeue → status polling round-trip.

**No package changes required**.

### Edge 6 — m9s-example → `@gertsai/errors` (error mapping at gate)

**Contract**: `@gertsai/errors` ships `AppError` taxonomy + `wrapUnknownError`. `@gertsai/session-guard` re-exports session-specific subset (Sprint 3.10 §A1.1).

**Consumption shape in m9s**:
- Action handlers already map session-guard rejections to APIError (Sprint 3.10 Addendum 2). Unchanged in 3.11.
- New in 3.11: openfga gate raises `AuthenticationRequiredError` (session missing/destroyed) or `TenantScopeViolationError` (cross-tenant denial) at the gate boundary. Both already in `@gertsai/session-guard` taxonomy. Action handler error mapping (Sprint 3.10 Addendum 2) catches both.

**Verified by**: existing Sprint 3.10 Addendum 2 broker-rejection e2e (4 tests) — patterns reused for openfga gate rejections.

**No package changes required**.

### Edge 7 — Migration runner → `@gertsai/pg-client` (raw SQL access)

**Contract** (assuming Decision E1 raw SQL post-ADI): `PgClient` 3-method interface (`query`, `transaction`, `close`).

**Consumption shape in m9s**:
- `scripts/migrate.ts` creates a `PgClient` instance, queries `pg_migrations` tracking table, applies pending forward `.sql` files, records version. Idempotent (`IF NOT EXISTS` guards in every migration per ADR-011 I-3).

**Verified by**: W-3-11-26 — migrate up twice = no-op second time.

**No package changes required** if Decision E1 chosen. If E2 (drizzle-kit) or E3 (prisma), tooling lives outside `@gertsai/*` packages.

### Edge 8 — oxlint → no `@gertsai/*` consumption

oxlint is a workspace-level tooling addition. Reads source files directly. No package consumption edge.

**Pre-Build attention**: per-package eslint configs may have rules oxlint also implements with different defaults. Workspace `.oxlintrc.json` should defer to per-package eslint (existing) on overlap; oxlint adds NEW fast checks not duplicates.

### Edge 9 — docker-compose → all services + tests

docker-compose orchestrates external services. No package consumption edge — but realistic test environment.

**Pre-Build attention**: ensure docker-compose service names match `localhost` / docker bridge networking expectations of m9s-example env vars (e.g. `POSTGRES_URL=postgres://m9s:secret@postgres:5432/m9s` inside docker network vs `localhost:5432` outside).

## Cross-Package Contract Verification (Pre-Build Workflow)

Before Build commits to any worker, team-lead executes:

1. **Read package READMEs** for each Wave 5 dep m9s-example consumes per Edge 1-8. Confirm contracts match SPEC-016 worker prompts.
2. **Verify package surfaces compile** — `pnpm --filter @gertsai/auth-openfga build` + `--filter @gertsai/m9s-cache build` etc. before workers start. Surface mismatches surface here, before Build commits.
3. **Pre-Build audit (5∥ reviewers)** validates the cross-package strategy against package source.

If any Edge surfaces a missing capability in a Wave 5 package:
- **STOP Build**.
- Document gap in Amendment 1 to ADR-011 + RFC-002.
- Open separate ADR/SPEC for the missing capability (per ADR-011 I-2 — Sprint 3.11 doesn't modify Wave 5 packages).
- **Resolution options**: revise Sprint 3.11 scope to defer the affected subsystem, OR extend Sprint to include cross-package work (re-route to Critical depth).

This pre-emption catches Sprint 3.5.2.1 / 3.7 R-2 type issues — capability assumed but missing in package.

## Implementation Phases

### Phase 0 — Pre-Build verification (team-lead, ~20 min)

- Read source / README of `@gertsai/auth-openfga`, `@gertsai/m9s-cache` (Redis driver), `@gertsai/pg-client` (raw query interface for migration runner).
- Verify all 9 Edges' contracts hold against actual package source.
- If any gap found: STOP, escalate per §Cross-Package Contract Verification.

### Phase 1 — ADI on contested decisions (team-lead, ~10 min × 2)

- `forgeplan_reason ADR-011` — surfaces hypotheses on Decisions B (OpenFGA model) + E (migration tooling).
- Synthesize → Amendment 1 to ADR-011, revise SPEC-016 W-items + RFC-002 Edge 2 / Edge 7 details.

### Phase 2 — Pre-Build audit (5∥ reviewers, ~10-15 min)

- architect / security / ddd / typescript / docs reviewers per CLAUDE.md AgentTeams pattern.
- RFC-002 §Detailed Design used as cross-package contract checklist by reviewers.

### Phase 3 — Build (4-6∥ workers, ~50-90 min wall-clock)

- Per SPEC-016 file ownership matrix.
- Each worker references its Edge in RFC-002 for consumption shape.

### Phase 4 — Phase B verify + Post-Build audit (team-lead solo + 4-6∥ reviewers, ~25-35 min)

- Mock-mode + real-infra-mode runs.
- Each Edge has a verification test in real-infra suite.

### Phase 5 — Phase D — EVID-019 + commit + Hindsight Group 44 (~10 min)

## Invariants

- **INV-1**: Wave 5 packages frozen for Sprint 3.11 (per ADR-011 I-2). RFC-002 Edges describe consumption only — no package modifications.
- **INV-2**: Composition root is the ONLY env-driven backend selection site (per §Proposed Direction). Domain + application layers stay package-agnostic.
- **INV-3**: Each Edge has a verification mechanism (test or pre-Build attestation). No "trust me bro" cross-package assumptions.
- **INV-4**: If pre-Build verification surfaces a missing package capability, Build STOPS. Sprint 3.11 doesn't ship while a Wave 5 contract is broken.

## Rollback Plan

**Triggers**:
- Pre-Build verification finds `@gertsai/auth-openfga` factory missing — Sprint 3.11 either defers Track 2 (OpenFGA) or re-routes to Critical depth with `@gertsai/auth-openfga` API completion ADR.
- Real-infra suite reveals a contract mismatch post-Build — Sprint 3.11 reverts the affected Track and ships partial.
- docker-compose orchestration broken on common Docker versions — orchestration deferred, manual setup documented in README as fallback.

**Steps**:
1. `git revert` the Sprint 3.11 commit (or partial reverts per Track if granular).
2. m9s-example returns to Sprint 3.10 Addendum 2 state.
3. Affected Tracks re-routed: separate Sprint 3.11.x or Sprint 3.12 with revised scope.

**Blast Radius**: low-medium. m9s-example only — no Wave 5 package changes per INV-1. Reverting affects only example app + docker artifacts. Wave 5 packages unaffected.

## Backward Compatibility

- Wave 5 packages **frozen** for Sprint 3.11 (ADR-011 I-2). Any consumer of these packages in other repos sees zero change.
- m9s-example mock fallbacks **preserved** (ADR-011 I-1). Pre-Wave-5 callers (24 existing tests) continue to pass without env overrides.
- New env vars (`STORAGE_PROVIDER`, `AUTH_GATE`, `OPENFGA_*`, `MIGRATIONS_AUTO_APPLY`) all default-on for production-grade mode. Mock-mode opt-out via env override (e.g. `STORAGE_PROVIDER=memory`).

## Drawbacks

- m9s-example deps surface widens (adds `pg`, OpenFGA HTTP client lib, ts-node CLI for migrations). README must clarify which deps are example-app-specific vs Wave 5 stack consumption.
- Verification footprint widens (4 real-infra test files vs current 1) — CI matrix branches grow.
- docker-compose introduces a Docker version dependency for dev workflow.

## Alternatives

**Skip RFC entirely** — ADR-011 + SPEC-016 might cover cross-package coordination implicitly. **Rejected** — explicit RFC catches package surface gaps before Build (Edge 2 OpenFGA factory shape verification is a real risk; better to call it out here than discover during Build).

**Bundle RFC into ADR-011** — combine into single artifact. **Rejected** — ADR-011 captures decisions + consequences; RFC-002 captures consumption shape per Edge. Different concerns; separation aids reviewability.

**Defer cross-package verification to Pre-Build audit only** — let security/architect reviewers catch package surface issues. **Partially adopted** — pre-Build audit DOES validate this (per §Cross-Package Contract Verification), but RFC-002 enumerates the Edges so reviewers have a checklist not a free-form audit.

## Unresolved Questions (require ADI or Pre-Build resolution)

1. **`@gertsai/auth-openfga` package surface** (Edge 2): is the `PermissionGate` factory exported and complete? Pre-Build read-source attestation needed BEFORE openfga-worker starts. (Risk surfaces if Wave 5 stack assumed but not delivered. Sprint 3.11 then re-routes.)
2. **`@gertsai/m9s-cache` Redis driver export shape** (Edge 4): named export `RedisCacheDriver` vs subpath `@gertsai/m9s-cache/redis`? Read source pre-Build.
3. **OpenFGA tuple wildcard semantics** (Edge 2 + ADR-011 Decision B): does `(tenant:tenant-acme, tenant, document:*)` work as intended in OpenFGA model.fga DSL? Or do we need conditional types? **ADI on Decision B** addresses this.

## References

- PRD-004 (Sprint 3.11 vision)
- ADR-011 (Sprint 3.11 architectural decisions + I-1..I-11 invariants)
- SPEC-016 (Sprint 3.11 W-items + file ownership matrix)
- ADR-005 (storage-core IStorageProvider — Edge 1 contract)
- ADR-007 (runtime-context middleware — Edge 3 contract)
- EVID-018 (Sprint 3.10 Addendum 2 — action wiring + error mapping pattern reuse)
- KNOWN-ISSUES (closes m9s-example mock entries)

> **Next step**: ADI on ADR-011 Decisions B + E → revise SPEC-016 W-items per ADI outcome → pre-Build audit (with RFC-002 §Cross-Package Contract Verification checklist) → Build.



