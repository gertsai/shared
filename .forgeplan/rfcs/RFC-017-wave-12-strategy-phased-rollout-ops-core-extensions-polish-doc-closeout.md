---
depth: standard
id: RFC-017
kind: rfc
last_modified_at: 2026-05-14T14:11:19.190204+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-025
  relation: informs
status: active
title: Wave 12 strategy — phased rollout (ops core + extensions + polish + doc closeout)
---

## Summary

Three-phase rollout of PRD-025 (Production ops layer + 4 extensions + doc closeout). Each phase is **one focused PR** with green smoke. Phase A is the deploy-blocker layer; Phases B + C are quality-of-life.

## Motivation

After Wave 10/11.A/11.B, `m9s-example` is **secure** but not **operationally complete**: no observability, no health/ready, no graceful shutdown, no auto-migrate, no rate limit defaults. To make the reference template "clone-and-deploy" rather than "demo and adapt", these five ops items must land — but as a single monolithic PR they'd be hard to review (~800 LOC + tests). Phasing keeps each PR reviewable in ~30 min.

The 4 extensions (OIDC, Prisma, Storybook CI, oxlint) are **pattern showcases** — not blocking but valuable for the OSS audience.

Doc cleanup (Phase C) reconciles forgeplan artifact state with the actual repo so external readers see consistent docs.

## Context

Wave 10 (PRDs 016-022) closed audit findings. Wave 11.A/B (PRDs 023-024) added production hardening + helper upstream. Wave 11.C ships the design doc (this PRD/RFC) + small/safe Phase C items (doc cleanup + Storybook CI). Wave 12 ships Phase A (the big ops layer). Wave 13 ships Phase B (extensions).

## Proposed Direction

### Phase Map

| Phase | Wave | What ships | LOC | Strategy |
|---|---|---|---|---|
| C — doc closeout | 11.C (NOW) | CLAUDE.md update + KNOWN-ISSUES refresh + PRD-016 activate + README/CONTRIBUTING + Storybook CI workflow | ~250 | Single team-lead pass (no teammates — small + cross-cutting) |
| A — ops core | 12 (next session) | Observability (OTel + Prom) + health/ready + graceful shutdown + auto-migrate + rate limiter defaults | ~700 | 3 teammates: obs/health + shutdown/migrate + rate-limit + small polish |
| B — extensions | 13 | OIDC + Prisma + oxlint sweep | ~500 | 2-3 teammates parallel |

Phase order: **C first** (cheap polish, makes the rest readable). Then A (deploy blockers). Then B (extensions).

### Phase C in detail (NOW)

**File ownership** (single team-lead, no parallel teammates):
- `CLAUDE.md` — add Wave 11 section, update package count, refresh "session start" instructions. (~50 LOC)
- `KNOWN-ISSUES.md` — remove resolved items (auth demo gate, hardcoded secret, in-memory rotation as default). Add new acceptable: 2-user demo seed, single-replica migrations, OIDC TBD. (~30 LOC)
- Activate `PRD-016` via `forgeplan_update + activate` — already in draft after Wave 10 closure. (~no LOC)
- `examples/m9s-example/README.md` — quickstart + prod boot path. (~80 LOC)
- `examples/m9s-example/CONTRIBUTING.md` — dev loop, smoke commands, where to add new actions. (~50 LOC)
- `.github/workflows/storybook.yml` — build + deploy storybook-static to Pages on main push. (~40 LOC)

**Smoke gates**: backend tsc clean, web svelte-check clean, lint clean, tests stay 86+. No new behavior — only docs + 1 workflow.

### Phase A in detail (Wave 12, next session)

**Pre-seed by team-lead** (~10 min):
1. Add deps: `prom-client@^15`, `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` to `examples/m9s-example/package.json`.
2. Stub `src/composition/observability.ts` interface + `src/composition/shutdown.ts` skeleton + `scripts/migrate-on-boot.ts` skeleton.
3. Document teammate file ownership.

**3 teammates parallel**:

