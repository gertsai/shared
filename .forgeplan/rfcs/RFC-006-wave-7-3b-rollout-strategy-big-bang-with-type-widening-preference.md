---
depth: standard
id: RFC-006
kind: rfc
last_modified_at: 2026-05-12T17:17:47.649914+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-010
  relation: refines
- target: PRD-009
  relation: informs
- target: RFC-005
  relation: informs
status: draft
title: 'Wave 7.3b rollout strategy: Big Bang with type-widening preference'
---

# RFC-006: Wave 7.3b rollout strategy — Big Bang with type-widening preference

## Summary

Promote `exactOptionalPropertyTypes: true` from absent to workspace-wide in `tsconfig.base.json`. Run a single typecheck pilot to measure error volume; if any package exceeds 100 errors or total exceeds 500, that package gets a temporary `false` opt-out and continues in a follow-up. Apply three fix patterns by case (widen / omit / delete) with widening preferred for **public** API surfaces and omission preferred for **internal** call-site simplification.

## Motivation

PRD-010 leaves the rollout shape open. ADI reasoning on PRD-010 ranked three candidates: H1 Conservative Widening, H2 Strict Omission, H3 Pilot-then-Pivot.

The strict choice (H2) requires refactoring object literals to conditional spread or `delete` calls, which adds verbosity and creates a runtime-behaviour-change risk on hot paths (PRD-010 R-2). The widen-only choice (H1) reduces verbosity but dilutes EOPT's benefit and adds DTS noise. The pivot strategy (H3) mirrors Wave 7.3a (RFC-005) and is the only choice that bounds the unknown-error-volume risk.

ADI recommendation: H3 baseline, with **H1 for public types** (preserve consumer call-site behaviour) and **H2 for internal types** (where author has full control over call sites). We adopt that recommendation.

## Proposed Direction

### Decision

1. **Promote** `exactOptionalPropertyTypes: true` into `tsconfig.base.json`, adjacent to the existing `noUncheckedIndexedAccess`.
2. **Pilot smoke** — run `pnpm typecheck` from workspace root, capture total + per-package error counts.
3. **Pivot decision**:
   - If total errors ≤ 500 **and** no single package > 100 errors → fix all in this PR (Big Bang).
   - If a single package > 100 errors → add `"exactOptionalPropertyTypes": false` to that package's local `tsconfig.json` (temporary opt-out), continue rollout on the rest, file follow-up issue for the outlier.
   - If total > 500 but distributed → still proceed; allow ≤ 5 `// @ts-expect-error` per test file (PRD-010 R-4 mitigation).
4. **Fix-pattern preference** by surface type:

   | Surface | Preferred pattern | Rationale |
   |---|---|---|
   | Public types (`export interface`, exported function param types) | **Widen** — `foo?: T` → `foo?: T \| undefined` | Preserves downstream consumer call-site behaviour. Wave 7.3b is not the right place to change public API ergonomics |
   | Internal types (non-exported, file-local, or `_internal` package boundary) | **Omit** — change `{ ...rest, foo: undefined }` to conditional spread or remove the field | Author has full control; keeps internal types crisp |
   | Test fixtures | **Omit** preferred; `// @ts-expect-error` allowed for mocks deliberately exercising EOPT semantics | Tests already constrain themselves |
   | Optional method-return rewrites | **Widen** — return-type signatures stay backwards-compatible | Same rationale as public types |

5. **Quality gates** before evidence: `pnpm typecheck` (0 errors) + `pnpm test` (≥ 4953 baseline) + `pnpm build` (38 dist/ folders) + `pnpm depcruise` (0 violations) + `pnpm oxlint` (0 errors).

### Implementation Order

1. Capture baseline: `time pnpm typecheck` (current floor — both Wave 7.3a flags now in effect).
2. Edit `tsconfig.base.json` to add `exactOptionalPropertyTypes: true`.
3. Run `pnpm typecheck` → categorize errors per package.
4. Apply pivot rule decision (continue Big Bang OR temporary opt-out for outliers).
5. Fix errors package-by-package (smallest first to build momentum) — use fix patterns per §Decision.
6. Run full quality gates.
7. Create EVID-NNN with structured fields.
8. Activate PRD-010 + RFC-006.
9. Commit locally (no push without user Y per CLAUDE.md).

