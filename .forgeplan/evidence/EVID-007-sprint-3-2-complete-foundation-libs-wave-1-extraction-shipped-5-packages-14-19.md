---
depth: standard
id: EVID-007
kind: evidence
last_modified_at: 2026-05-05T20:48:23.983869+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-006
  relation: informs
- target: ADR-004
  relation: informs
- target: PRD-001
  relation: informs
- target: EVID-006
  relation: informs
status: active
title: Sprint 3.2 complete — foundation libs Wave 1 extraction shipped (5 packages, 14 → 19)
---

# EVID-007: Sprint 3.2 complete — foundation libs Wave 1 extraction shipped (5 packages, 14 → 19)

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.2 (SPEC-006) — foundation libs Wave 1 extraction. 5 new Tier 1-2 packages added per ADR-004 redesigned scope (was 6 in PRD-001 FR-016..FR-020): `@gertsai/config` (Shim), `@gertsai/tenant` (Fresh), `@gertsai/otel` (Fresh — renamed from `observe`), `@gertsai/pg-client` (Fresh — renamed from `database`), `@gertsai/queue` (P+F). Monorepo 14 → 19 packages.

3 atomic commits per phase. AgentTeams 5∥ workers wall-clock ~10-15 min для Phase A; Phase B/C ~45 min. **48 новых тестов**, 0 регрессий, все CI gates green.

**Branch**: `feat/api-core-decomposition` (Sprint 2 + 3.0 + 3.1 + 3.0.1 + scope redesign + Sprint 3.2 combined; **18 commits ahead of `main`**).

## Measurement (full repo verify)

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean (workspace 21 projects: 19 packages + m9s-example + root) |
| `pnpm build` | ✅ 19 packages + m9s-example green (ESM+CJS+dts) |
| `pnpm test` | ✅ **4099 passed / 103 skipped** (Sprint 3.0.1 baseline 4051 + 48 new) |
| `pnpm typecheck` | ✅ all green |
| `pnpm run lint` | ✅ All good |
| `pnpm run publint` | ✅ All good (api-core, api-rlr, auth-openfga, hsm, **config**) |
| `pnpm run depcruise` | ✅ 0 violations (98 modules, 192 deps cruised) |
| Per-package `pnpm pack --dry-run` × 5 new | ✅ 0 leak (only dist + README + LICENSE + CHANGELOG) |

## Implementation evidence per task

### W-1 — `@gertsai/config` (Tier 1, Shim, 4 tests, 23d088a)

`packages/config/` thin shim. `src/index.ts` named re-exports `loadConfig` + `createGcpLoggerStream` from `@gertsai/api-core/runtime/node`. Identity-equality test: `configShim.loadConfig === apiCore.loadConfig` (same function reference). Live `loadConfig` env-overlay smoke test passing. README documents shim role; long-term consumers should prefer `@gertsai/api-core/runtime/node` subpath.

### W-2 — `@gertsai/tenant` (Tier 1, **Fresh** chosen, 19 tests, 23d088a)

`packages/tenant/` with multi-subpath shape (root + `/moleculer`). Pure types + helpers (root): `TenantId` brand, `TenantContext`, `MaybeTenantContext`, `getTenantIdStrict` (throws `MissingTenantIdError`), `getTenantIdOptional`, `asTenantId`. Subpath adapter (`/moleculer`): `getMoleculerTenantId/Strict`, `tenantMiddleware()`. `typesVersions` для `/moleculer` (Sprint 3.0.1 F-4 pattern).

**Strategy chosen: F (Fresh)**. Reason: upstream `gertsai_codex/apps/pipeline/src/middlewares/tenant.middleware.ts` solves HTTP-request tenant *resolution* (`extractTenantFromHost/Url/Header`), but SPEC-006 prescribes Moleculer Context.meta.tenantId *consumption* API. Signatures don't overlap; preserving git history would mix unrelated APIs. Per ADR-004 fallback.

