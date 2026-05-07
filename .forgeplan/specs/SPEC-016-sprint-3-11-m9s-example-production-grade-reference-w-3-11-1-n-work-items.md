---
depth: standard
id: SPEC-016
kind: spec
last_modified_at: 2026-05-07T12:54:20.078913+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-004
  relation: based_on
- target: ADR-011
  relation: based_on
status: active
title: Sprint 3.11 — m9s-example production-grade reference (W-3-11-1..N work items)
---

# SPEC-016: Sprint 3.11 — m9s-example production-grade reference (W-3-11-1..N work items)

## Summary

Sprint 3.11 = production-grade m9s-example per PRD-004 + ADR-011. 6 disjoint tracks executed by 4-6∥ AgentTeams workers. Strictly **m9s-example only** (per ADR-011 I-2 — no `@gertsai/*` source changes). Branch `feat/sprint-3-11-production-grade-m9s-example` off `feat/sprint-3-10-wave-5-polish`.

Estimated 16-18h ≈ 1 working week. **Pre-Build ADI mandatory** on contested Decisions B (OpenFGA model) + E (migration tooling) per ADR-011 I-11.

## Scope

### Track 1: Postgres + pgvector storage (T1, F+ marker)

Per ADR-011 Decision A (settled — leverages `@gertsai/pg-client/storage` Sprint 3.5 W-4B-4).

- **W-3-11-1**: NEW `examples/m9s-example/migrations/001_init_documents_chunks.up.sql` — `documents` table + `chunks` table + indexes (incl. HNSW vector index). All `IF NOT EXISTS` per ADR-011 I-3.
- **W-3-11-2**: NEW `examples/m9s-example/migrations/001_init_documents_chunks.down.sql` — rollback pair (`DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS documents; DROP EXTENSION IF EXISTS vector;`).
- **W-3-11-3**: NEW `examples/m9s-example/scripts/migrate.ts` — migration runner CLI per Decision E (W-items 21-23 will revise after ADI). Default approach: raw SQL files + `pg_migrations` tracking table + ts-node entrypoint.
- **W-3-11-4**: NEW `examples/m9s-example/src/infrastructure/pg-document.repository.ts` — `IDocumentRepository` impl using `PgStorageProvider` from `@gertsai/pg-client/storage`. Wraps existing `MemoryDocumentRepository` shape — drop-in replacement.
- **W-3-11-5**: NEW `examples/m9s-example/src/infrastructure/pg-vector.store.ts` — `IChunkStore` impl with pgvector queries. `INSERT ... vector(768)` + `SELECT ... ORDER BY vector <=> $query LIMIT $topK` cosine similarity.
- **W-3-11-6**: MODIFY `examples/m9s-example/src/composition/infrastructure.ts` — env-driven backend selection: `STORAGE_PROVIDER=postgres|memory` switches between `Pg*` and `Memory*` impls. Default `postgres`. Boot fails fast with helpful error if Postgres unreachable when `postgres` selected.
- **W-3-11-7**: MODIFY `examples/m9s-example/project.config.ts` — add env vars `STORAGE_PROVIDER`, `POSTGRES_URL`, `MIGRATIONS_AUTO_APPLY`.
- **W-3-11-8**: NEW `examples/m9s-example/tests/real-infra/pg-vector.test.ts` — env-gated (`PGVECTOR_E2E=1` or auto-detect Postgres). 3+ tests: ingest persists row in Postgres, search returns row via cosine sim, cross-tenant filter correctness.

### Track 2: OpenFGA real authorization gate (T2, F+ marker, **CONTESTED — ADI on Decision B**)

Per ADR-011 Decision B. **Build BLOCKED** until ADI runs and chooses tuple model (B1 per-document / B2 tenant-hierarchy / B3 hybrid). W-items below assume **B2 tenant-hierarchy** as initial preference; ADI may revise.

