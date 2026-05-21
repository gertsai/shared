---
depth: standard
id: EVID-084
kind: evidence
last_modified_at: 2026-05-21T13:05:56.779424+00:00
last_modified_by: claude-code/2.1.145
links:
- target: PRD-066
  relation: informs
status: active
title: Wave 32 — 2 CRIT + 9 HIGH from EVID-083 closed via 7-phase forge-cycle
---

# EVID-084: Wave 32 — 11 EVID-083 findings closed via 7-phase forge-cycle

| Field | Value |
|-------|-------|
| Status | Draft |
| Created | 2026-05-21 |
| Target | PRD-066 (Wave 32 closure scope) |

## Structured Fields

evidence_type: measurement
verdict: supports
congruence_level: 3

## Measurement

Wave 32 closure of all 2 CRIT + 9 HIGH findings from EVID-083 (Wave 31 audit). Sequential 7-phase forge-cycle by disjoint file scope to prevent agent conflicts:

- **Phase A** (backend-security-coder): wave5-middlewares.ts testSession gating (CRIT-1, CRIT-3)
- **Phase B** (backend-security-coder): coercion.ts prototype-pollution guard (CRIT-6)
- **Phase C** (typescript-pro): pipeline core hardening (HIGH-2, HIGH-5, HIGH-8, HIGH-9)
- **Phase D** (typescript-pro): setStageOverride threat model (HIGH-4)
- **Phase E** (tester): missing test cases (HIGH-10, HIGH-11) + bonus
- **Phase F** (typescript-pro): perf-check.mjs hardening (HIGH-3)
- **Phase G** (production-validator): final read-only verification

Methodology: 6 teammates spawned sequentially via Agent tool with disjoint file scope. Each teammate received specific PRD scope + verification gate. Test count progression: 381 → 385 (Phase B) → 385 (Phase C) → 385 (Phase D) → 390 (Phase E) → 390 (Phase F final).

Conditions:
- Branch: `chore/wave-32-evid-083-closures`
- Toolchain: Node ≥22 LTS · pnpm 10.x · TypeScript 5.9 · tsup dual ESM+CJS · Vitest 3.x
- Workspace: 45 projects
- Verification gates: `pnpm typecheck` (workspace), `pnpm --filter @gertsai/api-core {build,typecheck,test}`, `pnpm --filter @gertsai/api-core perf:check`, `pnpm --filter @gertsai-examples/m9s-example test`

## Result

**Closures (11/11):**

| # | Finding | Phase | File:Closure |
|---|---------|-------|--------------|
| 1 | CRIT-1 | A | `wave5-middlewares.ts` — `TEST_SESSION_ALLOWED` env-gated double-gate + module-load production check |
| 2 | CRIT-3 | A | `wave5-middlewares.ts` — `expectedTenantId` derived from `testSession.tenantId`, header cross-check throws on mismatch |
| 3 | CRIT-6 | B | `coercion.ts` — `DANGEROUS_KEYS` Set + `if (DANGEROUS_KEYS.has(field)) continue` in 4 helpers |
| 4 | HIGH-2 | C | `runner.ts` — `try/catch` around `cleanup(ctx, deps)` in finally; logs via `deps.logger?.error` |
| 5 | HIGH-5 | C | `types.ts` + `ApiController.class.ts` — dropped unused `controller: AnyApiController` field from `PipelineDeps` |
| 6 | HIGH-8 | C | `establish-auth-session.ts` — removed `meta.user_type as any` + `eslint-disable` |
| 7 | HIGH-9 | C | `wrap-response.ts` — replaced `ctx.result!` with explicit guard + diagnostic error |
| 8 | HIGH-4 | D | `ApiController.class.ts` + `README.md` — `SENSITIVE_STAGES` Set + `logger.warn` on sensitive override + README security section |
| 9 | HIGH-10 | E | `cleanup.test.ts` — added 5th test ($destroy() throws) to meet SPEC-021 ≥5 AC |
| 10 | HIGH-11 | E | `establish-auth-session.test.ts` — added 2 tests for `sessionFactory === undefined` |
| 11 | HIGH-3 | F | `perf-check.mjs` — warmup 200→1000, `parseFinite*Env` validators, `--dry-run`, JSON.parse guard, dist/ check |

**Files changed**: 31 files, +544/-61 LOC (25 source files + 6 test/config files).

**Pipeline gate results**:
- `pnpm typecheck` workspace — 0 errors
- `pnpm --filter @gertsai/api-core test` — 390 passed (28 files)
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
- `pnpm --filter @gertsai/api-core perf:check` — baseline reproducible (p50 1.9μs, p95 4.2μs, p99 7.3μs)
- `pnpm --filter @gertsai-examples/m9s-example test` — 15 passed, 1 skipped, 1 failed (pre-existing Docker timeout, NOT regression)

**Audit-trail discipline**: every closure carries `// Wave 32.{Phase} (EVID-083 HIGH/CRIT-N)` comment for future-self traceability.

**Deferred (intentional)**: 10 MED warnings (W1..W10 in EVID-083) — not blockers for v1.0.

## Interpretation

PRD-066 acceptance criteria fully met: all 11 EVID-083 CRIT + HIGH findings closed. Wave 32 unblocks v1.0 release decision — audit ledger clean across:
- Wave 25 audit (EVID-080): 100% closure across HIGH/MED/LOW
- Wave 31 audit (EVID-083): 100% closure across CRIT/HIGH
- Pipeline extraction (Wave 27): security boundaries documented + gated + tested

Notable patterns established:
- **Sequential forge-cycle by file scope** prevents teammate conflicts when multi-agent fixes overlap conceptually but not physically
- **`SENSITIVE_STAGES` ReadonlySet + logger.warn** pattern transferable to any future composition surface where consumer overrides could affect security
- **`parseFinite*Env` validators** pattern applicable to any Node script consuming env vars (lint-grade hardening)
- **Module-load-time production gates** (CRIT-1) catch misconfigured env before service accepts traffic — fail-loud preferable to fail-silent

## Congruence Level Justification

CL3 (same-context, penalty 0.0):
- All measurements taken on this repo's branch under PR
- `pnpm typecheck`/`test`/`build` are the same gates CI runs
- `perf-check.mjs` runs on the same machine that captured the baseline
- Verification gates are reproducible by anyone with the branch checked out

Verdict `supports` (1.0): PRD-066 explicitly named these 11 closures as acceptance criteria; all closures verified by Phase G read-only validator + gate pipeline. R_eff contribution: max(0, 1.0 − 0.0) = 1.0.

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| PRD-066 | informs (parent — Wave 32 scope) |
| EVID-083 | informs (Wave 31 audit — source of findings) |
| PRD-065 | informs (Wave 27 — code under review) |
| ADR-015 | informs (pipeline pattern preserved) |
| SPEC-021 | informs (13-stage contract preserved) |
| RFC-027 | informs (extraction strategy preserved) |



