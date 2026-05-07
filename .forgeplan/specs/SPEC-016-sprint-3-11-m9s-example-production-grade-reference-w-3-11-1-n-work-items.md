---
depth: standard
id: SPEC-016
kind: spec
last_modified_at: 2026-05-07T13:34:50.716915+00:00
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

Sprint 3.11 = production-grade m9s-example per PRD-004 + ADR-011 (with Amendment 1 ADI + Amendment 2 Pre-Build audit synthesis). 6 disjoint tracks executed by 4-6∥ AgentTeams workers. Strictly **m9s-example only** (per ADR-011 I-2). Branch `feat/sprint-3-11-production-grade-m9s-example` off `feat/sprint-3-10-wave-5-polish`.

Estimated 16-18h ≈ 1 working week. Pre-Build audit complete (5∥ reviewers, 24 findings). Decisions B (B2 Tenant-hierarchy) + E (E1 Raw SQL) LOCKED via ADI.

## Scope (W-items — see Amendment 1 for revisions)

### Track 1: Postgres + pgvector storage (T1, F+ marker)

- **W-3-11-1**: NEW `migrations/001_init_documents_chunks.up.sql` — normalized schema + HNSW index + `pg_migrations` tracking table. All `IF NOT EXISTS` per I-3.
- **W-3-11-2**: NEW `migrations/001_init_documents_chunks.down.sql` — rollback pair.
- **W-3-11-3**: NEW `scripts/migrate.ts` — E1 raw SQL runner per Amendment 1 §A1.4 LOCKED. Per Amendment 2 §A2.6: `pg_advisory_xact_lock` + hard-coded path + `typia.assert<MigrateCommand>` argv (I-15).
- **W-3-11-4**: NEW `infrastructure/pg-document.repository.ts` — `PgDocumentStore implements IDocumentStore` (per Amendment 2 §A2.5: NOT IDocumentRepository). Uses `PgClient` raw via `pg-client.adapter.ts`. Post-INSERT writes per-document OpenFGA tuple.
- **W-3-11-5**: NEW `infrastructure/pg-vector.store.ts` — `PgVectorStore implements IChunkStore`. Every SQL `WHERE tenant_id = $1` (I-13).
- **W-3-11-6**: MODIFY `composition/infrastructure.ts` — env-driven backend selection via `oneOf` helper + exhaustive `assertNever`.
- **W-3-11-7**: MODIFY `project.config.ts` — env vars `STORAGE_PROVIDER`, `POSTGRES_URL`, `MIGRATIONS_AUTO_APPLY` via `oneOf`/`bool` helpers.
- **W-3-11-8**: NEW `tests/real-infra/pg-vector.test.ts` — env-gated. ≥3 tests + tenant isolation adversarial test (I-13).

### Track 2: OpenFGA real authorization gate (T2, **E+** marker per Amendment 2 §A2.13)

Per ADR-011 Decision B (LOCKED B2 Tenant-hierarchy via Amendment 1 ADI). Decision B revised by Amendment 2 §A2.1-A2.4.

- **NEW W-3-11-8a** (per Amendment 2 §A2.3, BEFORE openfga-worker commits): Pre-Build OpenFGA wildcard live-spike. Docker run `openfga/openfga`, write per-document tuple, verify check semantics. ~15 min.
- **W-3-11-9**: NEW `openfga/model.fga` — canonical FgaResourceType (`tenant`/`document`) + `can_view`/`can_edit` relations from `FGA_RELATIONS`. NO custom `reader`/`writer`.
- **W-3-11-10**: NEW `openfga/bootstrap-tuples.yaml` — seed `(user:default, member, tenant:tenant-acme)` only. NO `document:*` wildcard. Per-document tuples written at ingest by W-3-11-4.
- **W-3-11-11**: NEW `scripts/openfga-bootstrap.ts` — idempotent store/model/tuple seeding.
- **W-3-11-12**: **MODIFY** existing `infrastructure/openfga-permission.gate.ts` (per Amendment 2 §A2.1: file already exists 88 LOC). Extend action→relation map. Use canonical `FgaResourceType` enum. Wire `FGA_API_URL`/`FGA_STORE_ID`/`FGA_API_TOKEN`. Catch + log cause + return false (no rethrow per A2.4). Stateless (I-14).
- **W-3-11-13**: MODIFY `composition/infrastructure.ts` — env-driven gate selection. AllowAll refuses NODE_ENV='production' (I-12).
- **W-3-11-14**: MODIFY `project.config.ts` — env vars **`FGA_API_URL`/`FGA_STORE_ID`/`FGA_API_TOKEN`** (NOT OPENFGA_* per Amendment 2 §A2.7). `AUTH_GATE` ('openfga' | 'allow-all').
- **W-3-11-15**: NEW `tests/real-infra/openfga.test.ts` — env-gated. ≥4 tests: same-tenant ALLOW, cross-tenant DENY, missing tuple DENIED, OpenFGA unreachable DENIED. + I-12 production guard test. + p50 latency benchmark (Amendment 1 §A1.3 H1, NFR-1 < 100ms).

