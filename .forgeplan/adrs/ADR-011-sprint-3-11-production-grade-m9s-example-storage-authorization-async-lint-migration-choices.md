---
depth: standard
id: ADR-011
kind: adr
last_modified_at: 2026-05-07T13:29:53.753223+00:00
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
- docker-compose.yml exists with NATS+Redis (49 lines) — needs extension.

**Existing assets** (already in repo):
- `@gertsai/pg-client/storage` subpath (Sprint 3.5 W-4B-4) — `PgStorageProvider implements IStorageProvider`. Adapter for jsonb-blob shape only (Amendment 2 §A2.5: dropped for normalized schema, kept for jsonb-blob KV consumers).
- `@gertsai/auth-openfga` package — `getFgaClient` + global `checkPermission` functions (NOT factory pattern per Amendment 2 §A2.1). `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` already exists, lazy-imports `checkPermission`.
- `@moleculer/channels` + `@moleculer/workflows` already imported in `moleculer.config.ts`, gated on `if (config.REDIS_URL)`.
- `@gertsai/m9s-cache` ships `RedisCacheDriver` named export alongside `MemoryCacheDriver`.

**External components**:
- `oxc-project/oxlint` — Rust-based JS/TS linter (~50× faster than eslint).
- `pgvector/pgvector:pg16` Postgres extension Docker image.
- `openfga/openfga:v1.x` HTTP service Docker image.
- `pg@^8.13` (Amendment 2 §A2.6 LOCKED) Node Postgres driver via thin wrapper `pg-client.adapter.ts`.

## Decision

### Decision A — Persistent storage via `PgClient` raw SQL (revised by Amendment 2 §A2.5)

m9s-example schema is **normalized** (`tenant_id`, `owner_uuid`, `vector(768)` columns), NOT jsonb-blob. `PgStorageProvider` (jsonb-only) DOES NOT FIT. m9s-example uses `PgClient` directly:

- `pg-document.repository.ts` (W-3-11-4) — implements existing `IDocumentStore` (NOT "IDocumentRepository") via `PgClient.query<DocumentRow>` raw SQL.
- `pg-vector.store.ts` (W-3-11-5) — implements existing `IChunkStore` via `PgClient` directly (vector ops outside IStorageProvider abstraction by design).
- Concrete pg runtime: `pg@^8.13` wrapped in `pg-client.adapter.ts` (NEW per Amendment 2 §A2.6).

Schema design (W-3-11-1):
- `documents(id uuid pk, tenant_id text, owner_uuid text, text text, metadata jsonb, created_at timestamptz, updated_at timestamptz)` — owner + tenant for OpenFGA tuple keying.
- `chunks(id uuid pk, document_id uuid fk, ordinal int, text text, vector vector(768), tenant_id text, created_at timestamptz)` — tenant denormalized for query-time tenant filter without join (per I-13 mandatory `WHERE tenant_id`).
- Indexes: `documents(tenant_id, owner_uuid)`, `chunks(document_id)`, `chunks(tenant_id)`, `chunks USING hnsw (vector vector_cosine_ops)` (HNSW per pgvector recommendation for 1k-100k corpus).

Existing `MemoryVectorStore` + `MemoryDocumentRepository` preserved as opt-in fallbacks (`STORAGE_PROVIDER=memory` env). Default switches to `STORAGE_PROVIDER=postgres`.

`DocumentMeta` generic via `defineStorageMetadata` (Amendment 2 §A2.10) — type-level documentation in `infrastructure/document.meta.ts`.

### Decision B — Authorization via existing `openfga-permission.gate.ts` (revised by Amendment 2 §A2.1-A2.4)

Existing gate (88 LOC, lazy-imports `@gertsai/auth-openfga.checkPermission`, fail-closed catch) is MODIFIED, not replaced. Strategy marker T2: F+ → **E+**.

Three viable approaches considered (B1 per-document, B2 tenant-hierarchy, B3 hybrid). **Decision LOCKED to B2 (Tenant-hierarchy)** post-ADI per Amendment 1 §A1.4. Model.fga uses **canonical FgaResourceType taxonomy** (Amendment 2 §A2.2):

```dsl
model
  schema 1.1
type user
type tenant
  relations
    define member: [user]
type document
  relations
    define tenant: [tenant]
    define can_view: member from tenant
    define can_edit: member from tenant
```

Per-document tuple writes at ingest (Amendment 2 §A2.3): `pg-document.repository.ts` post-INSERT writes `(document:<doc-uuid>, tenant, tenant:tenant-acme)` via `@gertsai/auth-openfga.writeTuples`. Bootstrap-tuples.yaml seeds only `(user:default, member, tenant:tenant-acme)`. NO wildcard tuples.

