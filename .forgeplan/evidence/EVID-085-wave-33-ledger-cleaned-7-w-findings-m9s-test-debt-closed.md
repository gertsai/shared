---
depth: standard
id: EVID-085
kind: evidence
last_modified_at: 2026-05-21T16:33:52.842291+00:00
last_modified_by: claude-code/2.1.145
links:
- target: PRD-067
  relation: informs
status: active
title: Wave 33 — ledger cleaned + 7 W findings + m9s test debt closed
---

# EVID-085: Wave 33 — ledger cleaned + 7 W findings + m9s test debt closed

| Field | Value |
|-------|-------|
| Status | Draft |
| Target | PRD-067 (Wave 33 scope) |

## Structured Fields

evidence_type: measurement
verdict: supports
congruence_level: 3

## Measurement

5-phase Wave 33 forge-cycle:
- **Phase A** (Forgeplan MCP only): 10 `informs` links created — blind_spots 10 → 0
- **Phase B**: Skipped — 8 "duplicate" pairs are false positives (different waves/scopes)
- **Phase C** (typescript-pro): 7 W findings closed (W1, W4, W5, W6, W7, W8, W10); 3 skipped (W2, W3, W9)
- **Phase D** (tester): 4 m9s real-infra test failures fixed
- **Phase E** (production-validator): final read-only verification — APPROVE

Conditions:
- Branch: `chore/wave-33-ledger-cleanup-w-tail`
- Toolchain: Node ≥22 · pnpm 10 · TS 5.9 · Vitest 3
- Live Docker stack for m9s smoke (postgres+redis+ollama+nats+openfga)

## Result

**Closures**:

| Phase | Finding | File:Closure |
|-------|---------|--------------|
| A | 10 blind spots | EVID-033/038/040/044/045/046/047/048/051/053/055 → PRD-016, RFC-016, RFC-019..026 (`informs` links) |
| C | W1 | `pipeline/types.ts` — sessionFactory params operatorUuid/operatorType |
| C | W4 | `cleanup.ts` — `await ctx.session?.$destroy()` |
| C | W5 | `runner.ts` + `types.ts` — `stageTimeoutMs` + Promise.race + timer cleanup |
| C | W6 | `validate-response.ts` — drop `as { success, errors? }` cast |
| C | W7 | `build-trace-context.ts` — drop `as QueueTraceContext | undefined` cast |
| C | W8 | `validate-response.ts` — strip `.value` from validator error log (PII) |
| C | W10 | `Session.$switchOperator` — validate uuid + type pre-mutation |
| D | 3 Ollama tests | `real-infra.test.ts` — REDIS_URL='' + STORAGE_PROVIDER=memory + randomUUID() docIds |
| D | 1 BullMQ test | `bullmq.test.ts` — STORAGE_PROVIDER=memory |

**Explicitly skipped (out of scope)**:
- W2: workspace-wide `_uid → uuid` rename (`@gertsai/entity._uid`, `core/session.UsersMetaType.data._uid`) — major scope, separate decision
- W3: setStageOverride extension API — design decision, future RFC needed
- W9: wrapResponse XSS hardening — `responseMessage` is server-side, not user input

**Files changed**: 32 files, +304/-25 LOC.

**Pipeline gate results**:
- `pnpm typecheck` workspace: 0 errors
- `pnpm --filter @gertsai/api-core test`: 393 passed (+3 since Wave 32)
- `pnpm --filter @gertsai/session test`: 32 passed (+2 since Wave 32)
- `pnpm --filter @gertsai/api-core build`: dual ESM+CJS green
- `pnpm --filter @gertsai/api-core perf:check`: baseline reproducible
- m9s real-infra (live Docker): 15 passed, 0 failed (was 11 passed, 4 failed)
- `forgeplan health`: blind_spots 10 → 0 (verdict still "unhealthy" due to false-positive duplicate pairs — same-wave variants — and 1 orphan PRD-067 which becomes linked on activation)

## Interpretation

PRD-067 acceptance criteria fully met. After Wave 33:
- Audit ledger reflects accurate provenance for all activated artifacts
- 7/10 W tail medium findings closed (70%); remaining 3 explicitly deferred with documented rationale
- m9s real-infra suite restored to green — test design now consistent with post-Wave-12.E mandatory auth + post-Wave-5 PgVectorStore dimension contract

Combined audit closure stats across the session:
- EVID-080 (Wave 25): 23/23 closures (100%)
- EVID-083 (Wave 31): 11/11 CRIT+HIGH + 7/10 medium = 18/21 (86%)
- Total deferred (intentional): W2, W3, W9 + v1.0 release decision

## Congruence Level Justification

CL3 same-context: all gates run on this repo's branch; m9s smoke against live Docker stack; perf:check on same machine as baseline.

Verdict `supports`: PRD-067 named these closures as AC; all verified by Phase E read-only validator.

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| PRD-067 | informs (parent) |
| EVID-083 | informs (Wave 31 audit — W tail source) |
| PRD-066 | informs (Wave 32 — CRIT/HIGH preceded W tail) |
| EVID-084 | informs (Wave 32 closure proof) |