- **T-Obs (observability + health)**:
  - `src/composition/observability.ts` (NEW, ~120 LOC) — OTel SDK init + tracer registration + meter creation. Lazy-init pattern: side-effect-free import, explicit `start()` call from `src/index.ts`.
  - `src/composition/metrics.ts` (NEW, ~80 LOC) — `prom-client` registry, 4 core counters/histograms (http_requests_total, http_request_duration_seconds, ingest_documents_total, ingest_chunks_total). Middleware that wraps moleculer-web routes.
  - `src/mol-services/health.service.ts` (NEW, ~100 LOC) — Moleculer service exposing `GET /health` (liveness, always 200 if action runs) + `GET /ready` (parallel-await of pg/redis/ollama pings, 1s timeout each). `GET /metrics` route via prom-client.
  - `src/index.ts` — wire observability start + register health service.

- **T-Lifecycle (shutdown + migrations)**:
  - `src/composition/shutdown.ts` (NEW, ~100 LOC) — `installGracefulShutdown(broker, opts)` registers SIGTERM + SIGINT handlers. Ordered: stop new connections → drain ~10s → close BullMQ workers → close Redis → close PG → exit. Max grace 30s; hard exit timer.
  - `scripts/migrate-on-boot.ts` (NEW, ~80 LOC) — read `migrations/*.up.sql` not yet in `pg_migrations` (sorted by version). Acquire PG advisory lock `(13371337)`. Apply pending. Release lock. Idempotent. Imported by `src/index.ts` BEFORE broker start when `AUTO_MIGRATE === 'true'`.
  - `src/index.ts` — wire shutdown handler + conditional migration runner.

- **T-RateLimit (rate limiter defaults + tests)**:
  - `src/mol-services/api.service.ts` — change `RLR_ENABLED` default from `false` to `process.env.NODE_ENV === 'production' && Boolean(process.env.REDIS_URL)`. Add `RLR_DEFAULT_BURST` + `RLR_DEFAULT_LIMIT` env reads with prod-sensible numbers.
  - `tests/health.test.ts` + `tests/migrate-on-boot.test.ts` + `tests/shutdown.test.ts` — smoke for each (mocked deps where needed).

**Phase A smoke gates**: + 3-5 new tests on baseline 86. Manual: `kill -TERM <pid>` mid-request → request finishes, process exits.

### Phase B in detail (Wave 13)

**Pre-seed**: `passport-openidconnect` dep + new `migrations/003_users.up.sql` + Prisma schema OR raw SQL skeleton.

**2-3 teammates parallel**:

- **T-OIDC**: oidc-user-repo.ts + 2 new routes (oidc/start + oidc/callback) + composition root selector.
- **T-Prisma**: prisma-user.repo.ts (or pg-user.repo.ts using existing `@gertsai/pg-client`) + migration 003 + composition selector.
- **T-Polish**: oxlint --fix sweep + manual review + .oxlintrc cleanup.

## Implementation Phases

**Phase 1 — Wave 11.C (NOW, ~1 hour)**
1. Branch `feat/wave-11-c-prod-ops-design`.
2. Write PRD-025 + RFC-017 (this design).
3. Doc cleanup: CLAUDE.md, KNOWN-ISSUES.md, README, CONTRIBUTING, PRD-016 activate.
4. Storybook CI workflow.
5. Smoke + EVID-042 + commit + PR.

**Phase 2 — Wave 12 (fresh session, ~3 hours)**
1. Pre-seed deps + skeletons.
2. Spawn 3 teammates parallel.
3. Smoke + EVID-043 + commit + PR.

**Phase 3 — Wave 13 (fresh session, ~2 hours)**
1. Pre-seed OIDC dep + migration 003.
2. Spawn 2-3 teammates.
3. Smoke + EVID-044 + commit + PR.

## Decisions

**D-1: Phase order C → A → B (not A → B → C)**
- C first because docs are cheap and unblock readability of larger PRs.
- A second because deploy-blocker.
- B last because pattern showcases (nice-to-have).