Error handling (Amendment 2 §A2.4): catch + log with cause + return false (no rethrow). Maintains stateless contract per I-14.

### Decision C — Async queue default-on (settled)

`config.REDIS_URL` defaults to `redis://localhost:6379` in m9s-example/.env.example. Activates `@moleculer/channels`, `@moleculer/workflows`, BullMQ queue, RedisCacheDriver. Synchronous + memory fallbacks preserved when empty.

Eventual consistency invariant (Amendment 2 §A2.9): explicit observable contract test in W-3-11-19 — `ingestResp.mode === 'queued'` returned IMMEDIATELY before chunks persisted; `searchDocuments` returns `[]` until worker completes; documented in `IngestDocumentUseCase` JSDoc.

### Decision D — Lint: oxlint supplementary (settled)

Workspace-level `.oxlintrc.json`. Scripts: `pnpm lint:fast` (oxlint, ≤ 2s) + `pnpm lint` (eslint, ~30s). CI runs both; either failing blocks merge.

### Decision E — Migration tooling: LOCKED to E1 Raw SQL + custom runner

Per Amendment 1 §A1.4. Runner (`scripts/migrate.ts`) uses `PgClient` directly with raw SQL files. Constraints (Amendment 2 §A2.11 I-15):
- `pg_advisory_xact_lock(<key>)` to prevent concurrent run races.
- CLI args: `--up | --down | --status | --target-version=<int>` (validated `Number.isInteger`).
- Migrations directory hard-coded: `path.resolve(__dirname, '../migrations')` — NO `--file` / `--dir` overrides.
- Argv validation via `typia.assert<MigrateCommand>` (m9s already has typia in build pipeline).

### Decision F — Cross-cutting: env-gated production-grade defaults (revised by Amendment 2 §A2.7)

Default behavior (no env overrides): `STORAGE_PROVIDER=postgres`, `AUTH_GATE=openfga`, `REDIS_URL=redis://localhost:6379`, `EMBEDDER_PROVIDER=ollama`. Boot fails fast with helpful error if any required backend unreachable.

Mock fallbacks via env override: `STORAGE_PROVIDER=memory`, `AUTH_GATE=allow-all`, `REDIS_URL=` (empty), `EMBEDDER_PROVIDER=mock`. CI matrix runs both modes.

OpenFGA env namespace **aligned with package** (Amendment 2 §A2.7): `FGA_API_URL`, `FGA_STORE_ID`, `FGA_API_TOKEN` (NOT `OPENFGA_*`). Matches `@gertsai/auth-openfga.getFgaClient` source.

`AllowAllPermissionGate` production guard (Amendment 2 §A2.11 I-12): refuses construction when `NODE_ENV='production'` — throws `ConfigurationError`. Always-on `WARN` log on construction.

## Alternatives Considered

| Decision | Rejected Alternative | Why |
|---|---|---|
| A — storage adapter | PgStorageProvider for normalized schema | jsonb-blob shape only; doesn't fit normalized columns (Amendment 2 §A2.5) |
| A — pg runtime | Prisma (E3-equivalent) | 50MB engine binaries; opinionated codegen |
| A — pg runtime | postgres@3.x (postgres.js) | Less familiar; pg@8 de-facto standard |
| A — index | IVFFlat | Slower at small corpus; HNSW more general |
| B — auth model | Plain RBAC table | Doesn't scale to ReBAC needs |
| B — auth model | Cedar (AWS) | OpenFGA simpler local Docker setup |
| B — granularity | B1 per-document | O(d×u) storage; B2 chosen post-ADI |
| B — granularity | B3 hybrid | Out of scope; deferred Wave 6+ |
| B — model relations | Custom `reader`/`writer` | Mismatch with canonical FgaRelations (Amendment 2 §A2.2) |
| B — bootstrap | `document:*` wildcard tuple | Non-portable OpenFGA syntax (Amendment 2 §A2.3) |
| C — async | NATS only | BullMQ-on-Redis simpler for example demo |
| D — lint | Replace eslint with oxlint | Plugin coverage incomplete; risky |
| D — lint | biome | Scope mismatch (lint+format+imports) |
| E — migrations | drizzle-kit (E2) | Opinionated TS toolchain; rejected post-ADI |
| E — migrations | Prisma (E3) | 50MB engine binaries; rejected post-ADI |
| F — defaults | Mock-by-default | Reverses sprint goal |
| F — env naming | `OPENFGA_*` namespace | Mismatch with `@gertsai/auth-openfga` package which uses `FGA_*` (Amendment 2 §A2.7) |

