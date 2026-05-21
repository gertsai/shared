---
depth: standard
id: PRD-066
kind: prd
last_modified_at: 2026-05-21T13:05:18.188858+00:00
last_modified_by: claude-code/2.1.145
status: active
title: Wave 32 — close 2 CRIT + 9 HIGH from EVID-083 audit
---

# PRD-066: Wave 32 — close 2 CRIT + 9 HIGH from EVID-083 audit

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Standard |
| Created | 2026-05-21 |
| Parent | EVID-083 (Wave 31 multi-expert audit) |

## Problem Statement

EVID-083 (Wave 31 audit, 5 reviewers) surfaced 2 CRIT + 9 HIGH findings on Wave 27/29/30 work. Final verdict: REQUEST_CHANGES. Wave 32 closes all 11 findings via 7-phase sequential forge-cycle (chronological by file scope to prevent agent conflicts).

## Target Audience

- **Primary**: maintainers of `gertsai/shared` preparing v1.0 release
- **Secondary**: downstream consumers — testSession seam + setStageOverride threat model changes affect security-conscious users
- **Tertiary**: external OSS reviewers — visible audit-trail comments document each closure

## Goals / Success Criteria

- **Close all 2 CRIT findings** (CRIT-1, CRIT-3 testSession; CRIT-6 prototype pollution)
- **Close all 9 HIGH findings** (HIGH-2/3/4/5/8/9/10/11; partial HIGH-X covered through composite changes)
- Workspace `pnpm typecheck` 0 errors
- `pnpm --filter @gertsai/api-core test` ≥ 387 passing (3+ new tests from Phase E)
- Zero test regressions in m9s-example (matches pre-Wave-32 pass count)
- All audit-trail comments `// Wave 32.{Phase} (EVID-083 HIGH-N)` present per closure

## Functional Requirements

### Phase A — Security CRIT-1 + CRIT-3 (testSession seam gating)
- **FR-A1**: Add `TEST_SESSION_ALLOWED` constant in `wave5-middlewares.ts` — requires `NODE_ENV !== 'production'` AND `GERTSAI_TEST_SESSION_ALLOW === '1'`
- **FR-A2**: Module-load-time `throw` if `GERTSAI_TEST_SESSION_ALLOW=1` set in production
- **FR-A3**: Derive `expectedTenantId` from `testSession.tenantId` (single source of truth); throw on header mismatch
- **FR-A4**: Set `GERTSAI_TEST_SESSION_ALLOW=1` in `vitest.config.ts` `test.env`

### Phase B — Security CRIT-6 (prototype pollution)
- **FR-B1**: Add module-private `DANGEROUS_KEYS` Set `['__proto__', 'constructor', 'prototype']`
- **FR-B2**: Apply guard in `coerceNumericFields`, `coerceBooleanFields`, `coerceArrayFields`, `coerceQueryParams`
- **FR-B3**: +4 new tests verifying guard prevents `Object.prototype` mutation

### Phase C — Pipeline core (HIGH-2/5/8/9)
- **FR-C1**: Wrap `cleanup(ctx, deps)` in nested try/catch in `runner.ts` finally; log via `deps.logger?.error`
- **FR-C2**: Drop `controller: AnyApiController = object` from `PipelineDeps`; remove from `_createActionSchema` deps construction
- **FR-C3**: Delete `meta.user_type as any` cast in `establish-auth-session.ts`
- **FR-C4**: Replace `ctx.result!` non-null in `wrap-response.ts` with explicit guard + diagnostic error

### Phase D — setStageOverride threat model (HIGH-4)
- **FR-D1**: Module-level `SENSITIVE_STAGES: ReadonlySet<StageName>` with 4 names
- **FR-D2**: `setStageOverride` emits `logger.warn` when sensitive stage replaced
- **FR-D3**: Enhanced JSDoc with security warning + composition pattern example
- **FR-D4**: README.md "Security boundary — sensitive stages" section

### Phase E — Missing tests (HIGH-10/11)
- **FR-E1**: Add 1 test to `cleanup.test.ts`: `$destroy()` throws → propagates (≥5 tests AC)
- **FR-E2**: Add 2 tests to `establish-auth-session.test.ts`: required + optional with `sessionFactory: undefined`
- **FR-E3** (bonus): Add 2 tests for `setStageOverride` warn on sensitive/non-sensitive

### Phase F — perf-check.mjs (HIGH-3)
- **FR-F1**: Default `PERF_WARMUP = 1000` (V8 TurboFan threshold)
- **FR-F2**: `parseFiniteIntEnv` / `parseFiniteNumberEnv` validators for `PERF_N`, `PERF_WARMUP`, `PERF_GATE_PCT`
- **FR-F3**: `--dry-run` flag for `--update` mode
- **FR-F4**: Wrap baseline `JSON.parse` in try/catch with distinct exit codes
- **FR-F5**: dist/ existence check up-front

## Non-functional Requirements

- All bumps patch (zero public surface breaks except internal `PipelineDeps.controller` field removed, which was never a documented public API)
- Build + typecheck workspace-wide green
- Test count delta: +5..7 new tests
- Audit-trail comments on every closure for future-self traceability

## Acceptance Criteria

- [x] All 11 EVID-083 CRIT + HIGH findings closed with audit-trail comments
- [x] `pnpm typecheck` workspace 0 errors
- [x] `pnpm --filter @gertsai/api-core test` 390/390 passing
- [x] `pnpm --filter @gertsai/api-core build` dual ESM+CJS green
- [x] `pnpm --filter @gertsai/api-core perf:check` reproducible
- [x] m9s-example test count preserved (15 passed, 1 skipped, 1 failed pre-existing Docker timeout)
- [x] EVID-084 (closure proof) created + linked `informs` PRD-066 + activated

## Out of Scope

- Wave 31 medium-severity findings (W1..W10 in EVID-083) — defer to Wave 33+ if needed
- `setStageOverride` extension to `addStageBefore` / `wrapStage('around')` — future RFC
- Workspace-wide `_uid → uuid` migration (`@gertsai/entity._uid`, `core/session.UsersMetaType.data._uid`) — separate decision

## Risks

- **Wave5 middleware gate** could block tests if vitest config env not loaded correctly — mitigated by adding env in vitest.config.ts (verified)
- **`PipelineDeps.controller` removal** required mechanical fixup in 14 test fixture files — done
- **Bench harness changes** could break CI perf:gate step — mitigated by preserving baseline file untouched

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| EVID-083 | based_on (Wave 31 audit findings — source of all 11 closures) |
| EVID-084 | informs (Wave 32 closure proof) |
| PRD-065 | informs (Wave 27 parent — pipeline extraction) |
| ADR-015 | informs (pipeline pattern choice — preserved) |
| SPEC-021 | informs (13-stage contract — preserved) |
| RFC-027 | informs (extraction strategy — preserved) |



