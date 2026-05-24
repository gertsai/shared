---
depth: standard
id: EVID-087
kind: evidence
last_modified_at: 2026-05-22T15:50:12.804049+00:00
last_modified_by: claude-code/2.1.145
links:
- target: PRD-066
  relation: informs
- target: PRD-067
  relation: informs
- target: PRD-068
  relation: informs
status: active
title: Session audit — Waves 32/33/34 (6 reviewers, 44/44 closure verified)
---

# EVID-087: Session audit — Waves 32/33/34

| Field | Value |
|---|---|
| Status | Draft |
| Target | PRD-066, PRD-067, PRD-068 |

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: code_review

## Audit Summary

- **Panel** (6 parallel reviewers via `/audit` skill):
  - logic-reviewer (agents-core:code-reviewer)
  - arch-reviewer (agents-pro:architect-reviewer)
  - type-reviewer (agents-domain:typescript-type-auditor)
  - security-reviewer (agents-pro:security-expert)
  - test-reviewer (agents-core:tester)
  - task-reviewer (general-purpose) — verified 44/44 closure claim
- **Files reviewed**: ~30 files, ~5000 LOC + 6 forgeplan artifacts
- **Date**: 2026-05-22
- **Scope**: Waves 32 (CRIT/HIGH closures from EVID-083), Wave 33 (W tail + ledger + m9s test debt), Wave 34 PR-1 (extension API + W9 docs) + PR-2 (W2 uuid rename)

## Scores (1-10)

| Reviewer | Score | Weight | Verdict |
|---|---|---|---|
| logic | 8.5 | 1.3 | APPROVE_WITH_FIXES |
| arch | 8.5 | 1.2 | APPROVE_WITH_FIXES |
| type | 8.5 | 1.0 | APPROVE_WITH_FIXES |
| security | **9.0** | 1.2 | **APPROVE** |
| test | 8.0 | 0.8 | APPROVE_WITH_FIXES |
| task | **9.5** | 0.7 | **APPROVE** |

**Weighted average**: **8.6/10**
**Final verdict**: **APPROVE_WITH_FIXES** (2 APPROVE + 4 AWF, no REQUEST_CHANGES, no REJECT)

## Task Completion Matrix (44/44 = 100%)

task-reviewer verified each of 21 EVID-083 findings at source line + 23 EVID-080 closures from prior waves. Audit-trail comments confirmed in 89 sites (`Wave 32.{Phase}` × 23, `Wave 33.{Phase}` × 39, `Wave 34 PR-{1|2}` × 27). Pipeline gates: workspace typecheck 0, api-core 399/399, session 32/32, entity 63/63.

## Critical Findings — NONE

No CRIT findings across all 6 reviewers. Wave 32/33/34 are publishable.

## Action Plan (priority order)

### High-value follow-ups (next session, not blocking v1.0)

1. **[test-C1]** `coercion.test.ts:283` — fourth CRIT-6 test (`expect(typeof ({})['__proto__']).not.toBe('number')`) tests for an impossible condition; assertion can never fail. Replace with structural prototype-chain check.
2. **[type-W2]** `addStageBefore`/`addStageAfter`/`wrapStage` accept full `StageName` union including `'translateError'` + `'cleanup'` (which are hard-wired into runner). Calls to these stage names silently discarded. Narrow parameter to `Exclude<StageName, 'translateError' | 'cleanup'>` (or new `ComposableStageName` alias).
3. **[arch-W1 + type-W1 — consensus]** `STAGE_NAMES` (`as const` widened to `readonly StageName[]`) + `DEFAULT_STAGES` are parallel arrays with manual index alignment. Forces `STAGE_NAMES[i]!` non-null assertion + drift hazard. Unify via single `as const` tuple array or `Record<StageName, Stage>` map.
4. **[arch-W2]** Wave 33.C W1 sessionFactory param rename (`user_uuid → operatorUuid`) is JSDoc-only and inconsistent with `ContextMeta` wire-level snake_case. Pick one narrative — complete migration OR revert W1's cosmetic rename.
5. **[logic-W1]** `wave5-middlewares.ts:241` — multi-value HTTP header `x-tenant-id: ['A','B']` slips past `string | undefined` cast → misleading "Tenant scope violation" throw. Add `Array.isArray()` guard.
6. **[logic-W2]** `wave5-middlewares.ts:239` — empty-string `testSession.tenantId='' ` returns `expectedTenantId: ''` which may silently pass downstream `isInTenant('')`. Treat empty string as "unset".

### Low-priority polish

7. **[test-W1]** `runner.test.ts:222` — `stageTimeoutMs=25ms` vs 100ms stage (4x ratio) — flake risk on slow CI runners. Widen to 8-10x.
8. **[arch-W4]** `perf-check.mjs:165` — dead `controller: {}` literal (PipelineDeps no longer has the field).
9. **[arch-W3]** `storage-core/README.md` + `entity-storage/README.md` — add "Naming boundary" subsection explaining why `_uid` is intentional in storage Meta vs `uuid` in EntityJSON.
10. **[security-W1+W2]** Add explicit negative tests for testSession gating (NODE_ENV=production + GERTSAI_TEST_SESSION_ALLOW=1 throws) + sensitive-warn for `addStageAfter` + `wrapStage`.
11. **[logic-W3]** `perf-check.mjs:295` — `file.gate_pct === 0` from corrupt baseline passes lower-bound check (0 is "valid" per `Number.isFinite` + `>= 0`). Add `> 0` guard.

## Positive Highlights (top findings)

- **P1** [security] `TEST_SESSION_ALLOWED` IIFE + module-load production throw is textbook fail-closed (CWE-287/602)
- **P2** [arch] Cleanup error masking fix in `runner.ts:108-122` is "kind of code I want every Junior to read"
- **P3** [type] No new `any`/`as any` introduced anywhere across Wave 32/33/34 surface
- **P4** [test] AC-A5 onion composition test asserts ALL 5 positions (outer-pre → inner-pre → anchor → inner-post → outer-post) with independent `indexOf`
- **P5** [logic] DANGEROUS_KEYS guards `fields` parameter (caller-controlled), not just hard-coded list — future-proof against new dynamic-key callers
- **P6** [task] All 44 closures verified at source level; audit-trail discipline = 89 breadcrumbs
- **P7** [security] PII redaction test uses sentinel `'secret-PII-do-not-log'` + structural shape check — both layers

## Pipeline Gate Results

- `pnpm typecheck` workspace — 0 errors (45 projects)
- `pnpm --filter @gertsai/api-core test` — 399/399 passing
- `pnpm --filter @gertsai/session test` — 32/32 passing
- `pnpm --filter @gertsai/entity test` — 63/63 passing
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
- `pnpm --filter @gertsai/api-core perf:check` — baseline reproducible

## Recommendation

**APPROVE_WITH_FIXES**. All 44 audit findings verified closed at source. Zero exploitable issues. Follow-ups are housekeeping (test fidelity, type narrowing, parallel-array drift hazard) and can ship as separate hardening wave OR be deferred to post-v1.0.

The Wave 32/33/34 closures are publishable; the project is technically v1.0-ready from audit perspective.

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-066 | informs (Wave 32 parent) |
| PRD-067 | informs (Wave 33 parent) |
| PRD-068 | informs (Wave 34 parent) |
| EVID-083 | informs (audit findings source — Wave 31) |
| EVID-084/085/086 | informs (closure proofs verified) |