## Consequences

### Positive
- m9s-example becomes credible production-grade reference for external developers.
- Removes "but example uses mocks" objection from internal apps/pipeline migration.
- Real-infra test coverage closes EVID-017 §Addendum 1 residual gaps (after Addendum 2 closed Ollama).
- Faster lint feedback improves dev inner loop (~2s vs ~30s).
- Single-command onboarding reduces friction for new contributors.
- OpenFGA model versioning + bootstrap tuples = canonical ReBAC pattern available in repo.
- Pre-Build audit caught 24 findings — saved ~6-8h Build rework.

### Negative
- ~16-18h sprint scope.
- Docker resource overhead (~2-3 GB RAM for full stack).
- New Docker image dependency surface (5 services to track + pin).
- Migration tooling commits to E1 long-term (mitigated by raw SQL universality).
- OpenFGA model decisions hard to reverse — schema migrations require tuple migrations.
- Backward compat surface area grows.
- pg@8 driver dependency added (~3 MB; mature lib).

### Risks

- **R-1**: Backend resource overhead too heavy for low-end dev machines. Mitigation: memory fallbacks remain opt-in.
- **R-2** (RESOLVED via ADI + Amendment 2 §A2.2-A2.3): Authorization model granularity. ADI confirmed B2; Amendment 2 reconciled with canonical FgaResourceType + per-document tuples.
- **R-3**: HNSW vs IVFFlat. Mitigation: HNSW default per pgvector; IVFFlat documented as opt-in for >1M rows.
- **R-4**: oxlint rule incompatibilities. Mitigation: supplementary mode.
- **R-5** (RESOLVED via ADI): Migration tooling lock-in. ADI confirmed E1 raw SQL universal.
- **R-6**: docker-compose flakiness across versions. Mitigation: pin Docker Compose v2 spec; min v24+.
- **R-7**: Existing 24 tests + 8 e2e break under real-infra default. Mitigation: env-gated dual-mode CI.
- **R-8**: tsup runtime-context class duplication (EVID-018) — Sprint 3.11 inherits. Mitigation: structural duck-typing in m9s helper preserved; runtime-context tsup fix Wave 6+ ADR.
- **R-9 (NEW Amendment 2)**: OpenFGA tuple-wildcard live verification. Mitigation: pre-Build live-spike (W-3-11-8a, ~15 min) before openfga-worker commits. Worst-case if wildcard rejected: fail-closed (DoS not leak — security audit confirmed).
- **R-10 (NEW Amendment 2)**: pg@8 vs PgClient interface fit. Mitigation: thin wrapper `pg-client.adapter.ts` preserves swap-out optionality.

## Invariants

I-1: Mock fallback preservation. Every real-infra subsystem MUST have an env-flag opt-out to its mock equivalent.

I-2: No source changes to `@gertsai/*` packages. Sprint 3.11 is m9s-example-only.

I-3: Migration idempotency. Every migration MUST be idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).

I-4: Authorization deny-by-default. OpenFGA gate returns DENIED on tuple lookup network failure, missing tuple, malformed identifier. AllowAll gate ONLY when `AUTH_GATE=allow-all` env explicitly set AND `NODE_ENV !== 'production'` (per I-12).

I-5: Real-infra test isolation. Each suite (pg-vector, openfga, bullmq, ollama) env-gated independently. NO cross-test fixture leakage.

I-6: Production env defaults documented in `.env.example`. `.env` gitignored.

I-7: oxlint supplementary, not replacement. Both eslint + oxlint in CI; either failing blocks merge.

I-8: docker-compose health-gating. Broker start MUST wait for backend healthchecks.

I-9: SPDX header on every new `.ts` / `.sql` / migration file (continuing ADR-005 I-5).

I-10: README Production Setup tested. Phase B verifies clean machine → working broker ≤ 5 min.

I-11: ADI applied to contested decisions only. Decisions B and E ran `forgeplan_reason` (Amendment 1). Settled decisions (A, C, D, F) skip ADI per user feedback "ADI на спорных моментах only".

I-12 (NEW Amendment 2 §A2.11): `AllowAllPermissionGate` MUST refuse construction when `process.env.NODE_ENV === 'production'` — throws `ConfigurationError` from `@gertsai/errors`. Boot logger MUST log `WARN` (always-on) when AllowAll constructed irrespective of NODE_ENV. Production deploys with `AUTH_GATE=allow-all` env CAN'T succeed.

