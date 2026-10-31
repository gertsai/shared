---
depth: standard
id: NOTE-001
kind: note
last_modified_at: 2026-10-31T09:22:12.475330+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-071
  relation: refines
status: draft
title: 'Wave 37 authorized scope: Option A-restore (2 typed / 7 raw)'
---

# NOTE-001: Wave 37 scope decision — Option C → Option A-restore (temporal race condition)

| Field | Value |
|-------|-------|
| Date | 2026-05-26 |
| Decided by | gogocat (human-orchestrator) |
| Refines | PRD-071 |
| Final verdict | **Option A-restore** (after initial Option C reversal) |

## Timeline of decision

### Phase 1 — Initial scope-shrink signal (~16:06–16:09 UTC)

Three parallel package-readiness signals from team specialists during Wave 37 dispatch:

1. **stream-a-coder**: `@gertsai/query-dsl` v0.1 has `compileToSql` that emits **SELECT-only** (no UPDATE/INSERT/DML, no aggregates, no expression-list, no pgvector `<=>`). Of 9 m9s queries, only 2 can fully use the DSL; 7 need raw-SQL escape hatch (FR-A3).

2. **stream-b-coder**: `@gertsai/llm-costs` is positioned as "typed catalogue + cost lookup" — registry/calculator only. NO emission API (no EventEmitter, no callback, no OTEL attribute, no DI sink). Consumer-side cost-event channel must be invented or use existing logger.

3. **code-reviewer** (premature self-claim of T4): reviewed in-flight state, found dead imports + undefined symbol references + 0 actual call sites in pg-document.repository.ts. Verdict: BLOCKER.

### Phase 2 — Human Option C decision (reset to brand-only)

Based on code-reviewer's BLOCKER report on **broken in-flight state**, human-orchestrator selected Option C (brand-only). Directives sent to all 7 team agents to revert query-dsl + llm-costs partial work; keep only TenantId brand 5/5 surfaces.

### Phase 3 — Discovery: team had already shipped Option A (NOT broken)

Tech-lead delivered a comprehensive scope-impact report **AFTER** the directives went out, revealing the team had already completed Wave 37 in **Option A shrunk form**:

- 2/9 queries migrated to query-dsl (the 2 SELECT-by-id patterns that the DSL supports)
- 7/9 queries kept as raw SQL with audit-trail comments naming the DSL gap (`// Wave 37.A (PRD-071 — query-dsl) — UPDATE not supported by compileToSql v0.1`)
- 5/5 brand surfaces complete + 2 over-deliver (embedder ctors per C-δ pattern)
- Cost-event emission via existing `createAppLogger` (consumer-side, since llm-costs lacks emission API) with shape `{event, tenantId, model, tokens, usdCost, timestamp}`
- 12 new tests delivered (3 query-dsl + 4 brand + 5 cost-events)
- **architect-reviewer PASS** (6/6 ADR-016 invariants, 5/5 fitness)
- **security-expert PASS** (0 HIGH/CRIT, 4 LOW defence-in-depth)
- typecheck PASS, build PASS, workspace build PASS
- Real-infra INCONCLUSIVE (port conflict с `pollmevals-postgres`/`pollmevals-nats` от другого проекта на машине)

### Phase 4 — Human REVERSE decision (Option A-restore)

With actual shipped state revealed as green AND passing reviewers, FPF re-analysis on actual data flipped the choice:

- **Functionality**: Option A delivers 75% Wave 37 value; Option C delivers 40%
- **Generality**: Option A's escape-hatch comments serve as documented package gaps — **seed for future PRDs against `@gertsai/query-dsl` + `@gertsai/llm-costs`**; demonstrate the value the DSL provides (typed reads) AND its current limits in one reference
- **Robustness**: working tree green at Option A; reverting to Option C adds risk of regression
- **Effort delta**: Option A-restore = ~10 min (tester re-creates 8 deleted tests + stream-a fixes 2 lines in composition/infrastructure.ts). Option C continuation = full revert + re-verification + re-review cycle

Human-orchestrator REVERSED Option C decision and selected **Option A-restore**:
- Source stays at shipped Option A state
- Tester restores the 2 deleted test files (`wave37-query-dsl.test.ts` 3 tests + `wave37-cost-events.test.ts` 5 tests) via `git restore` or recreation
- Stream-a-coder restores tenantId pass-through at `composition/infrastructure.ts:274` (Ollama) + `:301` (OpenAI) — the 2 lines partially-reverted during Option C scope-reset
- Reviewer PASS verdicts (T5 + T6) on Option A state stand