**D-2: OTel vs raw Prometheus**
- Both. OTel for traces (distributed tracing across services); prom-client for metrics (operational visibility). They coexist; OTel can also export metrics via OTLP but prom-client is simpler for `/metrics` scrape.

**D-3: prom-client at moleculer-web middleware layer vs ApiController hook**
- Middleware: counts all HTTP requests regardless of action match. Simpler.
- ApiController hook: per-action counters, but doesn't catch 404s. Less complete.
- Pick middleware for HTTP counters; ApiController hooks for domain counters (ingest_documents_total etc.).

**D-4: Graceful shutdown max grace 30s**
- Industry standard k8s default `terminationGracePeriodSeconds = 30`. Match it.

**D-5: AUTO_MIGRATE env opt-in (not always-on)**
- Production deploys should explicitly opt-in to auto-migrate to avoid surprise schema changes on rollback. Default off; CI/CD sets it true.

**D-6: OIDC via passport-openidconnect (not jose / oauth4webapi)**
- Battle-tested, plays well with Express-style middleware (moleculer-web compatible). Adds ~50KB.

**D-7: Prisma vs raw SQL for user repo**
- Raw SQL via `@gertsai/pg-client` (existing). Avoids adding Prisma as a new dep + generator. The pattern is already proven by `PgDocumentRepository`.

## Invariants

- **I-1**: All Phase A features are env-opt-in. Default boot path (no `AUTO_MIGRATE`, no `OIDC_ISSUER`, no `NODE_ENV=production`) keeps the demo running with in-memory user repo + rotation store, exactly as today.
- **I-2**: Hex layer ADR-002 respected — new adapters live in `infrastructure/`, new ports in `domain/ports/`.
- **I-3**: Each phase is one PR; no big-bang merge.
- **I-4**: PRD-016 (Wave 10 super-PRD) activated in Phase 1.

## Rollback Plan

- **Per phase**: revert one PR without affecting others.
- **Per FR**: each FR is env-opt-in; setting the env to `false` reverts behavior even without code change.

## Consequences

**Positive**
- m9s-example becomes a deployable reference (Phase A done).
- 2 more pattern showcases (Phase B).
- Docs match reality (Phase C).
- Each phase is one focused PR (reviewer-friendly).

**Negative**
- Adds ~6 production deps (otel sdks, prom-client, passport-openidconnect).
- Phase A's wave is the largest yet by file count (~12 NEW files + 4 MODIFY).

**Mitigation**
- Phase A devDeps audited per `pnpm install` warning surface.
- Phase A teammate file ownership table prevents conflict.

## Alternatives Considered

**A-1: One mega-PR**
- Rejected: ~1500 LOC, multiple unrelated concerns; impossible to review in one sitting.

**A-2: Phase A → B → C** (deploy blockers first, then extensions, then docs)
- Rejected: docs unblock readability of larger PRs.

**A-3: Skip Phase B entirely**
- Acceptable for "reference template" claim. Keeping it as opt-in because pattern showcase value.

**A-4: Skip OIDC, only Prisma**
- Considered. OIDC is more transferable (every real app needs SSO at some scale); Prisma might be replaced by Drizzle/Kysely in 6 months. Keep OIDC, allow Prisma to be deferred.

**A-5: OTel-only, no prom-client**
- Rejected for now. OTel metrics export via OTLP requires a collector. Prom scrape is zero-infra. Both stay for transition period.

## Validation Plan

1. Pre-flight (each phase): forgeplan health green.
2. Per phase: separate smoke matrix (tsc + check + lint + tests + manual probe for ops features).
3. Phase A: explicit manual tests for graceful shutdown timing + migration idempotency.
4. Phase B: end-to-end OIDC mock test + Prisma adapter unit test.
5. EVID-042/043/044 records per phase.

## References

- [[PRD-023]] / [[EVID-040]] — Wave 11.A.
- [[PRD-024]] / [[EVID-041]] — Wave 11.B.
- [[PRD-016]] — Wave 10 super-PRD (activated in Phase 1).
- [[ADR-002]] — Hex layer.
- [[ADR-009]] — `@gertsai/logger-factory`.