I-13 (NEW Amendment 2 §A2.11): Every `chunks` SQL (SELECT/UPDATE/DELETE) issued by m9s-example MUST include `WHERE tenant_id = $1` clause. Last line of defense if OpenFGA gate misconfigured. Adversarial test in W-3-11-8: insert 2 chunks different tenants, search with one tenant_id → returns only matching tenant rows.

I-14 (NEW Amendment 2 §A2.11): Permission gate stateless per `IPermissionGate` contract. NO decision caching inside gate. External `@gertsai/m9s-cache` TTL allowed at use-case layer with explicit invalidation policy. Worker prompt mandates.

I-15 (NEW Amendment 2 §A2.11): Migration runner uses `pg_advisory_xact_lock(<key>)` for concurrent run prevention. CLI args restricted to `--up | --down | --status | --target-version=<int>` (validated via `typia.assert<MigrateCommand>`). Migrations directory hard-coded `examples/m9s-example/migrations/` resolved via `path.resolve(__dirname, '../migrations')` — NOT env. NO `--file` / `--dir` overrides (CWE-22).

I-16 (NEW Amendment 2 §A2.11): OpenFGA HTTP authenticated via `FGA_API_TOKEN` env (preshared bearer — `Authorization: Bearer ${token}`). Production deployments document TLS termination requirement.

## Evidence Requirements

- E-1: SPEC-016 active with Amendment 1.
- E-2: ADI run on Decision B — recommendation documented + applied (Amendment 1 §A1.4).
- E-3: ADI run on Decision E — recommendation documented + applied (Amendment 1 §A1.4).
- E-4: pgvector real-infra e2e — ingest persists row, search returns row via cosine sim.
- E-5: OpenFGA real-infra e2e — cross-tenant access denied at gate (verifies B2 tenant-hierarchy correctness).
- E-6: BullMQ real-infra e2e — async enqueue → worker dequeue → status polled + eventual consistency contract test (Amendment 2 §A2.9).
- E-7: oxlint workspace run ≤ 2s on full repo.
- E-8: docker-compose smoke — clean machine → working broker ≤ 5 min.
- E-9: All existing 24 m9s tests + 8 e2e PASS unchanged with mock fallbacks.
- E-10: Sprint 3.11 atomic commit on `feat/sprint-3-11-production-grade-m9s-example` branch.
- E-11 (NEW Amendment 2): OpenFGA wildcard live-spike (W-3-11-8a) verified per-document tuple semantics before Build.

## Implementation Plan

### Phase 0: Pre-conditions
- [x] PRD-004 active.
- [x] ADR-011 active (with Amendment 1 + Amendment 2).
- [x] SPEC-016 active.
- [x] RFC-002 active.

### Phase 1: ADI on contested decisions
- [x] **1.1** `forgeplan_reason ADR-011` — see Amendment 1.
- [x] **1.2** Synthesize ADI output → Amendment 1 codified Decisions B + E.

### Phase 2: Pre-Build audit (5∥ reviewers) — COMPLETE
- [x] **2.1** AgentTeams: architect / security / ddd / typescript / docs.
- [x] **2.2** 24 findings synthesized → Amendment 2 codifies all convergent + critical singles.

### Phase 3: Build (4-6∥ workers per Amendment 2 revisions)
- [ ] **3.0** Pre-Build OpenFGA wildcard live-spike (W-3-11-8a, ~15 min).
- [ ] **3.1** pg-storage-worker (T1 + DocumentMeta + pg-client.adapter.ts).
- [ ] **3.2** openfga-worker (T2 E+ MODIFY existing gate + canonical FgaResourceType).
- [ ] **3.3** queue-worker (T3 + eventual consistency test).
- [ ] **3.4** oxlint-worker (T4).
- [ ] **3.5** docker-compose-worker (T6 E+ MODIFY existing compose).
- [ ] **3.6** docs-worker (README Production Setup + openfga README + migrations README).

### Phase 4: Phase B verify + post-Build audit
- [ ] Build sequential (--workspace-concurrency=1 per Sprint 3.10 Addendum 2 lesson).
- [ ] Mock-mode + real-mode test runs.
- [ ] Post-Build fidelity audit (4-6∥ reviewers per Track).

### Phase 5: Phase D — evidence + commit + Hindsight
- [ ] EVID-019 (CL3 supports), atomic commit, Hindsight Group 44.
- [ ] Optional: gh PR + v0.2.0 publish (user `Y` per CLAUDE.md red lines).

## Affected Files (predicted, per Amendment 2 revisions)