### Track 3: BullMQ async + Redis cacher activation (T3, E+ marker)

- **W-3-11-16**: MODIFY `.env.example` — `REDIS_URL=redis://localhost:6379` default.
- **W-3-11-17**: MODIFY `composition/infrastructure.ts` — env-driven `RedisCacheDriver`/`MemoryCacheDriver` swap. Named import `RedisCacheDriver` from `@gertsai/m9s-cache` (per RFC-002 §Edge 4 verification).
- **W-3-11-18**: VERIFY existing `if (config.REDIS_URL)` paths fire correctly under default env. No code changes.
- **W-3-11-19**: NEW `tests/real-infra/bullmq.test.ts` — env-gated. ≥3 tests + **eventual consistency contract test** (per Amendment 2 §A2.9): `mode='queued'` IMMEDIATELY → polling search returns `[]` → worker completes → search returns docId. NO race-condition error.

### Track 4: oxlint workspace integration (T4, F+ marker)

- **W-3-11-20**: NEW workspace root `.oxlintrc.json` — `correctness` + `suspicious` + `pedantic` rules.
- **W-3-11-21**: MODIFY root `package.json` — add `lint:fast` script.
- **W-3-11-22**: VERIFY full repo `pnpm lint:fast` ≤ 2s wall clock (NFR-1).
- **W-3-11-23**: MODIFY CI workflow — add `lint:fast` step alongside existing `lint`.

### Track 5: Migration tooling (T5, F+ marker, LOCKED E1 per Amendment 1)

- **W-3-11-24**: Implement E1 raw SQL custom runner per Amendment 2 §A2.6 + I-15 (advisory lock, hard-coded path, typia argv, `pg_migrations` tracking table). NO drizzle-kit/Prisma.
- **W-3-11-25**: ADD `pnpm migrate:up` + `migrate:down` + `migrate:status` scripts to `package.json`.
- **W-3-11-26**: VERIFY idempotency per I-3 — `migrate:up` twice = no-op second time.

### Track 6: docker-compose orchestration (T6, **E+** marker per Amendment 2 §A2.13)

Per Amendment 2 §A2.8: existing docker-compose.yml MODIFY (NOT NEW).

- **W-3-11-27**: **MODIFY** existing `docker-compose.yml`. Preserve NATS + Redis. ADD `postgres` (pgvector/pgvector:pg16), `openfga` (openfga/openfga:v1.x), `ollama` (ollama/ollama:latest). Healthchecks gate broker start (I-8). Pin image versions (NFR-4).
- **W-3-11-28**: NEW `docker/postgres-init.sql` — pgvector extension creation.
- **W-3-11-29**: NEW `docker/openfga-init.sh` — Ollama model pull + OpenFGA bootstrap.
- **W-3-11-30**: NEW `docker/ollama-pull-model.sh` — pulls `nomic-embed-text` idempotently.
- **W-3-11-31**: MODIFY `.env.example` — comprehensive env list (skeleton inlined per Amendment 1 §A1.4).
- **W-3-11-32**: MAJOR ADDITION `examples/m9s-example/README.md` — `## Production Setup` section per Sprint 3.6 §template (outline inlined per Amendment 1 §A1.2).
- **NEW W-3-11-32a** (per Amendment 1 §A1.1 docs P1): NEW `openfga/README.md` — ReBAC vs RBAC, tuple shape walkthrough, add-tenant procedure, adversarial test cmd.
- **NEW W-3-11-32b** (per Amendment 1 §A1.1 docs P1): NEW `migrations/README.md` — file naming, pg_migrations tracking, rollback semantics, idempotency contract.
- **W-3-11-33**: VERIFY clean-machine onboarding ≤ 5 min (NFR-2 + G-2). Captured in EVID-019.

### Track 7: Phase B Integration (T7, team-lead solo)