## Invariants

- **I-1**: `tsconfig.base.json` is the single source of truth for `exactOptionalPropertyTypes` once Wave 7.3b ships. Per-package overrides are reserved exclusively for the pivot-rule temporary opt-out and MUST carry a comment naming the follow-up issue.
- **I-2**: Public type signatures get **widened** unless the package author explicitly decides "this field cannot be `undefined` even when present" — recorded in the diff message.
- **I-3**: Internal types get **omitted at call sites** unless the value provenance makes the conditional spread unreadable, in which case widening is acceptable.
- **I-4**: `// @ts-expect-error` budget is tests-only; production code resolves via narrowing or pattern application.
- **I-5**: Wave 7.3b is non-blocking with Wave 7.3a — runs on top of an already-strict workspace floor.

## Acceptance Test (per PRD-010 FRs)

- FR-1 — `cat tsconfig.base.json | grep exactOptionalPropertyTypes` ⇒ matches
- FR-2 — `pnpm typecheck` ⇒ exit 0
- FR-3 — `pnpm test` ⇒ pass count ≥ 4953
- FR-4 — `pnpm build` ⇒ exit 0, 38 dist/ folders populated
- FR-5 — `pnpm depcruise && pnpm oxlint` ⇒ 0 violations / 0 errors
- FR-6 — pattern guide documented in §Decision above
- NFR-1 — `git revert <merge-sha>` restores pre-Wave-7.3b state cleanly
- NFR-2 — `time pnpm typecheck` before/after ⇒ delta ≤ +20% (baseline 14.8s post-Wave-7.3a)
- NFR-3 — manual DTS diff on 3 sample packages ⇒ widened-optional signatures backwards-compatible
- NFR-4 — fix commits choose one pattern per case, no mixing within a file

## Alternatives Considered

| Alt | Rejection reason |
|---|---|
| H1 only (widen everything) | Dilutes EOPT benefit on internal types; adds DTS noise without value where author already controls call sites |
| H2 only (force omit) | Higher verbosity, hot-path perf risk on conditional spreads, no escape hatch for unknown error volume |
| Tactical (just flip the flag, fix later) | Active code review surface during the wave's lifetime would balloon as new code hits the flag without a chosen pattern |
| Per-package rollout (1 PR per package) | 38 trivial PRs; review overhead delays the Wave 7.3 closure |

## Rollback Plan

If post-merge a regression surfaces:

- **Tactical revert** — single `git revert` of the merge commit removes the flag from `tsconfig.base.json` and reverts all per-file fixes. Workspace returns to pre-Wave-7.3b state.
- **Partial revert** — if only one package is problematic, add `"exactOptionalPropertyTypes": false` to that package's local `tsconfig.json` (pivot rule). Other packages stay strict.

NFR-1 invariant: rollback is a single mechanical operation; the underlying type widening/omission fixes are valuable independently of the flag (defensive type modelling).

## Risks (delta vs PRD-010 risks)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | Pattern preference (widen public, omit internal) conflates with "exported vs not exported" — boundary unclear in monorepo | Define "public" as exported from package `index.ts` or its subpath exports. Anything not re-exported is internal |
| RFC-R-2 | Widening leaks `\| undefined` into `Pick<T, K>` / `Required<T>` utility-type consumers | Verify on `@gertsai/runtime-context` and `@gertsai/storage-core` (heaviest utility-type users) during build |
| RFC-R-3 | EOPT changes JSON.stringify behaviour for `{ foo: undefined }` → omits the key. Some snapshot tests may break | Verified during `pnpm test` run; if breaks, fix at test layer (snapshot update) not at production code |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-010 | refines (RFC-006 is the strategy detail for PRD-010) |
| PRD-009 | informs (sibling — Wave 7.3a precedent) |
| RFC-005 | informs (Big Bang with Pilot-then-Pivot pattern reused) |
| PRD-008 | informs (Wave 7 closure context) |
| EVID-024 | informs (Wave 7.3a ship evidence — pattern proven) |