19/19 tests: getTenantIdStrict throws on missing/empty/null/undefined-meta; returns brand on valid; getTenantIdOptional returns undefined/brand correctly; asTenantId rejects empty/non-string; MissingTenantIdError shape; Moleculer adapter cases; tenantMiddleware passes through on valid + throws on missing.

### W-3 — `@gertsai/otel` (Tier 1, Fresh, 9 tests, 23d088a)

`packages/otel/` multi-subpath. `setupObservability(opts)` with **version-tolerant Resource API** (tries `resourceFromAttributes` modern → `Resource.create` mid → `new Resource(attrs)` legacy — covers `@opentelemetry/resources` 1.20..1.30+). All OTel SDKs as optional peer-deps; `OtelPeerDepMissingError` on missing with explicit `pnpm add` hint. Subpath `@gertsai/otel/moleculer` exports `withMoleculerTracing(brokerOptions, opts)` adding tracing block to broker config. typesVersions для `/moleculer`.

9/9 tests: `loadPeerDep` helper unit tests (throws on missing, returns module on present, rethrows non-MODULE_NOT_FOUND); `setupObservability` end-to-end smoke (against actual `@opentelemetry/resources@1.30.1`); Moleculer adapter shape transformation.

**Renamed from `@gertsai/observe`** per ADR-004 F-A-1 — collision with upstream ClickHouse-backed LLM-observability SDK avoided для v0.2.0+.

### W-4 — `@gertsai/pg-client` (Tier 1, Fresh, 11 tests, 23d088a)

`packages/pg-client/` agnostic 3-method `PgClient` interface (`$queryRaw` / `$executeRaw` / `$disconnect`) per ADR-011 I-1, I-2 invariants. `mockPgClient(opts)` test fixture (regex pattern matching for canned `$queryRaw` rows / `$executeRaw` counts; recorded queries audit trail; `reset()` clears). `PgClientLike<T>` narrowing helper.

**Strict invariant verification**: `package.json` `dependencies` field absent; `peerDependencies` absent; `devDependencies` only `vitest`. grep `pg|prisma|drizzle|postgres` в `package.json` → only `description` mentions (intentional negation). grep в `dist/index.{js,cjs}` → 0 matches.

11/11 tests: 3× $queryRaw cases (default/match/fallback), 3× $executeRaw (default/match/fallback), 2× recorded captures, reset, $disconnect, PgClientLike narrowing.

**Renamed from `@gertsai/database`** per ADR-004 F-A-2 — collision с upstream Prisma 29k-LOC schema avoided.

### W-5 — `@gertsai/queue` (Tier 2, P+F, 5 tests, 23d088a)

`packages/queue/` BullMQ wrappers + `/standalone` runner subpath. `createQueue<T>(name, opts)`, `createWorker<T,R>(name, processor, opts)`. Lazy peer-deps на `bullmq` + `ioredis`; `QueuePeerDepMissingError` on missing. `startStandalone(opts)` headless worker mode (per PRD-001 FR-019). typesVersions для `/standalone`.

**Import direction** (per ADR-004 R-2): `@gertsai/queue` consumed BY `@gertsai/api-core/moleculer`, NOT vice versa. ApiController BullMQ refactor to consume this is **Sprint 3.x follow-up** (out-of-scope here; package ships standalone). README documents constraint.

5/5 tests: export shape (createQueue/createWorker functions, QueuePeerDepMissingError class); deterministic-but-tolerant test that accepts either peer-dep error OR connection error against invalid host (works whether bullmq is hoisted or not); `startStandalone` returns handle with shutdown function.

### W-6 — CLAUDE.md tier table update (Phase B, a1bdc38)

`CLAUDE.md` updated atomically:
- Project description: 14 → 19 packages.
- Tier table expanded:
  - Tier 1: + config (S), tenant (F), otel (F), pg-client (F).
  - Tier 2: + queue (P+F).