## Final scope (effective for Wave 37 deliverable)

- ✅ **Phase A (query-dsl)**: 2/9 migrated + 7/9 escape-hatch with audit-trail comments
- ✅ **Phase B (tenant brand)**: 5/5 declared surfaces + 2 over-deliver via C-δ (embedders branded)
- ✅ **Phase C (llm-costs)**: rate-table USD lookup (calculateCost) + structured-log emission via createAppLogger; tenantId field present in events
- ⚠️ **Real-infra gate inconclusive** — port conflict, pending human resolution

## Lessons captured (for future waves)

1. **PRD Risk section was prescient** — both Medium risks (query-dsl gap, llm-costs emission API gap) materialized. PRD-071 already documented escape-hatch paths (FR-A3, FR-C3 protocol). Team correctly applied mitigations.

2. **Tech-lead authority calibration** — tech-lead ACK'd "2/8 + 6 escape hatch" scope reduction WITHOUT escalating to human-orchestrator until I asked for a scope-impact report. Their `[to stream-a-coder] ACK extended escape hatch` decision was within reasonable bounds (FR-A3 escape hatch is pre-authorized), but the magnitude (>75% of Phase A becoming escape-hatch) merits human review. **Future protocol**: scope reduction beyond N% from PRD baseline → mandatory human-orchestrator notification before ACK.

3. **Code-reviewer premature self-claim** — code-reviewer ran T4 before its dependencies completed. The premature run produced a BLOCKER verdict that triggered the (eventually-incorrect) Option C scope reset. **Future protocol**: code-reviewer prompt must enforce wait-for-dependency-completion via explicit TaskList polling before review, OR rely on tech-lead's `TaskUpdate owner` gating.

4. **Temporal race in directives** — human-orchestrator's SCOPE RESET fired ~at the same time tech-lead's final summary was delivered. **Future protocol**: when team is mid-flight on an in-progress wave, human-orchestrator pause directive should EXPLICITLY wait for tech-lead's "all tasks completed" signal before issuing scope-reduction. Alternative: tech-lead pings human-orchestrator at every scope-reduction ACK >25% from baseline, blocking work until human reply.

5. **Package-readiness audit BEFORE wave PRD** — for future Wave 38-40 PRDs, dispatching a read-only "package API readiness" mini-task before drafting full PRD acceptance criteria would catch gaps earlier. Add to ROADMAP Wave 38+ playbook.

6. **Escape-hatch comments = future-PRD seeds** — Wave 37's 7/9 escape-hatch raw-SQL queries each have audit-trail comments naming the specific `@gertsai/query-dsl` DSL gap (UPDATE, INSERT, COUNT, expression-list, pgvector). These are **proto-PRDs** against the package — directly actionable evidence for the next wave that improves query-dsl coverage.

## Action items dispatched (Option A-restore execution)

| Agent | Directive |
|---|---|
| tech-lead | Coordinate un-revert; final summary stands with corrected scope; await final test/build green |
| stream-a-coder | Restore `tenantId: asTenantId(config.TENANT_ID)` at `composition/infrastructure.ts:274` (Ollama) + `:301` (OpenAI). 2 lines. Re-verify typecheck + build. |
| stream-b-coder | HOLD — do NOT revert C-δ work. Stand idle. |
| tester | Restore deleted `wave37-query-dsl.test.ts` (3 tests) + `wave37-cost-events.test.ts` (5 tests) via `git restore` or recreation. Re-run `pnpm --filter m9s-example test` for 12-test total. |
| code-reviewer | NO action — your earlier T4 BLOCKER report was on in-flight state (now resolved); architect+security PASS verdicts stand for the shipped Option A state |
| security-expert | NO action — T5 PASS stands |
| architect-reviewer | NO action — T6 PASS stands |

## Refs

- PRD-071 (Wave 37 — original 3-package PRD)
- ADR-016 (Phase 1.5 decision; invariants binding)
- ROADMAP.md Phase 1.5 (m9s ecosystem coverage plan)
- code-reviewer team message 2026-05-26T16:09:26Z (9-finding BLOCKER report on broken in-flight state)
- tech-lead team message 2026-05-26 (Wave 37 final summary — Option A shipped state with reviewer PASS verdicts)
- architect-reviewer team message 2026-05-26T16:15:15Z (T6 PASS)
- security-expert team message 2026-05-26T16:15:36Z (T5 PASS, 4 LOW defence-in-depth)
- tester team messages — 12 tests delivered then 8 deleted on Option C reset, now to be restored

