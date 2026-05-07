---
depth: standard
id: EVID-019
kind: evidence
last_modified_at: 2026-05-07T14:18:27.985577+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-004
  relation: informs
- target: ADR-011
  relation: informs
- target: SPEC-016
  relation: informs
- target: RFC-002
  relation: informs
status: active
title: Sprint 3.11 m9s-example real-infra reference application — Phase B verify + Post-Build audit + fixes
---

# EVID-019 — Sprint 3.11 m9s-example real-infra reference application

## Structured Fields

- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** integration test results + post-build audit + remediation

## Summary

Sprint 3.11 closes the m9s-example to a fully real-infra reference application
per ADR-011 (with Amendment 2 from Pre-Build audit synthesis) and SPEC-016
(with Amendment 1 W-item revisions). All four production-grade tracks shipped:

1. **Track 1 — Postgres + pgvector storage:** normalised `documents` + `chunks`
   tables (HNSW index on cosine), `pg-client.adapter.ts` (`pg@^8.13` thin
   wrapper conforming to `@gertsai/pg-client.PgClient`), `pg-document.repository`
   and `pg-vector.store` consume the agnostic 3-method interface, raw-SQL
   migration runner with `pg_advisory_xact_lock` + `typia.assert<MigrateCommand>`
   argv hardening.
2. **Track 2 — OpenFGA ReBAC:** canonical `FgaResourceType` taxonomy in DSL +
   bootstrap script, per-document tenant tuples written at INSERT time (NO
   wildcards — non-portable; verified live in W-3-11-8a), `OpenFgaPermissionGate`
   E+ enhancement with fail-closed semantics + production-guard composition.
3. **Track 3 — BullMQ async + Redis cache driver:** env-driven CACHE_DRIVER
   memory|redis switch, ChannelsMiddleware + WorkflowsMiddleware gated on
   REDIS_URL, eventual-consistency Document↔Chunks contract verified.
4. **Track 4 — Docker + docs:** 5-service docker-compose with healthchecks +
   init scripts, .env.example placeholder credentials only, README §Production
   Setup self-contained ≤ 5 min onboarding, openfga/migrations READMEs.

## Test Results

### Mock-mode (default `pnpm test`)

```
 ✓ tests/e2e.test.ts (8 tests) 1123ms
 ✓ tests/real-infra.test.ts (3 tests, env-gated; ran with Ollama up) 828ms
 ✓ tests/audit-propagation.test.ts (4 tests)
 ✓ tests/ingest-use-case.test.ts (7 tests)
 ✓ tests/search-use-case.test.ts (5 tests)
 ✓ tests/wave5-integration.test.ts (4 tests)

 Test Files  6 passed (6)
      Tests  31 passed (31)
   Duration  3.30s
```

### Real-infra suite (`pnpm test:real-infra`)

Run against live docker-compose stack (Postgres+pgvector, OpenFGA, Redis,
NATS, Ollama):

```
 ✓ tests/real-infra/bullmq.test.ts (3 tests) 847ms
 ✓ tests/real-infra/openfga.test.ts (9 tests) 149ms
 ✓ tests/real-infra/pg-vector.test.ts (4 tests) 88ms

 Test Files  3 passed (3)
      Tests  16 passed (16)
   Duration  1.50s
```

Coverage matrix:
- pg-vector: round-trip insert + cosine search; cross-tenant DENY via I-13
  mandatory tenant filter; HNSW index used; soft-delete via deleted_at.
- openfga: same-tenant ALLOW; cross-tenant DENY; missing-tuple DENY;
  unreachable-endpoint fail-closed; p50 latency under 100ms across 100
  sequential checks (NFR-1); composition-level I-12 production-guard;
  decodeResource pure helpers.
- bullmq: queued-response immediacy; eventual consistency Document↔Chunks
  (race-tolerant assertion `<=1` after Post-Build §P1-3 fix); sequential
  ingest under tenant header without race errors.

### Quality gates (final)

- `pnpm build` — clean (workspace-concurrency=1 sequential per Sprint 3.10
  lesson on entity DTS race)
- `pnpm typecheck` — 0 errors
- `pnpm depcruise` — 0 violations (119 modules, 256 deps cruised)
- `pnpm exec oxlint examples/m9s-example/` — 0 errors, 53 warnings
  (stylistic only — `no-console` in startup logger; legitimate `_uid` /
  `_dimensions` private fields preserved by camelcase exemption)