- **W-3-11-9**: NEW `examples/m9s-example/openfga/model.fga` — authorization model (TBD ADI outcome). Initial draft = B2 tenant-hierarchy.
- **W-3-11-10**: NEW `examples/m9s-example/openfga/bootstrap-tuples.yaml` — demo seed: `(user:default, member, tenant:tenant-acme)` + `(tenant:tenant-acme, tenant, document:*)` wildcard.
- **W-3-11-11**: NEW `examples/m9s-example/scripts/openfga-bootstrap.ts` — runs at docker-compose first start: creates store, loads model, seeds tuples. Idempotent (skips if store exists).
- **W-3-11-12**: NEW `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` — `IPermissionGate` impl using OpenFGA HTTP API. Default-deny on errors per ADR-011 I-4.
- **W-3-11-13**: MODIFY `examples/m9s-example/src/composition/infrastructure.ts` — env-driven gate selection: `AUTH_GATE=openfga|allow-all`. Default `openfga`.
- **W-3-11-14**: MODIFY `examples/m9s-example/project.config.ts` — add env vars `AUTH_GATE`, `OPENFGA_API_URL`, `OPENFGA_STORE_ID`.
- **W-3-11-15**: NEW `examples/m9s-example/tests/real-infra/openfga.test.ts` — env-gated (`OPENFGA_E2E=1` or auto-detect). 4+ tests: same-tenant access allowed, cross-tenant access denied (CRITICAL — verifies gate correctness, not application-layer rejection), missing tuple = denied, OpenFGA unreachable = denied.

### Track 3: BullMQ async + Redis cacher activation (T3, E+ marker, settled)

Per ADR-011 Decision C — mostly env config flip.

- **W-3-11-16**: MODIFY `examples/m9s-example/.env.example` — set `REDIS_URL=redis://localhost:6379` as default for dev. Documents that empty value reverts to synchronous + memory cache.
- **W-3-11-17**: MODIFY `examples/m9s-example/src/composition/infrastructure.ts` — when `REDIS_URL` set, swap `MemoryCacheDriver` to Redis driver from `@gertsai/m9s-cache`. Existing code path validates this is gate; just confirms.
- **W-3-11-18**: VERIFY existing `if (config.REDIS_URL)` paths in `services/index.ts` (BullMQ worker registration), `moleculer.config.ts` (channels + workflows middleware) fire correctly under default env. No code changes — verification only.
- **W-3-11-19**: NEW `examples/m9s-example/tests/real-infra/bullmq.test.ts` — env-gated (`BULLMQ_E2E=1` or auto-detect Redis). 3+ tests: ingest enqueues with `mode='queued'` + jobId, worker dequeues + processes, status polled via api-core BullMQ helpers.

### Track 4: oxlint workspace integration (T4, F+ marker, settled)

Per ADR-011 Decision D + I-7.

- **W-3-11-20**: NEW workspace root `.oxlintrc.json` — opt-in `correctness` + `suspicious` + `pedantic` rules. Per-file overrides via `overrides` for tests + fixtures.
- **W-3-11-21**: MODIFY root `package.json` — add `lint:fast` script: `oxlint . --report-unused-disable-directives`. Existing `lint` script unchanged.
- **W-3-11-22**: VERIFY full repo `pnpm lint:fast` ≤ 2s wall clock (NFR-1). If exceeds, drop `pedantic` rules. Captured in EVID-019.
- **W-3-11-23**: MODIFY CI workflow (if applicable in repo) — add `lint:fast` step alongside existing `lint`.

### Track 5: Migration tooling — runner implementation (T5, F+ marker, **CONTESTED — ADI on Decision E**)

Per ADR-011 Decision E. **Build BLOCKED** until ADI runs and chooses E1 raw SQL / E2 drizzle-kit / E3 prisma. W-items below assume **E1 raw SQL + custom runner** as initial preference.

- **W-3-11-24**: REVISE W-3-11-3 per ADI outcome. If E1: implement custom runner. If E2: replace with drizzle-kit setup. If E3: replace with prisma setup.
- **W-3-11-25**: ADD `pnpm migrate:up` + `pnpm migrate:down` + `pnpm migrate:status` scripts to `examples/m9s-example/package.json`.
- **W-3-11-26**: VERIFY idempotency per ADR-011 I-3 — `migrate:up` twice = no-op second time.

### Track 6: docker-compose orchestration + README + initial smoke (T6, F+ marker, settled)

- **W-3-11-27**: NEW `examples/m9s-example/docker-compose.yml` — services: `postgres` (pgvector/pgvector:pg16), `redis` (redis:7-alpine), `openfga` (openfga/openfga:v1.x), `ollama` (ollama/ollama:latest). Healthchecks per ADR-011 I-8. Volumes for state persistence.
- **W-3-11-28**: NEW `examples/m9s-example/docker/postgres-init.sql` — pgvector extension creation (auto-runs on container init).
- **W-3-11-29**: NEW `examples/m9s-example/docker/openfga-init.sh` — Ollama model pull + OpenFGA store/model bootstrap (delegates to W-3-11-11 script).
- **W-3-11-30**: NEW `examples/m9s-example/docker/ollama-pull-model.sh` — pulls `nomic-embed-text` on first start (idempotent).
- **W-3-11-31**: MODIFY `examples/m9s-example/.env.example` — comprehensive env list mapping to docker-compose service names.
- **W-3-11-32**: MAJOR ADDITION `examples/m9s-example/README.md` — `## Production Setup` section: prerequisites (Docker v24+, Node 22+), `docker-compose up -d`, `pnpm install`, `pnpm migrate:up` (or auto-apply via env), `pnpm start`, smoke test (`curl ingest` + `curl search`). Step-by-step copy-pasteable. Per ADR-011 I-10 must be testable end-to-end.
- **W-3-11-33**: VERIFY clean-machine onboarding ≤ 5 min (NFR-2 + G-2). Captured in EVID-019.

