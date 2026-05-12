---
depth: standard
id: PRD-009
kind: prd
last_modified_at: 2026-05-12T16:05:23.510112+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-008
  relation: informs
- target: ADR-013
  relation: informs
status: active
title: 'Wave 7.3a: workspace-wide noUncheckedIndexedAccess rollout'
---

# PRD-009: Wave 7.3a — workspace-wide `noUncheckedIndexedAccess` rollout

## Problem Statement

The `@gertsai/*` monorepo has `strict: true` in `tsconfig.base.json` but lacks `noUncheckedIndexedAccess`. Index access (`arr[i]`, `record[key]`) returns `T` instead of `T | undefined`, hiding null-leak bugs from the compiler. These leaks surface as `Cannot read properties of undefined` at runtime.

Four packages (`storage-core`, `ws-rpc`, `query-dsl`, `entity-storage`) opted in individually via per-package `tsconfig.json` overrides during Wave 4B. The remaining 34 packages still rely on the loose default. The opt-in pattern works: those 4 packages compile cleanly with the flag, proving the type-narrowing patterns are achievable across our codebase.

Wave 7.3a finishes the rollout by promoting the flag from per-package opt-in to `tsconfig.base.json` workspace-wide, then fixing compile errors in the 34 remaining packages.

The companion flag `exactOptionalPropertyTypes` is deferred to Wave 7.3b (separate PRD) — pilot showed 3 EOPT errors in `@gertsai/fsm` alone, and the fix patterns are more invasive than for `noUncheckedIndexedAccess`. Splitting reduces blast radius per PR.

## Target Audience

| Persona | Description | Pain before Wave 7.3a |
|---|---|---|
| `@gertsai/*` package maintainer | Internal developer working in this monorepo | Index-access null leaks pass through code review and tests, surface as runtime crashes downstream |
| Downstream consumer of `@gertsai/*` v0.2.0 | External developer importing our packages | Receives DTS that overstates safety — index access typed as `T` when reality is `T \| undefined` |
| OSS contributor (future) | Anyone opening a PR against the monorepo | Wants compiler-enforced strict environment so accidental null leaks fail CI before merge |
| Wave 7.3b implementer (us, next sprint) | Future me running EOPT rollout | Needs `noUncheckedIndexedAccess` already in place so EOPT pilot baselines accurately on a strict-floor workspace |

## Goals

1. **G-1**: `noUncheckedIndexedAccess: true` lives in `tsconfig.base.json`; the 4 per-package overrides are removed (single source of truth). Measured by `grep noUncheckedIndexedAccess packages/*/tsconfig.json` returning 0 matches. Satisfies FR-1 + FR-2.
2. **G-2**: All 38 packages typecheck clean (0 errors) with the workspace-wide flag. Measured by `pnpm typecheck` exit code 0. Satisfies FR-3.
3. **G-3**: Test suite shows no regression — pass count ≥ baseline (~4843 per most recent prior evidence), 0 new failing tests. Build pipeline remains green (FR-5) and quality gates clean (FR-6). Measured by `pnpm test`, `pnpm build`, `pnpm depcruise`, `pnpm oxlint`. Satisfies FR-4 + FR-5 + FR-6.

## Functional Requirements

- FR-1: `tsconfig.base.json` carries `"noUncheckedIndexedAccess": true`. Acceptance: `cat tsconfig.base.json` shows the flag.
- FR-2: No per-package `tsconfig.json` overrides this flag. Acceptance: `grep` returns nothing.
- FR-3: All 38 packages typecheck clean. Acceptance: `pnpm typecheck` exit 0; no TS2532/TS18047/TS18048 errors.
- FR-4: Test suite remains green. Acceptance: `pnpm test` exit 0; pass count ≥ baseline.
- FR-5: Build pipeline remains green. Acceptance: `pnpm build` exit 0; all 38 dist/ folders populated. (Referenced in G-3.)
- FR-6: depcruise and oxlint remain green. Acceptance: 0 violations / 0 errors. (Referenced in G-3.)

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of the merge commit restores pre-Wave-7.3a state | Manual revert smoke on a throwaway branch |
| NFR-2 | Performance | typecheck wall-clock ≤ +20% of baseline | `time pnpm typecheck` before/after |
| NFR-3 | Compatibility | No DTS shape changes that break v0.1.0 published consumers | Manual DTS diff on 3 sample tier-1 packages |
| NFR-4 | Code-style consistency | Fixes prefer narrowing (`if (x)`, `?.`, `arr.at(i) ?? throw`) over non-null assertions (`!`) | Code review during build |

## Out of Scope

- `exactOptionalPropertyTypes` flag (Wave 7.3b — separate PRD)
- Other strict flags (`noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `verbatimModuleSyntax`)
- API redesign or removing now-discovered narrowing-friendly types
- Modifying `examples/m9s-example` source layout (only fix compile errors if any surface)
- npm publish of any package (red line per CLAUDE.md)

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | One package surfaces >100 errors → unbounded fix scope | Low | Medium | Pilot the flag locally on 3-4 representative packages first; if >100 errors per package → escalate to Deep or split per-package |
| R-2 | Fix introduces implicit null check perf regression on hot path (pg-client / storage-core) | Low | Medium | Spot-benchmark m9s real-infra suite before/after; revert flag if regression > 5% |
| R-3 | Non-null assertion overuse (`!`) silently re-opens null leaks | Medium | Medium | NFR-4 review during build; grep for `!` additions in fix commits |
| R-4 | Test files have many index accesses → fix scope explodes | Medium | Low | Allow `// @ts-expect-error` in test-utils when pattern is verbose and non-trivial |

## Strategy (high level — RFC will detail)

**Tactical pilot first** — enable flag in base config, run `pnpm typecheck` from workspace root, count + categorize errors per package. Then decide:
- If errors are uniformly small (≤ 20 per package) → fix all in one PR/commit
- If concentrated in 1-2 packages with large counts → bring those packages back to per-package opt-out temporarily, ship the rest first, then handle outliers in a follow-up

## Related Artifacts

| Artifact | Relation | Status |
|---|---|---|
| PRD-008 | precedes (Wave 7 closure) | active |
| ADR-013 | precedes (storage capability) | active |
| Wave 7.3b (TBD PRD) | sibling (EOPT rollout) | not_started |
| RFC-NNN | next | pending creation |

## Affected Files

- `tsconfig.base.json` (primary change)
- `packages/{storage-core,ws-rpc,query-dsl,entity-storage}/tsconfig.json` (remove redundant override)
- `packages/*/src/**/*.ts` (compile-error fixes — count TBD by pilot)
- `packages/*/src/**/*.test.ts` (test compile-error fixes — count TBD by pilot)

## Acceptance Gate

PRD is satisfied when all 3 goals (G-1, G-2, G-3) measured and PASS, all 6 FRs verified, NFR-1 + NFR-2 spot-checked, and evidence pack EVID-NNN records the test/typecheck/build counts.








