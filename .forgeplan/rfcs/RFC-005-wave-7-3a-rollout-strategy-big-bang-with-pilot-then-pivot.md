---
depth: standard
id: RFC-005
kind: rfc
last_modified_at: 2026-05-12T16:07:17.556844+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-009
  relation: refines
- target: PRD-008
  relation: informs
- target: ADR-013
  relation: informs
status: active
title: 'Wave 7.3a rollout strategy: Big Bang with Pilot-then-Pivot'
---

# RFC-005: Wave 7.3a rollout strategy — Big Bang with Pilot-then-Pivot

## Summary

Promote `noUncheckedIndexedAccess: true` from per-package opt-in (4 of 38 packages today) to workspace-wide `tsconfig.base.json`. Run a single typecheck pilot to measure error volume; if any package exceeds 100 errors or total exceeds 500, that package gets a temporary `false` opt-out and continues in a follow-up. All other packages fix errors in-place using narrowing patterns. Single PR, single revert path.

## Motivation

PRD-009 leaves the rollout shape open. Three candidate strategies were ranked by ADI reasoning on PRD-009:

- **H1 Big Bang** — global flag flip, fix everything in one PR.
- **H2 Inverted Opt-Out** — global flag flip but every package opts out, then removed one-by-one.
- **H3 Utility-First** — introduce shared `assertDefined()` helper first.

H2 leaves the workspace in a fragmented half-strict state and contradicts PRD-009 G-1 (single source of truth). H3 adds a public utility and lock-in to a non-standard pattern, plus NFR-2 perf risk on hot paths in `storage-core`. The 4 existing strict packages (Wave 4B) prove the codebase tolerates the flag, so the marginal value of either H2 or H3 over H1 is small.

We choose H1 but bound its main risk (one package with disproportionate error volume blocking the rest) via a single pivot rule: temporarily opt out the outlier, ship the rest, follow up. This preserves the single-PR review path for the common case while giving an escape hatch for the unexpected.

## Proposed Direction

### Decision

1. **Promote** `noUncheckedIndexedAccess: true` into `tsconfig.base.json`.
2. **Remove** the 4 existing per-package opt-ins (`storage-core`, `ws-rpc`, `query-dsl`, `entity-storage`) — redundant once the base config carries the flag (PRD-009 G-1).
3. **Pilot smoke** — run `pnpm typecheck` from workspace root, capture total + per-package error counts.
4. **Pivot decision**:
   - If total errors ≤ 500 **and** no single package > 100 errors → fix all in this PR (Big Bang).
   - If a single package > 100 errors → add `"noUncheckedIndexedAccess": false` to that package's local `tsconfig.json` (temporary opt-out), continue rollout on the rest, file follow-up issue for the outlier.
   - If total > 500 but distributed → still proceed (preserves single PR), but allow ≤ 5 `// @ts-expect-error` per test file (PRD-009 R-4 mitigation).
5. **Fix patterns** — prefer narrowing in this order:
   - `if (x !== undefined)` or `if (x)` guard
   - Optional chaining `x?.method()`
   - `arr.at(i) ?? throw new Error(...)` for required reads
   - Type guards (`function isFoo(x): x is Foo`)
   - **Avoid** `!` non-null assertion (PRD-009 NFR-4); allowed only when (a) tightly scoped to a check immediately above OR (b) in tests with a brief inline comment.
6. **Quality gates** before evidence: `pnpm typecheck` (0 errors) + `pnpm test` (≥ baseline pass count) + `pnpm build` (38 dist/ folders) + `pnpm depcruise` (0 violations) + `pnpm oxlint` (0 errors).

### Implementation Order

1. Capture baseline: `time pnpm typecheck` (current floor, 4 packages opted in).
2. Edit `tsconfig.base.json` to add the flag.
3. Remove 4 redundant per-package overrides.
4. Run `pnpm typecheck` → categorize errors per package.
5. Apply pivot rule decision (continue Big Bang OR temporary opt-out for outliers).
6. Fix errors package-by-package (smallest first to build momentum) — use narrowing patterns per §Decision.
7. Run full quality gates.
8. Create EVID-NNN with structured fields.
9. Activate PRD-009 + RFC-005.
10. Commit locally (no push without user Y per CLAUDE.md).