## Post-Build Audit Results

3∥ reviewers per Track. Verdicts:
- **Track 1 (Pg storage)** — `agents-pro:code-analyzer` — **ACCEPT**, 0 P0/P1
- **Track 2 (OpenFGA)** — `agents-pro:security-expert` — **ACCEPT-WITH-FIXUPS**,
  0 P0, 4 P1 (3 fixed, 1 deferred to KNOWN-ISSUES §OpenFGA-model-drift-CI)
- **Track 3+4 (Queue + Docker + Docs)** — `agents-pro:architect-reviewer` —
  **ACCEPT-WITH-FIXUPS**, 0 P0, 4 P1 (all fixed)

### P1 fixes applied this turn

| Track | Finding | Resolution |
|---|---|---|
| T2 §P1-1 | `FGA_API_TOKEN` accepted but silently dropped → fail-OPEN risk | `OpenFgaPermissionGate` constructor THROWS when `client.apiToken` is supplied; KNOWN-ISSUES §FGA_API_TOKEN-plumbing tracks the package-side follow-up. |
| T2 §P1-2 | Process-wide singleton multi-store hazard | JSDoc warning added — tests must `resetFgaClient() + resetPermissionCache()` between distinct configs; multi-store production deployments require follow-up ADR. |
| T2 §P1-3 | DSL/JSON model drift in bootstrap script | DEFERRED — KNOWN-ISSUES §OpenFGA-model-drift-CI; needs `@openfga/syntax-transformer` devDep or snapshot test. |
| T2 §P1-4 | `ensureBootstrapTuples` swallowed `write_failed_due_to_invalid_input` | Narrowed to `'already exists'` + explicit dup-tuple message; typo'd tenant ids now surface as errors. |
| T3 §P1-1 | Wide `as any` cast on Channels adapter hides config drift | Narrowed to a typed local `RedisChannelsOptions` + single cast at the `MiddlewareOptions` boundary; surrounding broker config stays type-checked. |
| T3 §P1-2 | `extractRedisHost`/`extractRedisPort` regex dropped auth + TLS | Replaced with `parseRedisUrlForChannels()` using `new URL()` — honours `rediss://`, password, db index. |
| T3 §P1-3 | Eventual-consistency test had non-deterministic `length === 0` | Race-tolerant assertion `<=1` matches the actual contract (queued response did NOT block on persistence) without admitting phantom rows. |
| T3 §P1-4 | `.env.example` shipped `MIGRATIONS_AUTO_APPLY=true` (contradicted README) | Flipped to `false` with inline `# dev only — keep false in CI/prod` comment. |

## Methodology trace

OBSERVE → ROUTE (Deep) → SHAPE (PRD-004 + ADR-011 + SPEC-016 + RFC-002) →
REASON (ADI on contested decisions A/C/D/F via gemini-3-flash-preview) →
PRE-BUILD AUDIT (5∥ reviewers → Amendment 2 codified 24 findings →
SPEC-016 Amendment 1 W-item revisions + W-3-11-8a OpenFGA wildcard
live-spike) → BUILD (4-6∥ workers per Track per revised SPEC) → PHASE B
VERIFY (pnpm install + sequential build + mock test + real-infra test +
typecheck + lint + depcruise) → POST-BUILD AUDIT (3∥ reviewers → 8 P1
findings → 7 fixed + 1 deferred) → re-verify → EVID-019 (this artifact).

## Notes

- Real-infra suite gated by `VITEST_REAL_INFRA=1` env (set by
  `pnpm test:real-infra`). Default `pnpm test` excludes `tests/real-infra/**`.
- vitest.config.ts disables fileParallelism in BOTH modes — Wave 5 broker
  startup is heavy enough that 5 mock-mode test files racing in parallel
  push individual broker boots past 30s.
- OpenFGA `v1.5` Docker image is scratch-based (no shell). Healthcheck
  removed — the `/healthz` HTTP endpoint is exposed and bootstrap script
  waits for it.
- Sprint 3.11 SHAPE phase committed in `782a3e0..dec1513`; Build is
  uncommitted at evidence creation time and will land in a single atomic
  commit referencing this evidence.






