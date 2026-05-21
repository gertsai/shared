---
depth: standard
id: EVID-083
kind: evidence
last_modified_at: 2026-05-21T12:25:56.669481+00:00
last_modified_by: claude-code/2.1.145
links:
- target: PRD-065
  relation: informs
- target: SPEC-021
  relation: informs
- target: RFC-027
  relation: informs
- target: ADR-015
  relation: informs
status: active
title: Wave 31 multi-expert audit — Wave 27/29/30 (5 reviewers, 7 CRIT/HIGH)
---

# EVID-083: Wave 31 multi-expert audit — Wave 27/29/30

| Field | Value |
|-------|-------|
| Status | Draft |
| Created | 2026-05-21 |
| Target | PRD-065 (Wave 27 pipeline extraction) |

## Structured Fields

verdict: weakens
congruence_level: 3
evidence_type: code_review

## Audit Summary

- **Panel** (5 parallel reviewers via `/audit` skill from `fpl-skills`):
  - `logic-reviewer` (agents-core:code-reviewer)
  - `arch-reviewer` (agents-pro:architect-reviewer)
  - `type-reviewer` (agents-domain:typescript-type-auditor)
  - `security-reviewer` (agents-pro:security-expert)
  - `test-reviewer` (agents-core:tester)
- **Files reviewed**: ~32 files, ~3000 LOC (pipeline core, 13 stages + tests, ApiController orchestrator, session uuid rename, perf-check.mjs, real-infra tests)
- **Scope**:
  - Wave 27 (PRs #92-#97) — pipeline extraction
  - Wave 29 (PRs #98, #99) — uuid rename + perf gate
  - Wave 30 (PR #100, merged this session) — testSession injection
- **Date**: 2026-05-21

## Scores (1-10)

| Reviewer | Score | Weight | Verdict |
|---|---|---|---|
| logic | 8.5 | 1.3 | APPROVE_WITH_FIXES |
| arch | 7.5 | 1.2 | APPROVE_WITH_FIXES |
| type | 7.5 | 1.0 | APPROVE_WITH_FIXES |
| security | **6.0** | 1.2 | **REQUEST_CHANGES** |
| test | 7.5 | 0.8 | APPROVE_WITH_FIXES |

**Weighted average**: 7.4/10
**Final verdict**: **REQUEST_CHANGES** (per Phase 4c rule: any REQUEST_CHANGES → final REQUEST_CHANGES)

## Task Completion (PRD-065 + SPEC-021 + RFC-027 + ADR-015)

- ✅ All 13 stages extracted verbatim (SPEC-021 §Stage 1-13 contracts honoured)
- ✅ PipelineRunner correctly hard-wires stages 12/13 in catch/finally (SPEC-021 I-1/I-2/I-3)
- ✅ ADR-015 Option B (typed `Stage<TIn,TOut>`) faithfully implemented
- ✅ 5-PR phased landing executed (P1 scaffolding → P5 setStageOverride)
- ✅ `@gertsai/api-core/pipeline` subpath export + typesVersions mirror (Sprint 3.0.1 F-4)
- ✅ setStageOverride snapshot isolation correctly implemented
- ✅ Wave 29.A `OperatorRef._uid → uuid` rename type-coherent within `@gertsai/session`
- ⚠️ Wave 29.A advertised "parity with rest of `@gertsai/*`" but `@gertsai/entity._uid` + `@gertsai/core/session.UsersMetaType.data._uid` still exist — partial rename
- ⚠️ Test count: 12/13 stages meet ≥5 tests AC; `cleanup.test.ts` has only 4 tests
- ❌ Wave 30 `testSession` seam not gated by `NODE_ENV !== 'production'` — production-reachable auth bypass vector via Moleculer transit

**Completion rate**: 7/10 fully met, 2 partial, 1 missing → ~70% (below 80% APPROVE threshold)

## Critical Findings (consensus — 2+ reviewers agree)

| # | Severity | Issue | Reviewers | File:Line |
|---|---|---|---|---|
| 1 | **CRIT** | `testSession` seam in `meta` accepted unconditionally — Moleculer transit forwards meta verbatim across nodes; any compromised peer can inject fake session and bypass `establishAuthSession` + session-guard. CWE-287, CWE-602. | security[C1] | `examples/m9s-example/src/composition/wave5-middlewares.ts:152-183` |
| 2 | **HIGH** | `cleanup` in `runner.ts:finally` not wrapped in try/catch — if `cleanup` throws, original catch error masked (JS finally-vs-catch semantics). Pre-Wave-27 had same flaw, but extraction is the moment to harden. | logic[W4], arch[W5], security[W4] | `packages/api-core/src/lib/controller/pipeline/runner.ts:76-78` |
| 3 | **HIGH** | `perf-check.mjs` warmup N=200 below V8 TurboFan threshold (~1000); baseline poisoned by JIT noise; CI gate flakey. `--update` flag overwrites without confirmation. Baseline JSON parse unguarded. PERF_GATE_PCT env not validated → NaN silent gate bypass. | logic[W1,W2], arch[W9], security[W6,W7] | `packages/api-core/scripts/perf-check.mjs:43,145-155,169-187` |
| 4 | **HIGH** | `setStageOverride` is public API with no documented threat model — overriding `establishAuthSession`, `validateRequest`, `validateResponse`, `injectTenantId` silently removes load-bearing security checks. Should `logger.warn` + opt-in flag. | arch[W6], security[W3] | `packages/api-core/src/lib/controller/ApiController.class.ts:493-525` |
| 5 | **HIGH** | `PipelineDeps.controller: AnyApiController = object` — heavy type erasure with `// PR-5 wiring will tighten this` comment, PR-5 shipped without tightening. No stage currently uses `deps.controller` (all needed fields hoisted as siblings). Should be dropped from `PipelineDeps` entirely. | arch[W7], type[W2] | `packages/api-core/src/lib/controller/pipeline/types.ts:22,35` |

## Unique Critical Findings (single reviewer, high severity)

| # | Reviewer | Severity | Issue | File:Line |
|---|---|---|---|---|
| 6 | security[C2] | **CRIT** | Prototype-pollution surface in `coerceQueryString` via typia schema metadata. `smartCoerce` iterates `actionParams.numericFields/booleanFields/arrayFields` — if action author derives from runtime, `__proto__` field name mutates Object.prototype. CWE-1321. | `packages/api-core/src/lib/common/coercion.ts:25-67` |
| 7 | security[C3] | **CRIT** | When `testSession` is used, `expectedTenantId` is pulled from `headers['x-tenant-id']` with NO validation it matches `testSession.tenantId`. Mixed-source tenant assertion. CWE-345. | `examples/m9s-example/src/composition/wave5-middlewares.ts:171-183` |
| 8 | type[C1] | **HIGH** | NEW `meta.user_type as any` cast in `establish-auth-session.ts:58` — regression vs pre-Wave-27 (closure passed typed `UserType` directly). Silently erases discriminated-union check after narrowing. | `packages/api-core/src/lib/controller/pipeline/stages/establish-auth-session.ts:58` |
| 9 | type[C2] | **HIGH** | `ctx.result!` non-null assertion in `wrap-response.ts:38` — with `setStageOverride('invokeHandler', ...)` consumer can replace stage 8 with one that doesn't populate `ctx.result`. Silent `TypeError` instead of clear diagnostic. | `packages/api-core/src/lib/controller/pipeline/stages/wrap-response.ts:38` |
| 10 | test[C1] | **HIGH** | `cleanup.test.ts` has 4 tests, below SPEC-021 AC ≥5 minimum. Missing case: `$destroy()` throws. | `packages/api-core/src/lib/controller/pipeline/stages/__tests__/cleanup.test.ts` |
| 11 | test[C2] | **HIGH** | `establish-auth-session.test.ts` doesn't cover the `sessionFactory === undefined` runtime throw branch (reachable code in source). | `packages/api-core/src/lib/controller/pipeline/stages/__tests__/establish-auth-session.test.ts` |

## Notable Warnings (medium severity, single-reviewer)

- arch[W1]: `sessionFactory` snake_case `(user_uuid, user_type) => ...` locks new API to legacy naming — Wave 29.A inconsistency
- arch[W2]: Wave 29.A claims "parity with @gertsai/*" but `@gertsai/entity._uid` + `core/session.UsersMetaType.data._uid` unchanged — partial rename
- arch[W6]: `setStageOverride` is replace-only — no `addStageBefore/After` or `wrapStage("around")` — limits OCP extension model
- arch[W8]: `cleanup.ts:25` calls `ctx.session?.$destroy()` without `await` — sync today but forward-incompatible
- type[W3]: `STAGE_NAMES[i]!` non-null assertion + parallel-array drift hazard with `DEFAULT_STAGES`
- type[W4]: `PipelineContext.result` not a discriminated union — `{kind: 'pending'|'raw'|'wrapped'}` would let TS narrow
- type[W6]: Newly introduced `as { success, errors? }` cast in `validate-response.ts:51`
- security[W1]: `logger.error('Cannot call...', action)` logs full action object — could contain handler closure secrets (CWE-532)
- security[W5]: No per-stage timeout in runner — DoS primitive combined with `setStageOverride` accepting any stage (CWE-400)
- security[W8]: typia validator errors logged with `value` field in loose-mode `validateResponse` — leaks secrets if response field fails validation (CWE-209)
- security[W10]: `Session.$switchOperator` doesn't validate `operator.uuid` non-empty + `operator.type` in OperatorType union (CWE-665)
- test[W1]: `extractParams.test.ts` missing `ctx.params === null` case
- test[W2]: `invokeHandler.test.ts` missing "handler returns `undefined`" case
- test[W3]: `setStageOverride` same-stage-twice (last-write-wins) untested

## Positive Findings

- Verbatim preservation discipline exemplary — every stage carries `// PRESERVED VERBATIM from ApiController.class.ts:NNN-MMM` JSDoc
- `PipelineShortCircuit` correctly uses `Object.setPrototypeOf(this, new.target.prototype)` for CJS/ESM `instanceof` correctness
- `translateError` ADDS null guard (`err && ...`) that original closure lacked — minor correctness improvement
- `wrapResponse` correctly uses `??` (not `||`) for code chain — preserves numeric `code = 0`
- `setStageOverride` snapshot isolation at schema-build time prevents retroactive mutation of already-registered handlers
- LOC ratio test:source = 2.85x (target 1.5x) — substantial test depth
- Test count delta: 290 → 381 (+91 tests, +31%)
- Pattern parity with Wave 15.A/B/C extractions (`api-queue`/`api-pubsub`) for `errorTranslator` adapter pattern
- `package.json` `/pipeline` subpath exports follow established conventions exactly

## Reproduction

All findings verified via direct source-code review on commits up through Wave 30 merge (PR #100). Reviewers had read access to:
- `packages/api-core/src/lib/controller/pipeline/**/*`
- `packages/api-core/src/lib/controller/ApiController.class.ts`
- `packages/session/src/{types,Session,Session.test}.ts`
- `packages/api-core/scripts/perf-check.mjs`
- `packages/api-core/perf-baseline.json`
- `examples/m9s-example/tests/real-infra*.test.ts`
- `examples/m9s-example/src/composition/wave5-middlewares.ts`
- Forgeplan artifacts: PRD-065, SPEC-021, RFC-027, ADR-015, EVID-080

## Pipeline Gate Results

Pre-audit baseline (CI on PR #100 just before merge):
- `pnpm --filter @gertsai/api-core build` — green
- `pnpm --filter @gertsai/api-core typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core test` — 381/381 passed
- `pnpm typecheck` (workspace-wide) — 0 errors
- ESLint, Publint, Are The Types Wrong, Dependency Cruiser — all green

## Recommendation

**Final verdict: REQUEST_CHANGES**

Two blockers for v1.0:

1. **[CRIT-1, CRIT-3]** `testSession` seam in `examples/m9s-example/src/composition/wave5-middlewares.ts:152-183` MUST be gated behind `process.env.NODE_ENV !== 'production' && process.env.GERTSAI_TEST_SESSION_ALLOW === '1'` (fail-closed: both required) with module-load-time assertion in production. When `testSession` is used, derive `expectedTenantId` from `testSession.tenantId` (single source of truth), not from header. Failure to fix exposes production auth bypass via Moleculer mesh transit.

2. **[CRIT-6]** Prototype-pollution guard in `coercion.ts` — add `if (field === '__proto__' || field === 'constructor' || field === 'prototype') continue;` to coerceNumericFields, coerceBooleanFields, coerceArrayFields. 6-line defence-in-depth fix.

Post-blocker hardening for Wave 32:
- Fix `cleanup` exception masking in `runner.ts` (HIGH-2)
- Document `setStageOverride` security threat model + logger.warn on sensitive-stage override (HIGH-4)
- Remove unused `controller: object` from `PipelineDeps` (HIGH-5)
- Fix newly-introduced `meta.user_type as any` (HIGH-8)
- Replace `ctx.result!` with guard or narrow type (HIGH-9)
- Add 2 missing test cases (HIGH-10, HIGH-11)
- Rewrite `perf-check.mjs` with N=1000 warmup + dry-run flag + JSON.parse validation + env-arg validation (HIGH-3)

Wave 27's verbatim-preservation discipline is exemplary. The architecture is sound. The blockers come from formalising what used to be private surfaces (`testSession`, `setStageOverride`) into composition points — the security contract didn't catch up.

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| PRD-065 | informs (parent — Wave 27 pipeline extraction) |
| SPEC-021 | informs (13-stage contract) |
| RFC-027 | informs (extraction strategy) |
| ADR-015 | informs (pipeline pattern choice) |
| PRD-064 | informs (Wave 28 polish parent) |
| EVID-080 | informs (Wave 25 audit baseline for findings) |
| EVID-081 | informs (Wave 26 closure) |
| EVID-082 | informs (Wave 28 closure) |






