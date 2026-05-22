---
depth: standard
id: PRD-069
kind: prd
last_modified_at: 2026-05-22T19:43:48.488904+00:00
last_modified_by: claude-code/2.1.145
status: active
title: Wave 35 — polish 11 EVID-087 follow-ups
---

# PRD-069: Wave 35 — polish 11 EVID-087 follow-ups

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Standard |
| Created | 2026-05-22 |
| Parent | EVID-087 (Wave 32/33/34 audit follow-ups) |

## Problem Statement

EVID-087 (session audit, 6 reviewers, 8.6/10) surfaced 11 polish items — 0 critical, all minor. Wave 35 closes 9 of 11 in 4-parallel-phase forge-cycle (2 deferred as structurally untestable).

## Target Audience

- **Primary**: gertsai/shared maintainers preparing v1.0 release — polish closes residue from Wave 32/33/34 audit
- **Secondary**: downstream consumers of `@gertsai/api-core/pipeline` — type-narrowing `ComposableStageName` prevents previously-silent runtime no-ops
- **Tertiary**: future-self / next-wave engineers — explicit deferral rationale documented in EVID-088 for security-W1

## Goals / Success Criteria

- 9 of 11 EVID-087 follow-ups closed
- 2 deferred with documented rationale (security-W1 is structurally untestable; can ship as separate Vitest worker config follow-up)
- Workspace gates green: typecheck 0 errors, api-core 401/401 (+2 new sensitive-warn tests), session 32/32

## Functional Requirements

### Phase A — types + extension API (typescript-pro)
- **FR-A1 (type-W2)**: Add `ComposableStageName = Exclude<StageName, 'translateError' | 'cleanup'>`; narrow `setStageOverride`/`addStageBefore`/`addStageAfter`/`wrapStage` signatures
- **FR-A2 (arch-W1 + type-W1 consensus)**: Replace parallel `STAGE_NAMES` + `DEFAULT_STAGES` arrays with single `STAGE_REGISTRY` tuple-array (`as const satisfies`); keep backward-compat derived exports
- **FR-A3**: Eliminate `STAGE_NAMES[i]!` non-null assertion via `for...of STAGE_REGISTRY` destructure
- **FR-A4 (arch-W2)**: Revert Wave 33.C W1 cosmetic `sessionFactory` param rename (`user_uuid`/`user_type` matches wire-level)

### Phase B — middleware edge cases (typescript-pro)
- **FR-B1 (logic-W1)**: `Array.isArray()` guard on `x-tenant-id` multi-value header
- **FR-B2 (logic-W2)**: Empty-string `testSession.tenantId` collapses to `undefined`

### Phase C — test fidelity (tester)
- **FR-C1 (test-C1)**: Replace impossible assertion in `coercion.test.ts` 4th CRIT-6 test
- **FR-C2 (test-W1)**: Widen stageTimeoutMs ratio to 10x
- **FR-C3 (security-W2)**: AC-A7 + AC-A8 sensitive-warn for `addStageAfter`/`wrapStage`
- **FR-C-skip (security-W1)**: deferred — structurally untestable

### Phase D — perf + READMEs (coder)
- **FR-D1 (arch-W4)**: Drop dead `controller: {}` from perf-check.mjs
- **FR-D2 (logic-W3)**: gate=0 guard
- **FR-D3 (arch-W3)**: README naming boundary sections

### Phase E — verification (production-validator)
- All workspace gates green

## Acceptance Criteria

- [x] 9 of 11 follow-ups closed
- [x] 2 explicitly deferred with rationale
- [x] api-core 401/401 + session 32/32 passing
- [x] Workspace typecheck 0 errors
- [x] EVID-088 created + linked + activated

## Out of Scope

- security-W1 negative tests (separate Vitest worker config needed)
- v1.0 major bump

## Related Artifacts

| Artifact | Relation |
|---|---|
| EVID-087 | based_on |
| EVID-088 | informs |
| PRD-066/067/068 | refines |


