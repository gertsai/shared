---
depth: standard
id: ADR-011
kind: adr
last_modified_at: 2026-05-07T13:03:34.469917+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-004
  relation: based_on
status: active
title: 'Sprint 3.11 — production-grade m9s-example: storage / authorization / async / lint / migration choices'
---

# ADR-011: Sprint 3.11 — production-grade m9s-example architectural decisions

## Context

PRD-004 establishes the goal: m9s-example becomes production-grade reference (real Postgres+pgvector, real OpenFGA, real BullMQ, real Redis cache, oxlint, docker-compose orchestration). This ADR captures the architectural decisions taken to achieve that goal across 5 subsystems plus cross-cutting invariants.

**Current state (post Sprint 3.10 Addendum 2)**:
- m9s-example uses `MemoryVectorStore` + `MemoryDocumentRepository` (in-process Maps).
- `AllowAllPermissionGate` (every check passes — mock).
- Synchronous fallback in `ingest-document.action.ts` (queue gated on `REDIS_URL`, default unset).
- `M9sCacheCacher` with `MemoryCacheDriver` (no Redis driver activation).
- eslint per-package, no workspace-level fast linter.
- No migration tooling.
- No docker-compose orchestration.

**Existing assets** (already in repo, just not wired in m9s):
- `@gertsai/pg-client/storage` subpath (Sprint 3.5 W-4B-4) — `PgStorageProvider implements IStorageProvider`. Drop-in adapter with `capabilities: { listeners: false, transactions: true, batches: true }`.
- `@gertsai/auth-openfga` package (peer-dep already in m9s-example/package.json — never used). OpenFGA HTTP client + permission-gate factory.
- `@moleculer/channels` + `@moleculer/workflows` already imported in `moleculer.config.ts`, gated on `if (config.REDIS_URL)`.
- `@gertsai/m9s-cache` ships Redis driver alongside MemoryCacheDriver — env-driven swap.

**External components to introduce** (new dependencies):
- `oxc-project/oxlint` — Rust-based JS/TS linter (~50× faster than eslint).
- `pgvector/pgvector` Postgres extension — `pgvector/pgvector:pg16` Docker image.
- `openfga/openfga` HTTP service — `openfga/openfga:v1.x` Docker image.
- Migration tooling — TBD per Decision E.

## Decision

### Decision A — Persistent storage via existing `@gertsai/pg-client/storage` adapter (settled)

m9s-example's `infrastructure/document.repository.ts` and vector store delegate to `PgStorageProvider` from `@gertsai/pg-client/storage`. Adapter exists since Sprint 3.5 (Wave 4B), used by other consumers, well-tested.

Postgres extension `pgvector` provides `vector(dim)` column type + cosine similarity operators (`<=>`, `<->`). Schema design:

- `documents(id uuid pk, tenant_id text, owner_uuid text, text text, metadata jsonb, created_at timestamptz, updated_at timestamptz)` — owner + tenant for OpenFGA tuple keying.
- `chunks(id uuid pk, document_id uuid fk, ordinal int, text text, vector vector(768), tenant_id text, created_at timestamptz)` — tenant denormalized for query-time tenant filter without join.
- Indexes: `documents(tenant_id, owner_uuid)`, `chunks(document_id)`, `chunks USING hnsw (vector vector_cosine_ops)` (HNSW per-record default — see R-3 below).

Existing `MemoryVectorStore` + `MemoryDocumentRepository` preserved as opt-in fallbacks (`STORAGE_PROVIDER=memory` env). Default switches to `STORAGE_PROVIDER=postgres`.

### Decision B — Authorization via `@gertsai/auth-openfga` (CONTESTED — ADI ran, see Amendment 1 §A1.4 — LOCKED to B2 Tenant-hierarchy)

Permission gate `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` (replacing `AllowAllPermissionGate`) delegates to OpenFGA HTTP API for `can(operatorUuid, action, resourceId)` checks.

Three viable approaches considered (B1 per-document, B2 tenant-hierarchy, B3 hybrid). **Decision LOCKED to B2 (Tenant-hierarchy)** post-ADI per Amendment 1 §A1.4. Rationale: storage cost O(documents + users) instead of O(documents × users); matches Wave 5 tenant-resolver architecture; 2-hop latency under 100ms NFR-1 target. B3 Hybrid upgrade path deferred to Wave 6+ if cross-tenant document shares requested.

### Decision C — Async queue default-on (settled)