- `examples/m9s-example/src/infrastructure/{pg-document.repository,pg-vector.store,pg-client.adapter,document.meta}.ts` (NEW × 4).
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` (MODIFY existing — extend action→relation map + canonical types).
- `examples/m9s-example/src/composition/infrastructure.ts` (env-driven backend selection + AllowAll NODE_ENV guard).
- `examples/m9s-example/project.config.ts` (`STORAGE_PROVIDER`, `POSTGRES_URL`, `AUTH_GATE`, `FGA_API_URL`, `FGA_STORE_ID`, `FGA_API_TOKEN`, `MIGRATIONS_AUTO_APPLY`).
- `examples/m9s-example/migrations/001_init_documents_chunks.{up,down}.sql` (NEW × 2).
- `examples/m9s-example/scripts/{migrate,openfga-bootstrap}.ts` (NEW × 2).
- `examples/m9s-example/openfga/{model.fga,bootstrap-tuples.yaml}` (NEW × 2 — canonical FgaResourceType).
- `examples/m9s-example/docker-compose.yml` (MODIFY existing — extend with postgres+openfga+ollama).
- `examples/m9s-example/docker/{postgres-init.sql,openfga-init.sh,ollama-pull-model.sh}` (NEW × 3).
- `examples/m9s-example/.env.example` (comprehensive update with placeholder credentials).
- `.oxlintrc.json` (NEW workspace root).
- Root `package.json` (`lint:fast` script).
- `examples/m9s-example/tests/real-infra/{pg-vector,openfga,bullmq,ollama}.test.ts` (NEW × 3 + move ollama).
- `examples/m9s-example/README.md` (Production Setup section + glossary + caveats).
- `examples/m9s-example/openfga/README.md` (NEW per docs P1).
- `examples/m9s-example/migrations/README.md` (NEW per docs P1).
- `KNOWN-ISSUES.md` (close m9s mock-vs-real entries).
- `CLAUDE.md` (m9s-example tier-table row update).
- `.forgeplan/evidence/EVID-019-...` (NEW post-Build).

## Admissibility

NOT admissible:
- NOT: Source changes to `@gertsai/*` packages (per I-2). Out-of-scope; separate ADR/SPEC.
- NOT: Removing mock fallbacks (per I-1).
- NOT: Replacing eslint with oxlint (per I-7).
- NOT: Skipping migration idempotency (per I-3).
- NOT: Authorization gate fail-open on errors (per I-4 / I-12).
- NOT: Changing locked Decisions B (B2) or E (E1) without new Amendment + new ADI run.
- NOT (Amendment 2): Wildcard tuples in bootstrap-tuples.yaml.
- NOT (Amendment 2): `OPENFGA_*` env namespace (must use `FGA_*`).
- NOT (Amendment 2): chunks SQL without `WHERE tenant_id = $1` filter (I-13).
- NOT (Amendment 2): `AllowAllPermissionGate` construction in production NODE_ENV (I-12).
- NOT (Amendment 2): Migration runner CLI path overrides (I-15).

## Rollback Plan

**Triggers**: Real-infra breaks existing tests; OpenFGA cross-tenant leak in security review; pgvector unacceptable p50; docker-compose broken on common Docker versions.

**Steps**: `git revert` Sprint 3.11 commit; m9s returns to Sprint 3.10 Addendum 2 state; components extracted into per-subsystem PRs.

**Blast Radius**: medium. m9s-example only — Wave 5 packages unaffected per I-2.

## AI Guidance

> Sprint 3.11 worker rules (post Amendment 2):
- **pg-storage-worker**: Use `PgClient` raw via `pg-client.adapter.ts` (NEW) — NOT `PgStorageProvider`. Implement existing `IDocumentStore` + `IChunkStore` ports (NOT "IDocumentRepository"). Schema migrations idempotent (I-3). HNSW index per Decision A. Every chunks SQL includes `WHERE tenant_id = $1` (I-13). Add `DocumentMeta` via `defineStorageMetadata` (Amendment 2 §A2.10).
- **openfga-worker**: MODIFY existing `openfga-permission.gate.ts` (T2 E+). Use canonical `FgaResourceType` enum + `FGA_RELATIONS` constants. NO custom `reader`/`writer` relations. Per-document tuple write at ingest time. Default deny on errors (I-4 + Amendment 2 §A2.4). Stateless (I-14). Run pre-Build live-spike (W-3-11-8a) BEFORE committing model.fga.
- **queue-worker**: Mostly env-config flip (REDIS_URL default). Eventual consistency contract test in W-3-11-19 per Amendment 2 §A2.9.
- **oxlint-worker**: Supplementary, not replacement (I-7). `lint:fast` ≤ 2s target.
- **docker-compose-worker**: MODIFY existing docker-compose.yml (T6 E+). Pin image versions. Healthchecks gate broker start (I-8). 5+ services: nats (existing), redis (existing), postgres (NEW pgvector/pgvector:pg16), openfga (NEW openfga/openfga:v1.x), ollama (NEW ollama/ollama:latest).
- **migrate-worker** (per E1 LOCKED + I-15): Custom runner ~100 LOC + raw SQL files. Idempotency tested (I-3). Advisory lock + hard-coded path. Argv via typia.
- **docs-worker**: README Production Setup self-contained + tested (I-10). Sprint 3.6 §template structure. Inline templates per Amendment 2 §A2.13 docs P1.1-P1.4.
- **All**: SPDX headers (I-9). No `@gertsai/*` source changes (I-2). Mock fallbacks preserved (I-1). Real-infra tests env-gated independently (I-5).

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

> **Next step**: SPEC-016 Amendment 1 (revise W-items per Amendment 2) → Pre-Build OpenFGA live-spike (W-3-11-8a) → Build (4-6∥) → Phase B → post-Build audit → EVID-019.

---

## Amendment 1 — ADI synthesis (post-`forgeplan_reason ADR-011`)

Per ADR-011 I-11 (ADI on contested decisions only) + user feedback "ADI запускай тогда когда спорные моменты". `forgeplan_reason` ran on this ADR via `gemini-3-flash-preview` provider. Output recorded below + locked into Decisions B + E.

### A1.1 — Hypotheses surfaced (3)

- **H1** (Decision B Auth): Adopt **Option B2 (Tenant-hierarchy)**. Confidence: **High**. Assumptions: majority of access patterns single-tenant scoped; 2-hop OpenFGA latency within 100ms NFR-1; matches Wave 5 tenant-resolver architecture.
- **H2** (Decision E Migrations): Adopt **Option E1 (Raw SQL + custom runner)**. Confidence: **Medium-High**. Assumptions: dependency minimization core value; SQL most portable for production-grade reference; ~100 LOC custom runner maintainable.
- **H3** (Decision E alternative): Adopt **Option E2 (drizzle-kit)**. Confidence: **Medium**. **REJECTED** — opinionated toolchain conflicts with minimalist reference goal.

### A1.2 — Deductions per hypothesis

- **H1**: Tuple management O(documents + users) instead of O(documents × users). Risk: per-document cross-tenant sharing requires upgrade to B3 Hybrid (deferred Wave 6+). Feasibility: HIGH.
- **H2**: Project remains lightweight; SQL transparent. Risk: edge-case bugs if I-3 idempotency not enforced. Feasibility: HIGH.
- **H3**: Best-in-class TS DX. Risk: increased learning curve; potential I-2 friction. Feasibility: MEDIUM.

### A1.3 — Evidence required (integrated to Sprint 3.11 acceptance)

- **For H1**: Benchmark 2-hop OpenFGA latency with 10k documents × 100 users. Integrated as W-3-11-15 sub-test "OpenFGA p50 latency under simulated load" — passes if p50 < 100ms (NFR-1).
- **For H2**: Verify idempotency — execute `migrate up` multiple times. Integrated as W-3-11-26.

### A1.4 — Decisions LOCKED

- **Decision B → B2 (Tenant-hierarchy)** confirmed by ADI.
- **Decision E → E1 (Raw SQL + custom runner)** confirmed by ADI.

### A1.5 — Cross-references

- forgeplan_reason invocation: provider=gemini, model=gemini-3-flash-preview, artifact=ADR-011, timestamp=Sprint 3.11 SHAPE phase.
- B3 Hybrid path deferred Wave 6+.
- ADI confirmed initial preferences — solid signal.

### A1.6 — Decision rationale strengthened

- B2 over B1: storage scales linearly with users, not multiplicatively with documents.
- B2 over B3: demo scope = single tenant per request.
- E1 over E2/E3: m9s-example purpose is teach Wave 5 patterns, not Drizzle/Prisma. SQL universal.

> **Net effect of Amendment 1**: confirms initial preferences with ADI tradeoff documentation + integrated evidence requirements. SPEC-016 W-items locked to specific options.

---

## Amendment 2 — Pre-Build audit synthesis (5∥ reviewers, 24 findings)

Applied after 5∥ pre-Build audit (architect / security / ddd / typescript / docs reviewers). 24 actionable findings: 5 convergent (≥2 reviewers, mandatory P1+) + 12 critical single-reviewer + 7 docs-blocking inline templates. Build was BLOCKED until Amendment 2 applied. Amendment shipped via `forgeplan_update` MCP per CLAUDE.md 🔴 STRICT.

### A2.1 — OpenFGA gate ALREADY EXISTS (Decision B revised)

**Convergent finding** (architect P1-1 + typescript P1-2 + ddd implicit). `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` already exists (88 LOC, lazy-import via `@gertsai/auth-openfga.checkPermission`, fail-closed catch). Sprint 3.11 does NOT create new file — it MODIFIES existing.

**SPEC-016 W-3-11-12 changes**: NEW → MODIFY. Strategy marker T2 = F+ → **E+** (extends existing). Worker prompt mandates: extend action→relation map for `tenant:{id}` resource; remove hard-cast on `resourceType` (use canonical `FgaResourceType` enum); add composition env wiring for `AUTH_GATE`/`FGA_API_URL`/`FGA_STORE_ID`.

### A2.2 — OpenFGA model.fga shape uses canonical taxonomy

**Convergent finding** (architect P1-2 + security P0-1 implicit). `@gertsai/auth-openfga.types.ts:19,251` defines `FgaResourceType` as fixed union (`'tenant' | 'project' | ... | 'document'`) and `FgaRelations` typed relation maps per resource type. SPEC-016 §Data Models OpenFGA model draft used non-canonical `reader`/`writer` relations.

**Decision B2 LOCKED** (Amendment 1 §A1.4) reconciled with package taxonomy:
- Use canonical `tenant` + `document` types from `FgaResourceType`.
- Use canonical relations from `FGA_RELATIONS` (`can_view`/`can_edit` per document).
- Hierarchy via `tenant` parent relation on document — B2 still tenant-hierarchical.

**SPEC-016 §Data Models revised**:
```dsl
model
  schema 1.1
type user
type tenant
  relations
    define member: [user]
type document
  relations
    define tenant: [tenant]
    define can_view: member from tenant
    define can_edit: member from tenant
```

### A2.3 — OpenFGA wildcard tuple replaced with per-document writes

**Convergent finding** (architect P1-3 + security P0-1). `(tenant:tenant-acme, tenant, document:*)` wildcard in tuple object position is non-portable OpenFGA syntax. Worst-case fail mode is fail-closed (DoS not leak — security P0-1 confirmed) but correctness undefined.

**Resolution**: per-document tuples written at ingest time. `pg-document.repository.ts` (W-3-11-4) post-INSERT side-effect writes `(document:<doc-uuid>, tenant, tenant:tenant-acme)` tuple via `@gertsai/auth-openfga.writeTuples`. Bootstrap-tuples.yaml seeds only `(user:default, member, tenant:tenant-acme)` — no wildcard.

**Pre-Build live-spike** (security S8 / new W-3-11-8a, mandatory): 15-min smoke against `docker run openfga/openfga` to verify check semantics with per-document tuples before openfga-worker commits.

### A2.4 — OpenFGA error handling: wrapUnknownError + fail-closed + no rethrow

**Convergent finding** (security P1-2 + ddd P1-2). Existing gate already fail-closes on errors but doesn't use `@gertsai/errors` taxonomy explicitly. Amendment mandates:

```typescript
// W-3-11-12 prompt mandate (gate catch block):
catch (e) {
  logger.error('OpenFGA check failed', { 
    cause: e, 
    operatorUuid, 
    action, 
    resource: maskResourceId(resource) 
  });
  // NO rethrow — fail-closed per I-4
  return false;
}
```

### A2.5 — PgStorageProvider only fits jsonb-blob; m9s normalized schema uses PgClient raw

**Convergent finding** (architect P2-1 + typescript P1-3). `PgStorageProvider` (Sprint 3.5 W-4B-4) signature: `(id, data jsonb)` shape only. m9s schema is **normalized** (tenant_id/owner_uuid as columns, vector(768) as column). Adapter does not fit.

**Decision A revised**:
- `pg-document.repository.ts` (W-3-11-4) uses `PgClient` directly with raw SQL (typed via `query<DocumentRow>`).
- `pg-vector.store.ts` (W-3-11-5) uses `PgClient` directly (was already designed this way).
- `PgStorageProvider` reuse DROPPED for Sprint 3.11. Stays available for jsonb-blob KV consumers.
- Documented as teaching moment in `pg-document.repository.ts` file header.

### A2.6 — pg runtime LOCKED to `pg@^8.13` thin wrapper

**Critical single-reviewer** (typescript P1-3). m9s-example uses `pg@^8.13` (node-postgres) wrapped in a thin adapter conforming to `@gertsai/pg-client.PgClient` interface. Located at `examples/m9s-example/src/infrastructure/pg-client.adapter.ts` (NEW). NOT Prisma or postgres.js.

### A2.7 — Env naming aligned with `@gertsai/auth-openfga` package

**Critical single-reviewer** (typescript P2-9). Package uses `FGA_API_URL`/`FGA_STORE_ID`/`FGA_API_TOKEN`. SPEC-016 W-3-11-14 introduced `OPENFGA_*` namespace which would create dual-naming chaos.

**Decision F revised**: m9s adopts package env naming verbatim.

### A2.8 — docker-compose.yml ALREADY EXISTS (W-3-11-27 revised)

**Single-reviewer** (architect P2-2). Current `examples/m9s-example/docker-compose.yml` ships NATS + Redis (49 lines).

**Resolution**: W-3-11-27 NEW → **MODIFY**. Extend existing file with `postgres` + `openfga` + `ollama` services. Preserve NATS + Redis.

### A2.9 — Eventual consistency Document↔Chunks under BullMQ async

**Critical single-reviewer** (ddd P2-4). Track 3 BullMQ default-on decouples Document persist from Chunks persist. Search for new docId may return `[]` until worker finishes.

**Resolution**: explicit eventual consistency invariant + observable contract test:
- README Production Setup §Async caveats: documented latency window.
- W-3-11-19 bullmq.test.ts test scenario (NEW): immediate `mode='queued'`; polling search returns `[]` initially; after worker completes, search returns ingested docId. Document explicit invariant in `IngestDocumentUseCase` JSDoc.

### A2.10 — DocumentMeta generic via `defineStorageMetadata`

**Single-reviewer** (typescript Generic instantiation analysis). Type-safe `Meta` for normalized documents. NEW W-item: `infrastructure/document.meta.ts` with `defineStorageMetadata<DocumentRow, DocumentWrite>()({ indexed: ['id', 'tenant_id', 'owner_uuid'] as const })`.

### A2.11 — NEW invariants (extend §Invariants)

I-12: AllowAll refuses NODE_ENV='production'. I-13: chunks SQL `WHERE tenant_id` mandatory. I-14: gate stateless. I-15: migration runner advisory lock + hard-coded path. I-16: FGA_API_TOKEN preshared bearer. (See main §Invariants block above for full text.)

### A2.12 — Decision rationale strengthened

- B2 Tenant-hierarchy via canonical FgaResourceType (per A2.2) leverages `@gertsai/auth-openfga`'s typed relations.
- pg@8 thin wrapper (per A2.6) preserves swap-out optionality.
- Eventual consistency invariant (per A2.9) demonstrates production reality.
- AllowAll NODE_ENV guard (per I-12) hardens against env-propagation accidents.

### A2.13 — Strategy markers revised

| Track | Original | Amendment 2 |
|---|---|---|
| T1 pg-storage | F+ | F+ (unchanged) |
| T2 openfga | F+ | **E+** (existing gate file MODIFY) |
| T3 async-redis | E+ | E+ (unchanged) |
| T4 oxlint | F+ | F+ (unchanged) |
| T5 migrations | F+ | F+ (new tooling) |
| T6 docker-compose | F+ | **E+** (existing docker-compose.yml MODIFY) |

### A2.14 — Audit verdicts

| Reviewer | Verdict | P0 | P1 | P2 | Convergent |
|---|---|---|---|---|---|
| architect | GO-WITH-FIXES | 0 | 3 | 2 | C1, C2, C3, C5 |
| security | GO-WITH-FIXES | 3 | 4 | 2 | C2, C3, C4 |
| ddd | APPROVE-WITH-FIXES | 0 | 2 | 4 | C4 |
| typescript | YELLOW | 0 | 3 | 6 | C1, C5 |
| docs | BLOCKED-ON-INLINE-TEMPLATES | 0 | 7 | 2 | (D-track inline) |

Net Amendment 2 count: **10 cross-cutting decisions** (A2.1-A2.10), **5 new invariants** (I-12..I-16), **2 strategy marker changes** (T2, T6 F+ → E+), **24+ SPEC-016 W-item revisions**. Build proceeds after SPEC-016 Amendment 1 applied per Amendment 2.

> **Net effect of Amendment 2**: SPEC-016 + RFC-002 reconciled with reality (existing gate, docker-compose, env naming, package surface). Critical security invariants codified. EVID-016 §5 lesson regression averted through inline templates per docs-reviewer P1.1-P1.4. ~6-8h Build rework saved through pre-Build catch.


