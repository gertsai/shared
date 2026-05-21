---
depth: standard
id: PRD-067
kind: prd
last_modified_at: 2026-05-21T16:33:21.619740+00:00
last_modified_by: claude-code/2.1.145
status: active
title: Wave 33 — clean forgeplan ledger + EVID-083 W tail + m9s test debt
---

# PRD-067: Wave 33 — clean forgeplan ledger + EVID-083 W tail + m9s test debt

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Standard |
| Created | 2026-05-21 |
| Parent | EVID-083 (W tail) + forgeplan health unhealthy verdict |

## Problem Statement

Wave 32 closed all CRIT/HIGH from EVID-083 but left 3 categories of debt: (1) 10 historical blind-spotted artifacts (Wave 10-12 RFCs/PRDs activated without evidence links — created `forgeplan health: unhealthy`); (2) 10 medium-severity W findings from EVID-083 (intentionally deferred); (3) 4 pre-existing m9s-example real-infra test failures surfaced after Wave 30 unblocked auth.

## Target Audience

- maintainers preparing v1.0 release — clean ledger required for healthy CI signal
- downstream consumers — W tail closures harden security boundaries + type safety
- future-self auditors — ledger graph reflects actual provenance (not "orphaned decisions")

## Goals / Success Criteria

- `forgeplan health` blind_spots: 10 → 0
- Close 7 of 10 EVID-083 W findings (W1, W4, W5, W6, W7, W8, W10) — skip W2 (workspace-wide rename — major scope), W3 (design decision — separate RFC needed), W9 (XSS — server-side responseMessage not user input)
- m9s real-infra: 4 failing → 0 failing tests
- All gates: typecheck workspace 0 errors, api-core test 393 passing, session test 32 passing

## Functional Requirements

### Phase A — Retroactive evidence links (forgeplan ledger cleanup)
- **FR-A1..A10**: Link existing evidence (EVID-033, EVID-038, EVID-040, EVID-044..047, EVID-048, EVID-051, EVID-053, EVID-055) `informs` to blind-spotted artifacts (PRD-016, RFC-016, RFC-019..026)

### Phase B — Duplicate deprecations
- **Skipped**: 8 forgeplan health "duplicate" pairs are false positives — different waves (12.B/12.C/12.D), different package scopes, different findings. No actual duplicates to deprecate.

### Phase C — EVID-083 W tail (7 medium findings)
- **FR-C1 (W1)**: Rename `PipelineDeps.sessionFactory` params `user_uuid/user_type → operatorUuid/operatorType` (parity with Wave 29.A `OperatorRef.uuid`)
- **FR-C4 (W4)**: Add `await` to `ctx.session?.$destroy()` in cleanup stage (forward-compat with async destroy)
- **FR-C5 (W5)**: Add optional `PipelineDeps.stageTimeoutMs` + `Promise.race`-based per-stage timeout in runner (DoS mitigation)
- **FR-C6 (W6)**: Drop unnecessary `as { success, errors? }` cast in `validate-response.ts`
- **FR-C7 (W7)**: Drop unnecessary `as QueueTraceContext | undefined` cast in `build-trace-context.ts`
- **FR-C8 (W8)**: Strip `.value` field from validator error logging in `validate-response.ts` loose mode (PII redaction)
- **FR-C10 (W10)**: Validate `operator.uuid` non-empty + `operator.type` non-empty in `Session.$switchOperator` before mutation

### Phase D — m9s real-infra test fixes
- **FR-D1**: Ollama tests — set `REDIS_URL=''` + `STORAGE_PROVIDER=memory` before `requireFromHere`; use `randomUUID()` for docIds
- **FR-D2**: BullMQ test — set `STORAGE_PROVIDER=memory` before require (avoids 384-vs-768 dim mismatch in MemoryVectorStore which has no dim check)

### Phase E — Final verification
- **FR-E**: Read-only production-validator confirms all gates green + closure matrix complete

## Non-functional Requirements

- All bumps patch except `@gertsai/api-core` minor (new `PipelineDeps.stageTimeoutMs` field is additive)
- Build + typecheck workspace-wide green
- Test count delta: +5 new (W4, W5×2, W10×2)
- Audit-trail comments `// Wave 33.{Phase} (EVID-083 W-N | m9s test debt)` on every closure

## Acceptance Criteria

- [x] 10 retroactive `informs` links created (Phase A) — blind_spots: 10 → 0
- [x] 7 W findings closed (W1, W4, W5, W6, W7, W8, W10)
- [x] 3 W findings explicitly skipped with rationale (W2, W3, W9)
- [x] m9s real-infra: 0 failed (was 4)
- [x] `pnpm typecheck` workspace 0 errors
- [x] `pnpm --filter @gertsai/api-core test` 393/393 passing
- [x] `pnpm --filter @gertsai/session test` 32/32 passing
- [x] EVID-085 created + linked `informs` PRD-067 + activated

## Out of Scope

- W2 workspace-wide `_uid → uuid` rename across `@gertsai/entity` + `@gertsai/core` — major scope, separate decision
- W3 setStageOverride extension (`addStageBefore`/`wrapStage`) — design decision, future RFC
- W9 wrapResponse XSS hardening — server-side responseMessage, not user input
- v1.0 release prep (major bump 0.x → 1.0.x) — pending user decision

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| EVID-083 | based_on (audit findings — W tail source) |
| EVID-085 | informs (Wave 33 closure proof) |
| PRD-066 | refines (Wave 32 closed CRIT/HIGH; Wave 33 closes medium tail + ledger) |
| Multiple Wave 10-12 EVIDs/RFCs/PRDs | informs (retroactive links Phase A) |