`config.REDIS_URL` defaults to `redis://localhost:6379` in m9s-example/.env.example. Activates `@moleculer/channels`, `@moleculer/workflows`, BullMQ queue, RedisCacheDriver. Synchronous + memory fallbacks preserved when empty.

### Decision D — Lint: oxlint supplementary (settled)

Workspace-level `.oxlintrc.json`. Scripts: `pnpm lint:fast` (oxlint, ≤ 2s) + `pnpm lint` (eslint, ~30s). CI runs both; either failing blocks merge.

### Decision E — Migration tooling: LOCKED to E1 Raw SQL + custom runner (CONTESTED — ADI ran, see Amendment 1 §A1.4)

E1 / E2 (drizzle-kit) / E3 (Prisma) considered. **Decision LOCKED to E1** post-ADI per Amendment 1 §A1.4. Rationale: zero new package dependencies, SQL universal, ~100 LOC custom runner sufficient. E2/E3 rejected (opinionated toolchain conflicts with reference minimalism).

### Decision F — Cross-cutting: env-gated production-grade defaults

Default behavior (no env overrides): `STORAGE_PROVIDER=postgres`, `AUTH_GATE=openfga`, `REDIS_URL=redis://localhost:6379`, `EMBEDDER_PROVIDER=ollama`. Boot fails fast with helpful error if any required backend unreachable.

Mock fallbacks via env override: `STORAGE_PROVIDER=memory`, `AUTH_GATE=allow-all`, `REDIS_URL=` (empty), `EMBEDDER_PROVIDER=mock`. CI matrix runs both modes.

## Alternatives Considered

| Decision | Rejected Alternative | Why |
|---|---|---|
| A — storage | Sqlite + sqlite-vss | Not industry-standard for vector RAG |
| A — index | IVFFlat | Slower lookup at small corpus sizes; HNSW more general |
| B — auth model | Plain RBAC table | Doesn't scale to ReBAC needs |
| B — auth model | Cedar (AWS) | OpenFGA simpler local Docker setup |
| B — granularity | B1 per-document | O(d×u) storage; B2 chosen post-ADI |
| B — granularity | B3 hybrid | Out of scope for example; deferred Wave 6+ |
| C — async | NATS only | BullMQ-on-Redis simpler for example demo |
| D — lint | Replace eslint with oxlint | Plugin coverage incomplete; risky |
| D — lint | biome | Scope mismatch (lint+format+imports) |
| E — migrations | drizzle-kit (E2) | Opinionated TS toolchain; rejected post-ADI |
| E — migrations | Prisma (E3) | 50MB engine binaries; rejected post-ADI |
| E — migrations | golang-migrate | Adds Go runtime dep |
| F — defaults | Mock-by-default | Reverses sprint goal |

## Consequences

### Positive
- m9s-example becomes credible production-grade reference for external developers.
- Removes "but example uses mocks" objection from internal apps/pipeline migration.
- Real-infra test coverage closes EVID-017 §Addendum 1 residual gaps (after Addendum 2 closed Ollama).
- Faster lint feedback improves dev inner loop (~2s vs ~30s).
- Single-command onboarding reduces friction for new contributors.
- OpenFGA model versioning + bootstrap tuples = canonical ReBAC pattern available in repo.

### Negative
- ~16-18h sprint scope.
- Docker resource overhead (~2-3 GB RAM for full stack).
- New Docker image dependency surface (5 services to track + pin).
- Migration tooling commits to E1 long-term (mitigated by raw SQL universality).
- OpenFGA model decisions hard to reverse — schema migrations require tuple migrations.
- Backward compat surface area grows.

### Risks

- **R-1**: Backend resource overhead too heavy for low-end dev machines. Mitigation: memory fallbacks remain opt-in.
- **R-2** (RESOLVED via ADI): Authorization model granularity. ADI confirmed B2 sufficient for example scope.
- **R-3**: HNSW vs IVFFlat. Mitigation: HNSW default per pgvector; IVFFlat documented as opt-in for >1M rows.
- **R-4**: oxlint rule incompatibilities. Mitigation: supplementary mode.
- **R-5** (RESOLVED via ADI): Migration tooling lock-in. ADI confirmed E1 raw SQL universal.
- **R-6**: docker-compose flakiness across versions. Mitigation: pin Docker Compose v2 spec; min v24+.
- **R-7**: Existing 24 tests + 8 e2e break under real-infra default. Mitigation: env-gated dual-mode CI.
- **R-8**: tsup runtime-context class duplication issue (EVID-018) — Sprint 3.11 inherits this. Mitigation: structural duck-typing in m9s helper preserved; runtime-context tsup fix Wave 6+ ADR.

