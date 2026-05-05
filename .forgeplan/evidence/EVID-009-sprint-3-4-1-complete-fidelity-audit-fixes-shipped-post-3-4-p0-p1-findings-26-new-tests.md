---
depth: standard
id: EVID-009
kind: evidence
last_modified_at: 2026-05-05T22:20:42.633060+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-007
  relation: informs
- target: EVID-008
  relation: informs
- target: ADR-005
  relation: informs
- target: PRD-002
  relation: informs
status: active
title: Sprint 3.4.1 complete — fidelity audit fixes shipped (post-3.4 P0/P1 findings, 26 new tests)
---

# EVID-009: Sprint 3.4.1 complete — fidelity audit fixes shipped

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 3.4.1 — post-Sprint 3.4 fidelity fix sprint per audit-post-sprint-3-4 (4 architect-reviewer agents, 1 per package). All 4 packages got GO-WITH-FIXES verdict; 18 W-items addressed via 3∥ AgentTeams workers (entity-fix, entity-audit-fix, session+di-fix). Single integrated commit `c4b1182`. Test count: 4194 → **4220 passed / 103 skipped** (+26 new fidelity-fix tests). 0 регрессий.

## Measurement

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ clean |
| `pnpm build` | ✅ 23 packages + m9s-example green |
| `pnpm test` | ✅ **4220 passed / 103 skipped** (Sprint 3.4 baseline 4194 + 26 new) |
| `pnpm typecheck` | ✅ all green |
| `pnpm run lint` | ✅ All good |
| `pnpm run publint` | ✅ All good |
| `pnpm run depcruise` | ✅ 0 violations |

## Critical fix evidence

### `@gertsai/entity-audit` — recovered from KRITIKAL silent loss

Sprint 3.4 reviewer found 3/4 builders silently dropped `update_action` audit log + status field never written + `operatorType vs clientPlatform` semantic bug. **This package's name promises audit; pre-fix it didn't deliver.**

Fixes:
- F-9: `update_action` восстановлен в buildDataForUpdate/Delete/Restore.
- F-10: `creator_uuid` rename (Orchestra DB schema parity).
- F-11: `clientPlatform` semantic bug fixed across 4 builders.
- F-12: `EntityBasicStatus` теперь open string union с autocomplete hints; `'created'` added.
- F-13: `buildDataForSet` accepts `_uid` + status + base/overrides + emits update_action.
- F-14: `UpdateAction.type` discriminant via UpdateActionType narrowing (PARTIAL — `Action extends string` constraint per Orchestra; declare-module narrows .type).
- 18 → 30 tests (+12).

### `@gertsai/entity` — production-grade restoration

Fixes:
- F-1: $isMockup polarity decision (kept `true` default; aliases $isUnsaved/$isOptimistic; README migration row + FAQ).
- F-2/F-3: $patch/$setMetadata returns boolean + per-key deepEqual gating; no-op skips event.
- F-4: toJSONObject + toJSON + EntityJSON types restored.
- F-5: markRaw(this) called automatically (Vue perf regression закрыт).
- F-6: Function-as-uid lazy form restored (`uid?: string | (() => string)`).
- F-7: uidPath?: readonly string[] for hierarchical id models.
- F-8: README rewrite — Migration table + fixed React/Solid/MobX snippets + Compatibility section + FAQ.
- 32 → 46 tests (+14).

### `@gertsai/session` + `@gertsai/di` — README + small additions

- F-16: 'auth' added to OperatorType (Programmatic category).
- F-17: README rewrite — Token refresh + errorHandler + $destroy lifecycle + Migrating from OrchestraSession + 24-value OperatorType reference table.
- F-18: di README license footer UNLICENSED → Apache-2.0 + 5 missing exports added + Best practices safeDestroyAll example + Deferred parameterized-identifier roadmap.
- No test changes.

## Convergent themes addressed

1. **Migration guide from Orchestra** — added в README всех 4 packages.
2. **Production-grade examples** — token refresh / errorHandler / $destroy / safeDestroyAll / soft-delete lifecycle.
3. **Compatibility tables** — entity has Node ≥19/22 + browser support.
4. **Side-channel signals restored** — boolean returns ($patch/$setMetadata) + update_action audit log.
5. **OSS-readiness** — Troubleshooting/FAQ + best practices + audit-log query examples.

## Pattern validated

**POST-extraction fidelity audit** (4 architect-reviewer agents, 1 per package, ~10 min wall-clock) found КРИТИЧНОЕ silent loss (3/4 entity-audit builders dropped audit log) которого никто из Phase A workers не флагировал. Pattern становится standard для multi-package extraction sprints — после Pre-Build audit (Group 21 pattern) теперь добавляется Post-Build fidelity audit (Group 28 pattern).

## Verdict rationale

`supports` SPEC-007 + EVID-008 (corrects gaps) + ADR-005 + PRD-002:
- All 18 W-items DONE (F-14 PARTIAL but documented с rationale).
- Zero test regressions (4220 = Sprint 3.4 baseline 4194 + 26 new).
- All CI gates green.
- All ADR-005 invariants preserved (no new firestore/firelord/Vue hard imports).
- Production-grade gaps closed across 4 packages.

`congruence_level: 3` (CL3): full repo measurements, real tests, real CI gates.

`evidence_type: measurement`.

## Decisions driven by this evidence

- Sprint 3.5 Wave 4B (storage-core + entity-storage + query-dsl + pg-client adapter) ready to start. Entity/Session/Audit foundation теперь production-grade.
- Audit pattern (Pre-Build + Post-Build fidelity) сейчас documented и validated дважды в repo history.
- Wave 5 (entity-vue/-react/-svelte/-solid + session scoping + runtime-context) можно строить поверх consolidated Wave 4A.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| SPEC-007 (Sprint 3.4 — Wave 4A foundation extraction checklist) | Spec | informs (corrects gaps from baseline) |
| EVID-008 (Sprint 3.4 complete) | Evidence | informs (gaps documented in audit) |
| ADR-005 (Storage-core architecture + Orchestra extraction policy) | ADR | informs (extraction policy validated) |
| PRD-002 (Wave 4 — Entity/Repository Foundation) | PRD | informs |
| audit-post-sprint-3-4 (4 architect-reviewers) | external | drives all F-1..F-18 fixes |

> **Next step**: Sprint 3.5 SPEC-008 + Build (Wave 4B storage layer).