## Invariants

- **I-1**: `tsconfig.base.json` is the single source of truth for `noUncheckedIndexedAccess` once Wave 7.3a ships. Per-package overrides are reserved exclusively for the pivot-rule temporary opt-out and MUST carry a brief comment naming the follow-up issue.
- **I-2**: Pivot threshold operates at the package level, not the file level. A single fat file in an otherwise-cheap package gets refactored, not opted out at the package boundary.
- **I-3**: `// @ts-expect-error` budget is tests-only; production code must narrow. Reviewed during commit.
- **I-4**: NFR-4 (avoid `!`) applies in production code unless the assertion is tightly scoped to a check on the line above and the value provenance is local.

## Acceptance Test (per PRD-009 FRs)

- FR-1 — `cat tsconfig.base.json | grep noUncheckedIndexedAccess` ⇒ matches
- FR-2 — `grep noUncheckedIndexedAccess packages/*/tsconfig.json` ⇒ empty (unless pivot was triggered, in which case only the pivoted package matches with `false`)
- FR-3 — `pnpm typecheck` ⇒ exit 0
- FR-4 — `pnpm test` ⇒ pass count ≥ baseline (~4843)
- FR-5 — `pnpm build` ⇒ exit 0, 38 dist/ folders populated
- FR-6 — `pnpm depcruise && pnpm oxlint` ⇒ 0 violations / 0 errors
- NFR-1 — `git revert <merge-sha>` on a throwaway branch restores pre-Wave-7.3a state with clean typecheck under old flag set
- NFR-2 — `time pnpm typecheck` before/after ⇒ delta ≤ +20%
- NFR-3 — manual DTS diff on 3 sample packages ⇒ no shape-breaking changes
- NFR-4 — fix commits prefer narrowing; `!` additions reviewed individually

## Alternatives Considered

| Alt | Rejection reason |
|---|---|
| H2 Inverted Opt-Out | Leaves workspace fragmented for weeks; contradicts G-1; slower path to Wave 7.3b baseline |
| H3 Utility-First | Public API change in scope of an out-of-scope concern; perf risk on `storage-core` hot paths (NFR-2) |
| Skip pivot, force fix everything in one go | Violates risk discipline — bunkers in a single PR with unbounded error count |
| Per-package rollout (1 PR per package) | 34 trivial PRs, review overhead, delays Wave 7.3b |

## Rollback Plan

If post-merge a regression surfaces (test failure, runtime crash, build break):

- **Tactical revert** — single `git revert` of the merge commit restores `tsconfig.base.json` and re-introduces the 4 per-package overrides + reverts compile-error fixes. Workspace returns to pre-Wave-7.3a state.
- **Partial revert** — if only one package is problematic, add `"noUncheckedIndexedAccess": false` to that package's local `tsconfig.json` (same as the pivot rule). Other packages stay strict.

NFR-1 invariant: rollback is a single mechanical operation; the underlying narrowing fixes are valuable independently of the flag (defensive programming).

## Risks (delta vs PRD-009 risks)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | Pivot triggers on tiny package due to one large file → unnecessary opt-out | Threshold applied at package level, not file. If single file is the culprit, refactor it instead of opting the whole package out (I-2). |
| RFC-R-2 | `// @ts-expect-error` budget abused in non-test code | Strictly tests-only; production code must narrow (I-3). Review during commit. |
| RFC-R-3 | Build pipeline slowdown beyond NFR-2 budget | Most narrowing patterns are zero runtime cost; the typecheck slowdown is small per TS docs. |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-009 | refines (RFC-005 is the strategy detail for PRD-009) |
| PRD-008 | informs (Wave 7 closure context) |
| ADR-013 | informs (storage capability precedent — `noUncheckedIndexedAccess` already lived in storage-core per Wave 4B) |