## Invariants

I-1: Mock fallback preservation. Every real-infra subsystem MUST have an env-flag opt-out to its mock equivalent.

I-2: No source changes to `@gertsai/*` packages. Sprint 3.11 is m9s-example-only.

I-3: Migration idempotency. Every migration MUST be idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).

I-4: Authorization deny-by-default. OpenFGA gate returns DENIED on tuple lookup network failure, missing tuple, malformed identifier. AllowAll gate ONLY when `AUTH_GATE=allow-all` env explicitly set.

I-5: Real-infra test isolation. Each suite (pg-vector, openfga, bullmq, ollama) env-gated independently. NO cross-test fixture leakage.

I-6: Production env defaults documented in `.env.example`. `.env` gitignored.

I-7: oxlint supplementary, not replacement. Both eslint + oxlint in CI; either failing blocks merge.

I-8: docker-compose health-gating. Broker start MUST wait for backend healthchecks.

I-9: SPDX header on every new `.ts` / `.sql` / migration file (continuing ADR-005 I-5).

I-10: README Production Setup tested. Phase B verifies clean machine → working broker ≤ 5 min.

I-11: ADI applied to contested decisions only. Decisions B and E ran `forgeplan_reason` (Amendment 1). Settled decisions (A, C, D, F) skip ADI per user feedback "ADI на спорных моментах only".

## Evidence Requirements

- E-1: SPEC-016 active.
- E-2: ADI run on Decision B — recommendation documented + applied (Amendment 1 §A1.4).
- E-3: ADI run on Decision E — recommendation documented + applied (Amendment 1 §A1.4).
- E-4: pgvector real-infra e2e — ingest persists row, search returns row via cosine sim.
- E-5: OpenFGA real-infra e2e — cross-tenant access denied at gate.
- E-6: BullMQ real-infra e2e — async enqueue → worker dequeue → status polled.
- E-7: oxlint workspace run ≤ 2s on full repo.
- E-8: docker-compose smoke — clean machine → working broker ≤ 5 min.
- E-9: All existing 24 m9s tests + 8 e2e PASS unchanged with mock fallbacks.
- E-10: Sprint 3.11 atomic commit on `feat/sprint-3-11-production-grade-m9s-example` branch.

## Implementation Plan

### Phase 0: Pre-conditions
- [x] PRD-004 active.
- [x] ADR-011 active.
- [x] SPEC-016 active.
- [x] RFC-002 active.

### Phase 1: ADI on contested decisions
- [x] **1.1** `forgeplan_reason ADR-011` — see Amendment 1.
- [x] **1.2** Synthesize ADI output → Amendment 1 codified Decisions B + E.
- [ ] **1.3** Update SPEC-016 W-items per Amendment 1 (locked decisions; minimal SPEC changes).

### Phase 2: Pre-Build audit (5∥ reviewers)
- [ ] **2.1** AgentTeams: architect / security / ddd / typescript / docs.
- [ ] **2.2** Convergent findings → Amendment 2 if needed.

### Phase 3: Build (4-6∥ workers)
- [ ] **3.1** pg-storage-worker, **3.2** openfga-worker, **3.3** queue-worker, **3.4** oxlint-worker, **3.5** docker-compose-worker, **3.6** docs-worker.

### Phase 4: Phase B verify + post-Build audit
- [ ] Build sequential (--workspace-concurrency=1 per Sprint 3.10 Addendum 2 lesson).
- [ ] Mock-mode + real-mode test runs.
- [ ] Post-Build fidelity audit (4-6∥).

### Phase 5: Phase D — evidence + commit + Hindsight
- [ ] EVID-019, atomic commit, Hindsight Group 44.
- [ ] Optional: gh PR + v0.2.0 publish (user `Y` per CLAUDE.md red lines).

## Affected Files (predicted)

See SPEC-016 §File ownership matrix for complete enumeration. Categories:

- `examples/m9s-example/src/infrastructure/{pg-document.repository,pg-vector.store,openfga-permission.gate}.ts` (NEW × 3)
- `examples/m9s-example/src/composition/infrastructure.ts` (env-driven backend selection)
- `examples/m9s-example/project.config.ts` (new env vars)
- `examples/m9s-example/migrations/001_*.sql` (NEW × 2 — up/down)
- `examples/m9s-example/scripts/{migrate,openfga-bootstrap}.ts` (NEW × 2)
- `examples/m9s-example/openfga/{model.fga,bootstrap-tuples.yaml}` (NEW × 2)
- `examples/m9s-example/docker-compose.yml` (NEW)
- `examples/m9s-example/docker/{postgres-init.sql,openfga-init.sh,ollama-pull-model.sh}` (NEW × 3)
- `examples/m9s-example/.env.example` (comprehensive update)
- `.oxlintrc.json` (NEW workspace root)
- Root `package.json` (`lint:fast` script)
- `examples/m9s-example/tests/real-infra/{pg-vector,openfga,bullmq,ollama}.test.ts` (NEW × 3 + move ollama)
- `examples/m9s-example/README.md` (Production Setup section)
- `CLAUDE.md` (m9s-example tier-table row update)
- `.forgeplan/evidence/EVID-019-...` (NEW post-Build)

## Admissibility

NOT admissible:
- NOT: Source changes to `@gertsai/*` packages (per I-2). Out-of-scope; separate ADR/SPEC.
- NOT: Removing mock fallbacks (per I-1).
- NOT: Replacing eslint with oxlint (per I-7).
- NOT: Skipping migration idempotency (per I-3).
- NOT: Authorization gate fail-open on errors (per I-4).
- NOT: Changing locked Decisions B (B2) or E (E1) without new Amendment + new ADI run.

## Rollback Plan

**Triggers**: Real-infra breaks existing tests; OpenFGA cross-tenant leak in security review; pgvector unacceptable p50; docker-compose broken on common Docker versions.

**Steps**: `git revert` Sprint 3.11 commit; m9s returns to Sprint 3.10 Addendum 2 state; components extracted into per-subsystem PRs.

**Blast Radius**: medium. m9s-example only — Wave 5 packages unaffected per I-2.

## AI Guidance

> Sprint 3.11 worker rules:
- **pg-storage-worker**: Reuse `@gertsai/pg-client/storage`. Schema migrations idempotent (I-3). HNSW index per Decision A R-3.
- **openfga-worker**: Implement B2 Tenant-hierarchy (LOCKED per Amendment 1 §A1.4). Default deny on errors (I-4).
- **queue-worker**: Mostly env-config flip (REDIS_URL default).
- **oxlint-worker**: Supplementary, not replacement (I-7). `lint:fast` ≤ 2s target.
- **docker-compose-worker**: Pin image versions. Healthchecks gate broker start (I-8).
- **migrate-worker** (per E1 LOCKED): Custom runner ~100 LOC + raw SQL files. Idempotency tested (I-3).
- **docs-worker**: README Production Setup self-contained + tested (I-10).
- **All**: SPDX headers (I-9). No `@gertsai/*` source changes (I-2). Mock fallbacks preserved (I-1).

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-004 (Sprint 3.11 vision) | PRD | based_on |
| SPEC-016 (Sprint 3.11 W-items) | SPEC | refines |
| RFC-002 (cross-package strategy) | RFC | refines |
| ADR-005 (storage-core IStorageProvider) | ADR | informs (Decision A) |
| ADR-006 (errors Shared Kernel) | ADR | informs (auth gate error mapping) |
| ADR-007 (runtime-context) | ADR | informs (Decision B gate plugs into middleware chain) |
| ADR-010 (Sprint 3.10 + Amendment 1) | ADR | informs (Wave 5 canonical reference goal continued) |
| EVID-018 (Sprint 3.10 Addendum 2) | Evidence | informs (Sprint 3.11 builds on action wiring + real Ollama) |
| KNOWN-ISSUES | Doc | informs (closes m9s mock-vs-real entries) |

> **Next step**: SPEC-016 Amendment 1 (lock W-items per Decisions B+E ADI outcome — minimal changes since initial preferences confirmed) → pre-Build audit (5∥ reviewers) → Build (4-6∥) → Phase B → post-Build audit → EVID-019.

---

## Amendment 1 — ADI synthesis (post-`forgeplan_reason ADR-011`)

Per ADR-011 I-11 (ADI on contested decisions only) + user feedback "ADI запускай тогда когда спорные моменты". `forgeplan_reason` ran on this ADR via `gemini-3-flash-preview` provider. Output recorded below + locked into Decisions B + E.

### A1.1 — Hypotheses surfaced (3)