- **W-3-11-34**: `pnpm install`.
- **W-3-11-35**: `pnpm build` sequential (`--workspace-concurrency=1`).
- **W-3-11-36**: `pnpm test` mock-mode default — verify all 24 m9s tests + 8 e2e + Sprint 3.10 Addendum 2 PASS unchanged.
- **W-3-11-37**: `docker-compose up -d` then `pnpm test:real-infra` — full real-infra suite PASS (4 backend test files).
- **W-3-11-38**: `pnpm typecheck` + `depcruise` + `lint` + `lint:fast` + `publint` — all green.
- **W-3-11-39**: 5 changesets per Amendment 1 §A1.3 inline bodies.
- **W-3-11-40**: MODIFY `CLAUDE.md` per Amendment 1 §A1.5 inline diff.

### Track 8: Phase D Audit + Evidence (T8, team-lead solo)

- **W-3-11-41**: Post-Build fidelity audit — 4-6∥ reviewers per Track.
- **W-3-11-42**: Address P0/P1 findings.
- **W-3-11-43**: Create EVID-019 (CL3, supports). Linked informs PRD-004 + ADR-011 + SPEC-016 + EVID-018.
- **W-3-11-44**: Activate SPEC-016 (final).
- **W-3-11-45**: Single atomic commit.
- **W-3-11-46**: Hindsight retain Group 44.
- **NEW W-3-11-46a** (per Amendment 1 §A1.1 docs P2): KNOWN-ISSUES.md cleanup — close mock PgClient entry + other m9s mock-vs-real entries.
- **NEW W-3-11-46b** (per Amendment 1 §A1.1 typescript / Amendment 2 §A2.10): NEW `infrastructure/document.meta.ts` with `defineStorageMetadata<DocumentRow, DocumentWrite>()`.

## Out of scope

- `@gertsai/*` package source changes (ADR-011 I-2).
- Multi-region patterns.
- `@gertsai/otel` wiring — Wave 6+.
- `apps/pipeline` migration.
- v0.2.0 publish gate — separate user `Y`.
- runtime-context tsup class duplication fix (EVID-018 P2) — Wave 6+ ADR.

## Strategy markers (per Amendment 2 §A2.13)

| Track | Marker |
|---|---|
| T1 pg-storage | F+ (new files) |
| T2 openfga | **E+** (revised — extends existing gate) |
| T3 async-redis | E+ |
| T4 oxlint | F+ |
| T5 migrations | F+ (new tooling) |
| T6 docker-compose | **E+** (revised — extends existing compose.yml) |

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

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_vector_hnsw ON chunks USING hnsw (vector vector_cosine_ops);

CREATE TABLE IF NOT EXISTS pg_migrations (
  version      int         PRIMARY KEY,
  name         text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now()
);
```

### OpenFGA model.fga (per Amendment 2 §A2.2 — canonical FgaResourceType)

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

Bootstrap tuples (per Amendment 2 §A2.3):
```yaml
- user: user:default
  relation: member
  object: tenant:tenant-acme
# NO wildcard. Per-document tuples written at ingest by pg-document.repository.ts.
```

## Acceptance Checklist

- [ ] T1 (W-3-11-1..8): Postgres+pgvector schema + adapters + tests; cross-tenant filter verified (I-13).
- [ ] T2 (W-3-11-8a..15): OpenFGA gate MODIFIED + canonical model + bootstrap; cross-tenant DENY at gate; pre-Build live-spike completed.
- [ ] T3 (W-3-11-16..19): BullMQ + Redis activated; eventual consistency contract test passes.
- [ ] T4 (W-3-11-20..23): oxlint workspace; full repo `lint:fast` ≤ 2s.
- [ ] T5 (W-3-11-24..26): E1 migration tooling; idempotency verified.
- [ ] T6 (W-3-11-27..33 + 32a/32b): docker-compose extended; README Production Setup; ≤ 5 min onboarding.
- [ ] T7 (W-3-11-34..40): full repo verify both modes; 5 changesets; CLAUDE.md.
- [ ] T8 (W-3-11-41..46 + 46a/46b): post-Build audit; EVID-019; commit; Hindsight Group 44.

## Risks (delta vs ADR-011 §Risks)

| ID | Risk | Mitigation |
|---|---|---|
| R-S1 | Migration runner CLI bug → corrupt state | I-3 + I-15 (advisory lock + adversarial test apply twice) |
| R-S2 | OpenFGA wildcards-in-tuples invalid syntax | Pre-Build live-spike W-3-11-8a (per Amendment 2 §A2.3); per-document tuple fallback documented |
| R-S3 | docker-compose healthcheck timing race | `depends_on: condition: service_healthy`; Docker Compose v2; min v24+ |
| R-S4 | oxlint rule incompatibilities | Supplementary mode (I-7); per-file `// oxlint-disable` |
| R-S5 | pgvector HNSW index slow first run >30s | Migration script log message; precompute fixture seed for tests |

