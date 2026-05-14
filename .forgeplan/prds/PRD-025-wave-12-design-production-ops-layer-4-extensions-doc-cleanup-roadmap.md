---
depth: standard
id: PRD-025
kind: prd
last_modified_at: 2026-05-14T14:10:23.975694+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-024
  relation: based_on
status: active
title: Wave 12 design — Production ops layer + 4 extensions + doc cleanup roadmap
---

## Problem Statement

After Wave 11.A (PR #23 — production hardening: real auth + Redis rotation + SSE caps + CORS + Button) and Wave 11.B (PR #24 — `defineAction` upstream + `JwtClaims` shared), `m9s-example` is **secure but not operationally-complete**. To clone-and-deploy as a real reference template, it lacks 5 ops-layer items, and the audit P3 backlog still has 4 "examples-of-patterns" extensions plus doc/state drift.

This PRD is a **design specification** — captures architectural decisions for everything left in the Wave 10/11 closure surface. Implementation is split into 3 phases (see RFC-017) so each phase ships as a focused PR with smoke-green guarantee.

## Three logical groupings

**A. Production ops layer** (5 items — ~600-800 LOC, makes "deploy and observe")
1. **Observability** — OpenTelemetry traces + structured logs to stdout (JSON-line) + Prometheus `/metrics` endpoint.
2. **Health/readiness endpoints** — `GET /health` (liveness — process is up) + `GET /ready` (readiness — deps reachable: PG, Redis, Ollama optional).
3. **Graceful shutdown** — SIGTERM handler drains in-flight HTTP + closes BullMQ workers + closes Redis + waits for pending broker calls; max grace 30s.
4. **Migrations runner on startup** — auto-apply pending PG migrations under advisory lock (avoid race when multiple replicas boot together); idempotent; opt-in via `AUTO_MIGRATE=true`.
5. **Rate limiter enabled by default in prod** — `@gertsai/api-rlr` is wired but currently gated by `RLR_ENABLED + REDIS_URL`. Production default flips to enabled with sensible quotas.

**B. 4 extensions** (showcases of established patterns — ~400-600 LOC)
6. **OIDC integration** — `IUserRepo` Auth0 / Keycloak / Google adapter via `passport-openidconnect`. Demonstrates "swap the adapter, port stays" hex pattern.
7. **Real PG user DB** — `PrismaUserRepo` adapter. Same pattern as `PgDocumentRepository` (already exists). Adds `users` migration + Prisma schema or raw SQL.
8. **Storybook CI deploy** — `.github/workflows/storybook.yml` builds `storybook-static` and deploys to GitHub Pages on every main push.
9. **oxlint sweep** — fix the 1511 warnings. Most are auto-fix'able via `--fix`; manual review for the rest.

**C. Doc + state closeout** (~150 LOC)
10. **CLAUDE.md** updated with Wave 11 details (current text describes Wave 7-10).
11. **KNOWN-ISSUES.md** — remove resolved entries, add new known-but-acceptable items (in-memory rotation default, etc.).
12. **Activate `PRD-016`** (Wave 10 super-PRD) — currently still in draft after sub-waves merged.
13. **`README.md` + `CONTRIBUTING.md`** in m9s-example — quickstart + dev/prod boot paths.

## Goals

1. Phase A ships m9s-example as a **deployable reference** — `docker compose up + curl /ready` works without manual intervention.
2. Phase B adds **2 more pattern showcases** (OIDC, Prisma) for downstream developers cloning the repo as a starter.
3. Phase C closes **all open forgeplan artifacts** and lifts m9s-example to its first "good template" state for OSS visibility.
4. Each phase ships as a separate PR with green smoke; no big-bang merge.

## Target Audience

- **Primary:** external developers cloning m9s-example as a SvelteKit + `@gertsai/*` starter for their own deployment.
- **Secondary:** OSS visitors evaluating `@gertsai/*` — they read `README.md` + `CLAUDE.md` first and decide based on what they see.

## Functional Requirements

### Phase A — Production ops layer

- [ ] **FR-A1 — Observability**: OTel SDK initialised at boot via `@gertsai/otel` (existing pkg) for traces; structured JSON-line logs via `@gertsai/logger-factory` (existing); Prometheus `/metrics` HTTP endpoint via `prom-client`. Traces export via OTLP HTTP (configurable endpoint). Metrics export via scrape.
  - **Acceptance:** `curl /metrics` returns Prometheus format with at least `http_requests_total`, `http_request_duration_seconds`, `ingest_documents_total`, `ingest_chunks_total`.
- [ ] **FR-A2 — Health/readiness**: `GET /health` returns `200 {status: 'ok'}` if process is up. `GET /ready` returns `200 {status: 'ready', checks: {pg: 'ok', redis: 'ok'|'skipped', ollama: 'ok'|'skipped'}}` if all reachable; `503 {status: 'not-ready', failedCheck}` otherwise. Each check has 1s timeout; readiness probe should fail fast on cold-start when deps aren't ready yet.
  - **Acceptance:** k8s-style probe semantics — liveness never fails for transient dep outages; readiness reflects current dep state.
- [ ] **FR-A3 — Graceful shutdown**: `process.on('SIGTERM', ...)` triggers ordered cleanup: (1) stop accepting new HTTP connections via moleculer-web server.close(); (2) drain in-flight requests (~10s wait); (3) close BullMQ workers (let in-flight jobs finish or be requeued); (4) close Redis connections; (5) close PG pool. Max grace 30s — after that, hard exit. Logs each phase.
  - **Acceptance:** sending `SIGTERM` mid-request — running request completes, but new connections refused; process exits within 30s.
- [ ] **FR-A4 — Migrations runner**: new `scripts/migrate-on-boot.ts` runs all `migrations/*.up.sql` not yet applied, under PG advisory lock `(13371337)` so concurrent replicas serialise. Records applied versions in `pg_migrations` table (already in migration 001). Skip if `AUTO_MIGRATE !== 'true'`. Lifecycle: imported by `src/index.ts` BEFORE broker start. Failure → process exit with clear error.
  - **Acceptance:** with `AUTO_MIGRATE=true`, starting against a fresh PG creates schema; restarting is idempotent (no errors).
- [ ] **FR-A5 — Rate limiter default**: `RLR_ENABLED` defaults to `true` when `NODE_ENV === 'production'` AND `REDIS_URL` is set (currently default `false`). New env `RLR_DEFAULT_BURST` / `RLR_DEFAULT_LIMIT` with prod-sensible numbers (e.g., 60 req/min/IP, burst 10).
  - **Acceptance:** prod boot with Redis configured — 100 rapid requests from same IP — last ~40 get 429.

### Phase B — 4 extensions

- [ ] **FR-B1 — OIDC integration**: new `examples/m9s-example/src/services/auth/src/oidc-user-repo.ts` implementing `IUserRepo` via `passport-openidconnect`. Env config: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL`. New routes `GET /api/v1/auth/oidc/start` + `GET /api/v1/auth/oidc/callback`. Composition root picks `OidcUserRepo` over `InMemoryUserRepo` when `OIDC_ISSUER` set.
- [ ] **FR-B2 — PrismaUserRepo**: new `examples/m9s-example/src/infrastructure/prisma-user.repo.ts` implementing `IUserRepo` via Prisma or raw SQL (no Prisma dep added — use existing `@gertsai/pg-client`). New `migrations/003_users_table.up.sql` adds `users` table. Composition root selects when `PG_USERS_ENABLED=true`.
- [ ] **FR-B3 — Storybook CI**: `.github/workflows/storybook.yml` — on main push, build storybook-static + deploy to GitHub Pages. Requires `pages: write` + `id-token: write` permissions in workflow.
- [ ] **FR-B4 — oxlint sweep**: `pnpm oxlint --fix` first pass (auto-fix), then manual review of remaining. Target: 0 warnings (or documented allowlist).

### Phase C — Doc + state closeout

- [ ] **FR-C1 — CLAUDE.md update**: add Wave 11.A/B/C sections; list active PRDs (021-025); update package count, file ownership map for example app; refresh red-line rules.
- [ ] **FR-C2 — KNOWN-ISSUES.md refresh**: remove items closed by Waves 10.D/E + 11.A/B. Add new known-acceptable: in-memory rotation default, demo user passwords in env, single-replica migration on boot.
- [ ] **FR-C3 — PRD-016 activate**: Wave 10 super-PRD currently in draft post-closure. Activate it now that all sub-waves landed; document final R_eff in the artifact body.
- [ ] **FR-C4 — README + CONTRIBUTING for m9s-example**: quickstart (`docker compose up + pnpm install + pnpm migrate:up + pnpm dev`) + prod boot path (`AUTO_MIGRATE=true OIDC_ISSUER=... NODE_ENV=production node dist/index.js`).

## Non-Functional Requirements

**NFR-1 — Phased rollout**
  - Each phase ships separately. Failure in Phase B does not block Phase A.
  - Phase A is the only one with deploy-blocker semantics. Phases B + C are quality-of-life.

**NFR-2 — Smoke gates per phase**
  - Backend tsc, web svelte-check, lint, tests stay green across each phase.
  - Phase A adds tests for migration runner + health/ready + graceful shutdown signal handling.
  - Phase B adds smoke for OIDC callback flow (mocked OIDC server) + Prisma user repo.

**NFR-3 — Backward compatibility**
  - All current dev-mode flows (in-memory auth, no Redis, no PG migrate) keep working — production features are opt-in via env.

**NFR-4 — Documentation honesty**
  - CLAUDE.md / KNOWN-ISSUES.md / README must reflect CURRENT state. No stale references to demo-mode shortcuts that no longer exist.

## Stakeholders

- **Owner:** `examples/m9s-example/`, `examples/m9s-example-web/`, `.github/workflows/`, root docs.
- **Reviewers:** future cloning developers (the primary audience).

## Related Artifacts

- [[PRD-023]] / [[EVID-040]] — Wave 11.A predecessor (production hardening).
- [[PRD-024]] / [[EVID-041]] — Wave 11.B predecessor (helpers upstream).
- [[EVID-036]] — audit findings (some items in this PRD close remaining P3 backlog).
- [[PRD-016]] — Wave 10 super-PRD (FR-C3 activates).
- [[ADR-002]] — Hex layer (all new adapters/ports respect this).
- [[ADR-009]] — `@gertsai/logger-factory` consumed by FR-A1.

## Out of Scope

- Multi-region replication / sticky sessions.
- WAF / DDoS mitigation at infra layer.
- CI-driven npm publish workflow (that's a separate ops concern; pending IRREVERSIBLE Y per package).
- Frontend (SvelteKit) Sentry / RUM integration — separate concern.
- Visual regression (Chromatic) for Storybook.
- E2E Playwright in CI — separate small PR.