- Strategy markers legend introduced (P/F/S/P+F/F+S).
- "Что важно знать" refreshed с Sprint 3.0/3.0.1/3.2 facts (uniform tsup, typesVersions, Symbol-keyed hook).
- Cross-references: ADR-004, ADR-003, ADR-002, ADR-011 (Hub).

### W-7 — Phase B integration verify (this evidence section "Measurement")

All 8 gates green. Per-package `pnpm pack --dry-run` confirms 0 source/test/snapshot/.env leak across all 5 new tarballs (only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`).

### W-8 — Phase C evidence + activation (this commit)

3 atomic commits на `feat/api-core-decomposition`:
```
<this>   docs(forgeplan): Sprint 3.2 Phase C — EVID-007 + SPEC-006 active + state
a1bdc38 chore(monorepo): Sprint 3.2 Phase B — CLAUDE.md tier table 14 → 19 packages (W-6)
23d088a feat(monorepo): Sprint 3.2 Phase A — foundation libs Wave 1 extraction (W-1..W-5)
```

5 changeset entries — each minor bump (0.0.0 → 0.1.0): `sprint-3-2-{config,tenant,otel,pg-client,queue}.md`.

## Naming / extraction decisions resolved (ADR-004 NO-GO findings closed)

| Audit F-A | Original PRD-001 | Sprint 3.2 outcome | Status |
|-----------|------------------|---------------------|--------|
| F-A-1 observe collision | `@gertsai/observe` (FR-018) | renamed `@gertsai/otel` | ✅ Closed (W-3) |
| F-A-2 database semantics | `@gertsai/database` (FR-019) | renamed `@gertsai/pg-client` (agnostic, NOT history-preserved) | ✅ Closed (W-4) |
| F-A-3 auth-moleculer drag | `@gertsai/auth-moleculer` (FR-020) | dropped from Sprint 3.2; deferred to separate ADR + auth wave | ✅ Routed (per ADR-004 I-5) |

## Decisions made during Sprint 3.2

- **W-2 strategy F vs P**: tenant-worker chose Fresh because upstream HTTP-resolution API differed from Moleculer-consumption shape. Documented в commit body.
- **W-3 Resource API tolerance**: original SPEC snippet used `resourceFromAttributes` only; `@opentelemetry/resources@1.30.1` lacks it. Worker added 3-tier fallback. Critical for cross-version compat.
- **W-4 invariant audit**: extracted via grep on `package.json` + `dist/` — 0 ORM/driver references confirmed before commit.
- **W-5 lazy-require test approach**: bullmq is in devDeps for typecheck; tests accept either peer-dep error OR connection error to handle pnpm's strict-peer-deps install behavior.
- **m9s-example NOT migrated to new packages** in Sprint 3.2 — preserves Sprint 3.0.1 EVID-006 baseline. Migration is Sprint 3.x follow-up.

## Commits на feature branch (Sprint 3.2)

```
<this>   docs(forgeplan): Sprint 3.2 Phase C — EVID-007 + SPEC-006 active + state
a1bdc38 chore(monorepo): Sprint 3.2 Phase B — CLAUDE.md tier table 14 → 19 packages (W-6)
23d088a feat(monorepo): Sprint 3.2 Phase A — foundation libs Wave 1 extraction (W-1..W-5)
84ffadd docs(forgeplan): ADR-004 active + PRD-001 amendment 2026-05-05 — Sprint 3.2 scope redesign
de65a28 docs(forgeplan): Sprint 3.0.1 Phase B — SPEC-005 + EVID-006 active + state
155d0c0 chore(repo,m9s-example): Sprint 3.0.1 Phase A3 — config + example fixes
33a22ff chore(monorepo): Sprint 3.0.1 Phase A2 — packaging hardening
e8e8c95 fix(core,api-core): Sprint 3.0.1 Phase A1 — type-system hardening
6b4fe75 docs(forgeplan): Sprint 3.1 Phase C
7d20ae8 feat(m9s-example): Sprint 3.1 Phase B
e830ae6 feat(core,api-core): Sprint 3.1 Phase A
```

## AgentTeams metrics (Sprint 3.2)

- 3 phases (Phase A 5∥ workers + Phase B team-lead + Phase C team-lead).
- 5 unique workers: config-worker (W-1), tenant-worker (W-2), otel-worker (W-3), pg-client-worker (W-4), queue-worker (W-5).
- Wall-clock: Phase A ~10-15 min via 5∥ AgentTeams; Phase B/C ~45 min (interrupted by /private/tmp ENOSPC mid-build, recovered after disk cleanup).
- Disjoint scope: 5 NEW package directories — 0 conflicts.
- Emergent worker decisions:
  - tenant-worker: F over P after upstream API analysis (different problem domain).
  - otel-worker: 3-tier Resource API fallback for `@opentelemetry/resources` version drift.
  - pg-client-worker: explicit grep verification of 0 ORM/driver references (ADR-011 invariant audit).
  - queue-worker: deterministic-but-tolerant lazy peer-dep test pattern (handles pnpm strict-peer-deps install behavior).
- Single environmental issue: `/private/tmp` filesystem at 100% during Phase B verify; resolved by user cleanup.

## Verdict rationale

`supports` SPEC-006 + ADR-004 + PRD-001 (amended) + EVID-006:
- All 8 W-items acceptance met (verification table above).
- Zero test regressions (4099 = Sprint 3.0.1 baseline 4051 + 48 new).
- All CI gates green (lint/publint/depcruise/typecheck/build).
- Per-package `pnpm pack --dry-run` × 5: 0 leak — preserves Sprint 3.0 tarball hygiene.
- All 3 architect NO-GO findings (F-A-1, F-A-2, F-A-3) closed via rename + drop pattern.
- Strategy markers (P/F/S/P+F) applied per package per ADR-004 I-2 invariant.

`congruence_level: 3` (CL3): full repo measurements on real workspace, real tests, real CI gate runs, all 19 + m9s-example.

`evidence_type: measurement`: structured measurement (test counts, build outputs, commit hashes, CI gate exit codes, tarball audit grep).

## Decisions driven by this evidence

- SPEC-006 ready to activate.
- v0.2.0 publish technically unblocked: type-system + DX hardening (Sprint 3.0.1) + foundation libs Wave 1 (Sprint 3.2) + scope redesign (ADR-004) — все done.
- Sprint 3.x consumer migrations:
  - ApiController BullMQ refactor to consume `@gertsai/queue` (deferred per W-5 README).
  - m9s-example migration to `@gertsai/tenant`, `@gertsai/otel`, `@gertsai/queue` (opportunistic).
  - `@gertsai/auth-moleculer` extraction (deferred per ADR-004 I-5; needs separate `@gertsai/auth` ADR first).
  - `@gertsai/llm-observe` (renamed upstream LLM-obs SDK; future wave).

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-006 (Sprint 3.2 — foundation libs Wave 1 extraction checklist) | Spec | informs (full implementation evidence) |
| ADR-004 (Foundation libs naming + extraction strategy) | ADR | informs (strategies P/F/S applied per package) |
| PRD-001 (Wave 2 — Clean Library Platform, amended 2026-05-05) | PRD | informs (FR-016..FR-020 fulfilled per ADR-004 redesign) |
| EVID-006 (Sprint 3.0.1 complete) | Evidence | informs (clean foundation enabled this build) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (subpath patterns + typesVersions) |
| ADR-011 (api-rlr / pg-client agnostic invariants) | external (Hub) | informs (W-4 pg-client follows I-1, I-2) |
| audit-pre-sprint-3-2 (5 reviewers) | external | informs (architect F-A-1, F-A-2, F-A-3 closed via ADR-004) |