## File ownership matrix (revised per Amendment 1 §A1.7)

| Worker | Owns |
|---|---|
| **pg-storage-worker** (T1) | `migrations/001_*.sql`; `scripts/migrate.ts`; `infrastructure/{pg-document.repository,pg-vector.store,pg-client.adapter,document.meta}.ts` (NEW × 4); `tests/real-infra/pg-vector.test.ts`; FULL ownership `composition/infrastructure.ts` (with TODO markers for openfga + queue patches); partial `project.config.ts` (PG-related env). |
| **openfga-worker** (T2 — E+) | `openfga/{model.fga,bootstrap-tuples.yaml}`; `scripts/openfga-bootstrap.ts`; **MODIFY** `infrastructure/openfga-permission.gate.ts`; `tests/real-infra/openfga.test.ts`; partial `project.config.ts` (FGA env). Submits branch patch to pg-storage-worker for `composition/infrastructure.ts` gate selection branch. **MUST run W-3-11-8a live-spike BEFORE committing model.fga.** |
| **queue-worker** (T3) | `tests/real-infra/bullmq.test.ts`; submits branch patch for `composition/infrastructure.ts` cache-driver branch + `.env.example` REDIS_URL section. |
| **oxlint-worker** (T4) | `.oxlintrc.json` (workspace root); root `package.json` `lint:fast` script (handed to team-lead Phase B for finalization). |
| **docker-compose-worker** (T6 — E+) | **MODIFY** `docker-compose.yml`; `docker/{postgres-init.sql,openfga-init.sh,ollama-pull-model.sh}` (NEW × 3); FULL ownership `.env.example`. |
| **docs-worker** | `examples/m9s-example/README.md` Production Setup; `examples/m9s-example/openfga/README.md` (NEW); `examples/m9s-example/migrations/README.md` (NEW); `KNOWN-ISSUES.md`. |
| **team-lead Phase B** | `pnpm-lock.yaml`; `.changeset/sprint-3-11-*.md` (NEW × 5); `CLAUDE.md`; root `package.json` finalize. |

**Conflict-free guarantee**: pg-storage-worker takes full `composition/infrastructure.ts` ownership with TODO markers (per architect-reviewer recommendation); openfga-worker + queue-worker submit branch patches as report comments. docker-compose-worker takes full `.env.example`; queue-worker submits patch.

## Implementation Plan — AgentTeams

### Phase 0: Pre-Build OpenFGA wildcard live-spike (~15 min, BEFORE Build)

W-3-11-8a per Amendment 2 §A2.3 — verifies tuple semantics with per-document writes against live OpenFGA.

### Phase 1: Build (4-6∥ workers, ~50-90 min)

6 workers per file ownership matrix.

### Phase 2: Phase B verify (team-lead solo, ~10-15 min)

### Phase 3: Post-Build fidelity audit (4-6∥ reviewers, ~15 min)

### Phase 4: Phase D — EVID-019 + commit + Hindsight (~10 min)

## Affected Files

See ADR-011 §Affected Files (predicted, per Amendment 2 revisions) for complete enumeration.

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-004 (Sprint 3.11 vision) | PRD | based_on |
| ADR-011 (Sprint 3.11 decisions + Amendments 1+2) | ADR | based_on |
| RFC-002 (cross-package strategy) | RFC | refines |
| ADR-005 (storage-core IStorageProvider) | ADR | informs |
| ADR-007 (runtime-context middleware) | ADR | informs |
| EVID-018 (Sprint 3.10 Addendum 2) | Evidence | informs |
| KNOWN-ISSUES | Doc | informs |

> **Next step**: Pre-Build OpenFGA live-spike (W-3-11-8a) → Build (4-6∥ workers per revised file ownership matrix) → Phase B → post-Build audit → EVID-019 + commit + Hindsight Group 44.

---

## Amendment 1 — Pre-Build audit synthesis (per ADR-011 Amendment 2, 24 findings)

W-item revisions per ADR-011 Amendment 2. Original W-items preserved above; this Amendment lists deltas + inlines templates per docs P1.1-P1.4 (EVID-016 §5 lesson — break the 11-cycle DOC-track regression pattern).

### A1.1 — W-item revision summary (already inlined into §Scope above)

24 W-item revisions + 5 NEW W-items (W-3-11-8a, 32a, 32b, 46a, 46b). All revisions integrated into §Scope tracks above for worker readability.

### A1.2 — README §Production Setup outline (per docs P1.1)

Inline outline (≥40 lines) for docs-worker — Sprint 3.6 §template structure adapted for infra setup:

- §Prerequisites: Docker 24+, Node 22+, pnpm 10.x, ports 5432/6379/8080/4222/11434, ~3GB RAM
- §One-command bring-up: `cp .env.example .env`, `docker compose up -d`, `docker compose ps` healthy wait
- §Apply migrations: `pnpm install`, `pnpm migrate:status`, `pnpm migrate:up` (or auto via `MIGRATIONS_AUTO_APPLY=true`)
- §Boot broker: `pnpm start`
- §Smoke verification: curl ingest + sleep + curl search with expected response shapes
- §Async caveats: `mode='queued'` immediately, search visibility 1-5s window
- §⚠️ SECURITY: `AUTH_GATE=allow-all` refuses NODE_ENV=production (I-12); `FGA_API_TOKEN` required for production; `.env` gitignored; chunks tenant_id filter
- §OpenFGA glossary: DSL→domain UL mapping (5 rows)
- §Tear-down: `docker compose down -v`
- §Common errors: ECONNREFUSED, OpenFGA store not found, Ollama model not pulled, HNSW slow first run

### A1.3 — 5 changeset bodies (per docs P1.2)

5 changeset bodies inlined for team-lead Phase B — see ADR-011 Amendment 2 cross-references:
- `sprint-3-11-pg-storage.md` (patch m9s-example, NEW infra files via pg@8.13)
- `sprint-3-11-openfga.md` (patch m9s-example, MODIFY existing gate, B2 model)
- `sprint-3-11-async-redis.md` (patch m9s-example, env-driven default-on, eventual consistency test)
- `sprint-3-11-oxlint.md` (workspace dev tool, no published bumps)
- `sprint-3-11-docker-compose.md` (patch m9s-example, MODIFY existing compose, real-infra suite)

### A1.4 — `.env.example` skeleton (per docs P1.4)

Inlined skeleton (≥15 lines) for docker-compose-worker — placeholder credentials only:
```bash
# === Storage ===
STORAGE_PROVIDER=postgres   # postgres | memory
POSTGRES_URL=postgres://m9s:change-me-on-deploy@localhost:5432/m9s
MIGRATIONS_AUTO_APPLY=true

# === Authorization (OpenFGA) ===
AUTH_GATE=openfga           # openfga | allow-all
FGA_API_URL=http://localhost:8080
FGA_STORE_ID=               # populated by openfga-bootstrap.ts
FGA_API_TOKEN=              # preshared bearer (REQUIRED for production)

# === Async + cache ===
REDIS_URL=redis://localhost:6379

# === Embedder (Ollama) ===
EMBEDDER_PROVIDER=ollama
EMBEDDER_URL=http://localhost:11434
EMBEDDER_MODEL=nomic-embed-text

# === Real-infra test gates ===
PGVECTOR_E2E=
OPENFGA_E2E=
BULLMQ_E2E=
OLLAMA_E2E=

# === Optional ===
NODE_ENV=development        # AllowAll refuses production (I-12)
TRANSPORT_TYPE=null
```

### A1.5 — CLAUDE.md tier-table row diff (per docs P1.3)

Inline diff for line 392:
```diff
- **Wave 5 fully complete** — 13 packages total ... + Sprint 3.10 closes Wave 5 polish ...
+ **Wave 5 fully complete** — 13 packages total ... + Sprint 3.10 closes Wave 5 polish ... **Sprint 3.11 elevates m9s-example to production-grade reference** — real Postgres+pgvector / OpenFGA ReBAC (B2 tenant-hierarchy via ADI) / BullMQ+Redis / Ollama / docker-compose / oxlint per ADR-011 + Amendment 1 (ADI) + Amendment 2 (24 pre-Build findings) + RFC-002 + EVID-019.
```

### A1.6 — Strategy markers final (per Amendment 2 §A2.13)

T2 openfga: F+ → **E+** (existing gate MODIFY). T6 docker-compose: F+ → **E+** (existing compose MODIFY). All others unchanged.

### A1.7 — File ownership matrix (revised) — see §File ownership matrix above

### A1.8 — Net effect

24 W-item revisions + 5 NEW W-items + 5 inline templates + 2 strategy marker changes. Build proceeds with: (a) Pre-Build OpenFGA live-spike (~15 min), (b) 6 parallel workers per revised file ownership matrix, (c) sequential `pnpm build` Phase B, (d) post-Build fidelity audit, (e) EVID-019 + commit + Hindsight Group 44.

> **Net effect of Amendment 1**: Sprint 3.11 SPEC reconciled with reality. EVID-016 §5 lesson regression averted through inline templates. Build can proceed.

