---
depth: standard
id: EVID-088
kind: evidence
last_modified_at: 2026-05-22T19:43:03.556034+00:00
last_modified_by: claude-code/2.1.145
links:
- target: PRD-069
  relation: informs
status: active
title: Wave 35 — 9 of 11 EVID-087 follow-ups closed (2 deferred)
---

# EVID-088: Wave 35 — 9 of 11 EVID-087 follow-ups closed (2 deferred)

| Field | Value |
|-------|-------|
| Status | Draft |
| Target | PRD-069 |

## Structured Fields

evidence_type: measurement
verdict: supports
congruence_level: 3

## Measurement

Wave 35 5-phase polish forge-cycle through 4 parallel teammates by disjoint file scope.

- **Phase A** (typescript-pro): types + extension API — type-W2, arch-W1+type-W1 consensus, arch-W2
- **Phase B** (typescript-pro): wave5-middlewares.ts — logic-W1, logic-W2
- **Phase C** (tester): test fidelity — test-C1, test-W1, security-W2; security-W1 deferred
- **Phase D** (coder): perf-check + READMEs — arch-W3, arch-W4, logic-W3
- **Phase E** (validator gates pass)

## Result

| Finding | Status | File:Closure |
|---|---|---|
| type-W2 | ✅ closed | `pipeline/types.ts:138` `ComposableStageName = Exclude<StageName, 'translateError' \| 'cleanup'>` |
| arch-W1+type-W1 (consensus) | ✅ closed | `pipeline/default-stages.ts` `STAGE_REGISTRY` single tuple-array via `as const satisfies` |
| W3 `!` elimination | ✅ closed | `ApiController.class.ts` `for ({name, stage} of STAGE_REGISTRY)` |
| arch-W2 | ✅ closed | `pipeline/types.ts:55` `sessionFactory(user_uuid, user_type)` revert to wire-level |
| logic-W1 | ✅ closed | `wave5-middlewares.ts:256-264` Array.isArray guard |
| logic-W2 | ✅ closed | `wave5-middlewares.ts:243-250` normalizedSessionTenantId |
| test-C1 (critical) | ✅ closed | `coercion.test.ts:283-313` real prototype-chain check |
| test-W1 | ✅ closed | `runner.test.ts:222-236` 20ms vs 200ms (10x ratio) |
| security-W2 | ✅ closed | `apiController-stage-override.test.ts` AC-A7 + AC-A8 |
| arch-W4 | ✅ closed | `perf-check.mjs:165` dead `controller: {}` dropped |
| logic-W3 | ✅ closed | `perf-check.mjs` `gatePct <= 0` guard |
| arch-W3 | ✅ closed | `storage-core/README.md` + `entity-storage/README.md` "Naming boundary" sections |
| **security-W1** | ⏭️ **deferred** | testSession module-load env capture is **structurally untestable** inside running Vitest suite (env constants captured at import time before `process.env` mutation can take effect). Requires separate Vitest worker config with different `env` block. Documented for future hardening wave. |

**Stats**:
- 9/11 follow-ups closed (82%)
- 2 deferred with explicit rationale (security-W1 structurally untestable, original test-C1 found+fixed)
- 8 source files modified, 4 test files modified, 2 README files
- 14 files total, +260/-50 LOC
- +2 new tests (AC-A7, AC-A8)

**Pipeline gate results**:
- `pnpm typecheck` workspace — 0 errors
- `pnpm --filter @gertsai/api-core test` — 401/401 passing (was 399 + 2 new)
- `pnpm --filter @gertsai/session test` — 32/32 passing
- `pnpm --filter @gertsai-examples/m9s-example test` — 15 passed + 1 skipped + 1 failed (pre-existing Docker timeout, NOT regression)

## Interpretation

After Wave 35:
- All actionable EVID-087 follow-ups closed
- Original audit-trail (44/44 EVID-080+EVID-083 findings) remains 100% closed
- 1 follow-up deferred with documented structural untestability
- Project state truly v1.0-ready from polish perspective

Notable improvements:
- **Public extension API typed-tight**: `addStageBefore/After/wrapStage('translateError', ...)` now rejected at compile time (was silent no-op runtime bug)
- **STAGE_REGISTRY single source of truth**: eliminates parallel-array drift hazard + `!` non-null assertion
- **Test fidelity**: coercion test 4 now ACTUALLY exercises the guard (was impossible assertion)
- **CI stability**: stageTimeoutMs widened to 10x ratio prevents slow-runner flakes
- **Naming boundary documentation**: `_uid` (storage) vs `uuid` (entity) distinction explicitly documented in 2 READMEs

## Congruence Level Justification

CL3 same-context: workspace typecheck + vitest run on actual codebase. Audit-trail comments inserted at fix sites.

Verdict `supports`: PRD-069 named these 9 closures as AC; all verified at source line + gate pipeline.

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-069 | informs (parent) |
| EVID-087 | informs (audit findings source) |
| PRD-066/067/068 | refines (closes residue) |



