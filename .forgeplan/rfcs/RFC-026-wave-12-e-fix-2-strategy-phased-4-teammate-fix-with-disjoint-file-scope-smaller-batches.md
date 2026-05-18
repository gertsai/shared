---
depth: standard
id: RFC-026
kind: rfc
last_modified_at: 2026-05-18T19:32:12.799363+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-039
  relation: informs
status: active
title: Wave 12.E-fix-2 strategy — phased 4-teammate fix with disjoint file scope + smaller batches
---

## Context

Wave 12.E-fix-1 attempted parallel 3-teammate execution under team-lead orchestration. All 3 teammates stalled at 600 s watchdog with ZERO file mutations — a system-level failure mode where Agent-spawned LLM did not progress despite valid prompts. Team-lead fallback manually closed 4 (CRIT-2 + CRIT-3 + H-7 + H-17) of 19 findings.

Wave 12.E-fix-2 needs to land the remaining 15 findings without repeating the stall. Strategy: smaller per-teammate scope, verbatim EVID-053 text in prompts, explicit file lists, fail-fast if teammate produces no output by 300 s.

## Decision

**Phased execution with 4 disjoint teammates.**

### Phase 1 — High-value type closures (parallel 2 teammates)

| Teammate | Subagent | Scope | Files | Est. LOC |
|---|---|---|---|---|
| **A** (Backend Redis) | `typescript-pro` | FR-001 (CRIT-1 Redis rotation wiring) | `examples/m9s-example/src/services/auth/src/actions/{login,refresh}.action.ts`, `composition/infrastructure.ts`, `services/auth/src/rotation-store.ts` | ~80 |
| **B** (API-types refactor) | `typescript-pro` | FR-002 + FR-003 (CRIT-4 regen + CRIT-5 delete dead generator) | `examples/m9s-example-api-types/src/{generated/openapi-schema.d.ts, openapi/generator.ts, openapi/types.ts, index.ts}` | ~700 LOC delete + ~150 LOC update |

Phase 1 closes all 3 CRITICALs. If both succeed → Phase 2. If either stalls → team-lead manual fallback for that scope.

### Phase 2 — HIGH closures (parallel 2 teammates after Phase 1 PR merged)

| Teammate | Subagent | Scope | Files | Est. LOC |
|---|---|---|---|---|
| **C** (Backend queue + auth polish) | `typescript-pro` | FR-004 + FR-005 + FR-006 + FR-007 (H-1 JWT_SECRET startup, H-2 queue SSE frames, H-3 _destroyed re-check, H-4 HTTP scrubber) | `examples/m9s-example/src/services/auth/lifecycle.ts`, `services/ingest/src/queues/ingest-chunk.worker.ts`, `composition/errors.ts` | ~150 |
| **D** (Frontend + cross-app + security) | `frontend-developer` | FR-008..FR-015 (XHR auth, SSE auth, api-types auth endpoints, schema type, dist hygiene, PlaceholderPaths, SSE tenant validation, SSE rate limit) | `examples/m9s-example-web/src/{routes/ingest/+page.svelte, lib/{sse-client.ts, api/client.ts, server/jwt.ts}}`, `examples/m9s-example/src/services/sse/api.service.ts`, `examples/m9s-example-api-types/src/{index.ts, openapi/types.ts}` | ~200 |

Phase 2 closes all 10 HIGHs. If either stalls → team-lead manual fallback for that scope.

## Anti-stall mitigations

1. **Verbatim EVID-053 finding text** in each teammate prompt — no summarisation; teammate reads exact "before/after" deltas.
2. **Explicit file list** with line numbers from EVID-053 — teammate doesn't need to grep.
3. **Acceptance test command** in prompt — teammate can self-verify after each fix (`pnpm --filter <pkg> test:<scope>`).
4. **Smaller scope per teammate** — max 4 FRs per teammate (vs Wave 12.E-fix-1's full-3-app-mandate).
5. **Hard 300 s watchdog**: if a teammate produces no `git diff` output by 300 s, team-lead aborts and manual-closes that scope. Wave 12.E-fix-1's 600 s timeout was too forgiving.
6. **No DI cycles** — each teammate's scope is filesystem-disjoint from others. Build verification done at end-of-phase by team-lead, not by teammates.

## Alternatives Considered

**Single 4-teammate parallel batch (Wave 12.B/C/D pattern):** rejected because Wave 12.E-fix-1's 3-teammate parallel also stalled — suggests parallel concurrency itself may be the trigger. Phased 2-teammate-at-a-time reduces concurrency load.

**Solo team-lead execution:** rejected because user explicitly requested AgentsTeam workflow. Team-lead-only would defeat the autorun directive.

**Squash all into single teammate:** rejected because 15 items × varied domains (Redis + Svelte + TypeScript types + Moleculer worker) exceeds reasonable single-context scope.

## Risks

- Phase 1 teammate stall → team-lead fallback budget ~30 min per scope (3 CRITs ≈ 90 min if both stall).
- Phase 2 teammate stall → ~60 min team-lead fallback for 10 HIGHs.
- Total worst-case wall-clock: ~3-4 h if both phases stall. Best case: ~45 min if all teammates succeed.

## Acceptance

- All 13 FRs closed.
- EVID-055 documents Phase 1 + Phase 2 results with stall vs success per teammate.
- PRs land green; user Y at merge + publish gates.

Refs: EVID-053 (audit), PRD-039 (this fix), PRD-038 (Wave 12.E-fix-1 precedent showing stall failure mode).