### Track 7: Phase B Integration (T7, team-lead solo)

- **W-3-11-34**: `pnpm install` (after package.json deps additions for migration tooling per ADI outcome).
- **W-3-11-35**: `pnpm build` sequential (`--workspace-concurrency=1` per Sprint 3.10 Addendum 2 lesson — DTS race at concurrency=4).
- **W-3-11-36**: `pnpm test` mock-mode default — verify all 24 m9s tests + 8 e2e tests + Sprint 3.10 Addendum 2 (4 broker rejection + 3 real-infra Ollama if env-set) PASS unchanged.
- **W-3-11-37**: `docker-compose up -d` then `pnpm test:real-infra` — full real-infra suite PASS (4 backend test files: pg-vector, openfga, bullmq, ollama).
- **W-3-11-38**: `pnpm typecheck` + `pnpm depcruise` + `pnpm lint` + `pnpm lint:fast` + `pnpm publint` — all green.
- **W-3-11-39**: 5 changesets per Sprint convention (one per track + summary):
  - `.changeset/sprint-3-11-pg-storage.md` (patch m9s-example — but this introduces new Postgres dep — defer bump strategy decision to changeset writing time).
  - `.changeset/sprint-3-11-openfga.md` (patch m9s-example).
  - `.changeset/sprint-3-11-async-redis.md` (patch m9s-example).
  - `.changeset/sprint-3-11-oxlint.md` (no published packages — workspace dev tool addition).
  - `.changeset/sprint-3-11-docker-compose.md` (patch m9s-example).
- **W-3-11-40**: MODIFY `CLAUDE.md` — m9s-example tier-table row update: "production-grade reference with real Postgres+pgvector / OpenFGA / BullMQ+Redis / Ollama / docker-compose / oxlint per ADR-011".

### Track 8: Phase D Audit + Evidence (T8, team-lead solo)

- **W-3-11-41**: Post-Build fidelity audit — 4-6∥ reviewers per Track (pg-storage / openfga / queue+cache / oxlint / docker-compose+readme / docs).
- **W-3-11-42**: Address P0/P1 findings if any.
- **W-3-11-43**: Create EVID-019 (CL3, supports) via `forgeplan_new`. Linked informs PRD-004 + ADR-011 + SPEC-016 + EVID-018. Structured Fields §.
- **W-3-11-44**: Activate SPEC-016 (final).
- **W-3-11-45**: Single atomic commit `feat(monorepo): Sprint 3.11 — m9s-example production-grade reference (Postgres+pgvector+OpenFGA+BullMQ+oxlint+docker-compose)`.
- **W-3-11-46**: Hindsight retain Group 44.

## Out of scope

- `@gertsai/*` package source changes (ADR-011 I-2 — bug fixes go through separate ADR/SPEC).
- Multi-region / multi-tenant deployment patterns (single-node sufficient for example).
- Observability stack (`@gertsai/otel` wiring) — Wave 6+ Sprint 3.12.
- `apps/pipeline` migration — m9s-example only.
- v0.2.0 publish gate — separate user `Y` decision per CLAUDE.md red lines.
- runtime-context tsup class duplication fix (EVID-018 P2 finding) — separate Wave 6+ ADR.

## Strategy markers

| Track | Marker |
|---|---|
| T1 pg-storage | F+ (additive — new infrastructure impls + env-driven swap; mock fallback preserved) |
| T2 openfga | F+ (additive — gate factory + env-driven swap) |
| T3 async-redis | E+ (enhancement — env config flip activates existing gated paths) |
| T4 oxlint | F+ (additive — supplementary linter + new script; eslint preserved) |
| T5 migrations | F+ (additive — new tooling + scripts) |
| T6 docker-compose | F+ (additive — new orchestration files + README section) |

## Data Models

### Documents + Chunks SQL schema (Track 1, W-3-11-1)