- **H1** (Decision B Auth): Adopt **Option B2 (Tenant-hierarchy)**. Confidence: **High**. Assumptions: majority of access patterns single-tenant scoped; 2-hop OpenFGA latency within 100ms NFR-1; matches Wave 5 tenant-resolver architecture.
- **H2** (Decision E Migrations): Adopt **Option E1 (Raw SQL + custom runner)**. Confidence: **Medium-High**. Assumptions: dependency minimization core value; SQL most portable for production-grade reference; ~100 LOC custom runner maintainable.
- **H3** (Decision E alternative): Adopt **Option E2 (drizzle-kit)**. Confidence: **Medium**. Assumptions: developers expect schema-as-code; 5MB dep overhead acceptable for type-safety. **REJECTED** — opinionated toolchain conflicts with minimalist reference goal.

### A1.2 — Deductions per hypothesis

- **H1 consequence**: Tuple management O(documents + users) instead of O(documents × users) — significantly reduces OpenFGA storage footprint at scale. **Risk**: per-document cross-tenant sharing requires upgrade to B3 Hybrid (deferred to Wave 6+). **Feasibility**: HIGH — OpenFGA designed for hierarchical ReBAC; integrates cleanly with existing tenant_id schema columns.
- **H2 consequence**: Project remains lightweight; SQL transparent (no abstraction layer). **Risk**: edge-case bugs in custom runner if I-3 idempotency not strictly enforced. **Feasibility**: HIGH — implementation straightforward; leverages existing `@gertsai/pg-client` 3-method interface.
- **H3 consequence**: Best-in-class TS DX with schema-generated types. **Risk**: increased learning curve; potential I-2 friction if storage adapter needs Drizzle internal types. **Feasibility**: MEDIUM — adds "magic" not aligned with reference example philosophy.

### A1.3 — Evidence required (integrated to Sprint 3.11 acceptance)

- **For H1**: Benchmark 2-hop OpenFGA check latency with simulated 10k documents × 100 users load. Effort: **Medium**. Integrated as W-3-11-15 sub-test "OpenFGA p50 latency under simulated load" — passes if p50 < 100ms (NFR-1 target).
- **For H2**: Verify idempotency of custom runner — execute `migrate up` multiple times on dirty schema, no-op second+ run. Effort: **Low**. Integrated as W-3-11-26 (already in SPEC-016).

### A1.4 — Decisions LOCKED

- **Decision B → B2 (Tenant-hierarchy)** confirmed by ADI. SPEC-016 W-3-11-9..10 lock to model.fga shape per §Data Models block.
- **Decision E → E1 (Raw SQL + custom runner)** confirmed by ADI. SPEC-016 W-3-11-3 + W-3-11-24 lock to custom runner approach. No new package dependencies for migration tooling.

### A1.5 — Cross-references

- ADI output stored in this artifact (this section §A1.1-A1.3).
- forgeplan_reason invocation logged: provider=gemini, model=gemini-3-flash-preview, artifact=ADR-011, timestamp=Sprint 3.11 SHAPE phase.
- B3 Hybrid ReBAC upgrade path deferred to Wave 6+ ADR (per H1 risk).
- ADI hypotheses confirmed initial preferences in §Decision (B2 + E1) — solid signal that initial reasoning was sound. Strong divergence between ADI recommendation and initial preferences would warrant deeper review.

### A1.6 — Decision rationale strengthened

- B2 (Tenant-hierarchy) chosen over B1 (per-document) because storage cost scales linearly with users not multiplicatively with documents, and Wave 5 tenant-resolver already establishes tenant as first-class identity.
- B2 chosen over B3 (Hybrid) because demo scope = single tenant per request; cross-tenant shares are out-of-scope for example. B3 path documented as Wave 6+ upgrade if external developer feedback requests document-level shares.
- E1 (Raw SQL) chosen over E2 (drizzle-kit) because m9s-example purpose = teach Wave 5 patterns, NOT teach Drizzle ORM patterns. SQL is universal; consumers can migrate to drizzle-kit / prisma / atlas in their own forks if desired.
- E1 chosen over E3 (Prisma) for same reason + Prisma's 50MB engine binaries unsuitable for example minimalism.

> **Net effect of Amendment 1**: confirms initial preferences with explicit ADI hypotheses + tradeoff documentation + integrated evidence requirements. SPEC-016 W-items unchanged in number but locked to specific options. Build can proceed without TBD blockers on Decisions B and E.