```sql
-- 001_init_documents_chunks.up.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id           uuid        PRIMARY KEY,
  tenant_id    text        NOT NULL,
  owner_uuid   text        NOT NULL,
  text         text        NOT NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_owner
  ON documents (tenant_id, owner_uuid);

CREATE TABLE IF NOT EXISTS chunks (
  id           uuid        PRIMARY KEY,
  document_id  uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal      int         NOT NULL,
  text         text        NOT NULL,
  vector       vector(768) NOT NULL,
  tenant_id    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document
  ON chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_tenant
  ON chunks (tenant_id);

-- HNSW vector index (per ADR-011 Decision A R-3)
CREATE INDEX IF NOT EXISTS idx_chunks_vector_hnsw
  ON chunks USING hnsw (vector vector_cosine_ops);

-- Tracking table for migration runner (Decision E TBD ADI)
CREATE TABLE IF NOT EXISTS pg_migrations (
  version      int         PRIMARY KEY,
  name         text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now()
);
```

### OpenFGA model.fga (Track 2, W-3-11-9, **TBD per ADI Decision B**)

Initial draft (B2 tenant-hierarchy):

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
    define reader: member from tenant
    define writer: member from tenant
```

Bootstrap tuples (W-3-11-10):

```yaml
- user: user:default
  relation: member
  object: tenant:tenant-acme
- user: tenant:tenant-acme
  relation: tenant
  object: document:*  # wildcard — all documents owned by tenant
```

(Note: wildcards in tuples may require OpenFGA conditional types — to be verified during ADI + Build.)

## Acceptance Checklist

- [ ] T1 (W-3-11-1..8): Postgres+pgvector schema + adapters + tests; cross-tenant query filter verified.
- [ ] T2 (W-3-11-9..15): OpenFGA gate + model + bootstrap; cross-tenant DENY verified at gate (not application).
- [ ] T3 (W-3-11-16..19): BullMQ + Redis cacher activated by default; existing gated paths verified.
- [ ] T4 (W-3-11-20..23): oxlint workspace integration; full repo `lint:fast` ≤ 2s.
- [ ] T5 (W-3-11-24..26): migration tooling per Decision E (post-ADI); idempotency verified.
- [ ] T6 (W-3-11-27..33): docker-compose orchestration + README Production Setup; clean-machine onboarding ≤ 5 min.
- [ ] T7 (W-3-11-34..40): full repo verify both modes (mock-default + real-infra); 5 changesets; CLAUDE.md updated.
- [ ] T8 (W-3-11-41..46): post-Build audit + EVID-019 + commit + Hindsight Group 44.

## Risks (delta vs ADR-011 Risks)

| ID | Risk | Mitigation |
|---|---|---|
| R-S1 | Migration runner CLI bug → corrupt state (E1 raw SQL approach) | Idempotency per ADR-011 I-3 + adversarial test (apply twice in CI) |
| R-S2 | OpenFGA wildcards-in-tuples don't match library version (B2 model) | Pre-Build security reviewer attests model + ADI verifies before Build commits |
| R-S3 | docker-compose healthcheck timing race | Use `depends_on: condition: service_healthy`; document min Docker version |
| R-S4 | oxlint adds incompatible rule that breaks existing files | Mitigation: per-file `// oxlint-disable` comments; supplementary mode (eslint catch-all preserves CI) |
| R-S5 | pgvector HNSW index creation slow on first run (>30s) | Defer to migration script log message — "first run may take ~30s for index build"; precompute fixture seed on docker-compose init for tests |

## File ownership matrix

| Worker | Owns |
|---|---|
| **pg-storage-worker** (T1) | `examples/m9s-example/migrations/001_*.sql`; `examples/m9s-example/scripts/migrate.ts`; `examples/m9s-example/src/infrastructure/{pg-document.repository.ts,pg-vector.store.ts}`; `examples/m9s-example/tests/real-infra/pg-vector.test.ts`; partial `src/composition/infrastructure.ts` (Pg* selection branch only); partial `project.config.ts` (PG-related env). |
| **openfga-worker** (T2) | `examples/m9s-example/openfga/{model.fga,bootstrap-tuples.yaml}`; `examples/m9s-example/scripts/openfga-bootstrap.ts`; `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts`; `examples/m9s-example/tests/real-infra/openfga.test.ts`; partial `src/composition/infrastructure.ts` (gate selection branch); partial `project.config.ts` (auth env). |
| **queue-worker** (T3) | `examples/m9s-example/.env.example` (REDIS_URL section); partial `src/composition/infrastructure.ts` (cache driver selection); `examples/m9s-example/tests/real-infra/bullmq.test.ts`. |
| **oxlint-worker** (T4) | `.oxlintrc.json` (workspace root, NEW); root `package.json` (`lint:fast` script — but this is also team-lead Phase B scope — **resolution**: oxlint-worker drafts script, team-lead Phase B finalizes); per-package `.oxlintrc.json` overrides if needed. |
| **docker-compose-worker** (T6) | `examples/m9s-example/docker-compose.yml`; `examples/m9s-example/docker/{postgres-init.sql,openfga-init.sh,ollama-pull-model.sh}`; partial `.env.example` (orchestration env). |
| **docs-worker** | `examples/m9s-example/README.md` Production Setup section; `KNOWN-ISSUES.md` (close m9s mock entries). |
| **team-lead Phase B** | `pnpm-lock.yaml`; `.changeset/sprint-3-11-*.md` (5 NEW); `CLAUDE.md` tier-table row; root `package.json` finalize lint:fast script if oxlint-worker drafted. |

**Conflict-free guarantee**:
- `src/composition/infrastructure.ts` touched by 3 workers (pg-storage, openfga, queue) but each owns disjoint code branches (storage vs gate vs cache). Coordinate via clear method-level boundaries OR have ONE worker (pg-storage as senior, owns full file post-rebase) take ownership; others provide branch patches. **Resolution**: pg-storage-worker takes full ownership of `infrastructure.ts`; openfga-worker + queue-worker submit branch patches as **comments in their reports** for pg-storage-worker to integrate during Phase B handoff.
- `project.config.ts` touched by 2 workers (pg-storage, openfga). Same resolution as above.
- `.env.example` touched by queue-worker + docker-compose-worker. **Resolution**: docker-compose-worker takes full ownership; queue-worker comments REDIS_URL section.
- All other paths disjoint.

## Implementation Plan — AgentTeams

### Phase 1: ADI on contested decisions (team-lead, ~10 min × 2 ADI runs)

- **1.1** `forgeplan_reason ADR-011` — primary ADI. Surfaces hypotheses on Decisions B (OpenFGA model) + E (migration tooling).
- **1.2** Synthesize ADI output → Amendment 1 to ADR-011 + revise affected SPEC W-items.

### Phase 2: Pre-Build audit (5∥ reviewers, ~10-15 min)

- architect-reviewer / security-reviewer (CRITICAL for OpenFGA) / ddd-reviewer / typescript-reviewer / docs-reviewer.

### Phase 3: Build (4-6∥ workers, ~50-90 min wall-clock)

- 6 workers per disjoint scope (T1-T6 + docs subsumed in docker-compose-worker for unified README ownership). **Or** 5 workers if oxlint-worker scope merged into team-lead Phase B (smallest track).

### Phase 4: Phase B verify + Post-Build audit (team-lead solo + 4-6∥ reviewers, ~25-35 min)

### Phase 5: Phase D — EVID-019 + commit + Hindsight Group 44 (~10 min).

## Affected Files

### Wave 1 modifies/creates

- 8 files per pg-storage-worker scope.
- 7 files per openfga-worker scope.
- 3 files per queue-worker scope (mostly env).
- 1 file per oxlint-worker scope (`.oxlintrc.json`) + drafted script.
- 5 files per docker-compose-worker scope.
- 2 files per docs-worker scope.

### Wave 2 (team-lead Phase B)

- `pnpm-lock.yaml`
- `.changeset/sprint-3-11-{pg-storage,openfga,async-redis,oxlint,docker-compose}.md` (NEW × 5)
- `CLAUDE.md` (tier-table + production-grade reference status note)
- root `package.json` finalize `lint:fast` script

### Wave 4 (team-lead Phase D)

- New EVID-019 artifact via `forgeplan_new`.

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-004 (Sprint 3.11 vision) | PRD | based_on |
| ADR-011 (Sprint 3.11 decisions) | ADR | based_on |
| RFC-002 (cross-package strategy) | RFC | refines |
| ADR-005 (storage-core IStorageProvider) | ADR | informs |
| ADR-007 (runtime-context middleware) | ADR | informs |
| EVID-018 (Sprint 3.10 Addendum 2) | Evidence | informs |
| KNOWN-ISSUES | Doc | informs (Sprint 3.11 closes m9s-example mock entries) |

> **Next step**: ADI on ADR-011 contested Decisions B + E → revise W-3-11-9..15 + W-3-11-24 per ADI outcome → SPEC-016 Amendment 1 → pre-Build audit → Build (4-6∥) → Phase B → post-Build audit → EVID-019 + commit + Hindsight Group 44.





