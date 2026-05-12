---
depth: standard
id: PRD-010
kind: prd
last_modified_at: 2026-05-12T17:16:50.563177+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-009
  relation: refines
- target: PRD-008
  relation: informs
status: active
title: 'Wave 7.3b: workspace-wide exactOptionalPropertyTypes rollout'
---

# PRD-010: Wave 7.3b — workspace-wide `exactOptionalPropertyTypes` rollout

## Problem Statement

`tsconfig.base.json` now carries `strict: true` and (after Wave 7.3a, PRD-009) `noUncheckedIndexedAccess: true`, but **not** `exactOptionalPropertyTypes` (EOPT). 0 of 38 packages opt in.

Without EOPT, TypeScript treats `foo?: string` and `foo: string | undefined` interchangeably: an interface declaring `bar?: string` accepts both `{}` and `{ bar: undefined }`. With EOPT enabled, the two shapes are distinct — passing `{ bar: undefined }` to an interface declaring `bar?: string` is a type error, requiring callers to use `delete bar` or omit the field entirely.

The earlier `@gertsai/fsm` pilot showed 3 EOPT errors (TS2379/TS2412 — `context?: Readonly<...>` field types where call sites pass an explicit `undefined` instead of omitting the property). Extrapolated workspace-wide error volume is unknown; pilot will measure.

Wave 7.3b completes the strict-flags pair started by Wave 7.3a. After it lands, the workspace has both `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enforced — closing the type-system polish backlog identified post-Mega-Wave-6.

The EOPT-specific risk vs Wave 7.3a: EOPT changes how `?:` properties are represented in emitted `.d.ts`. Consumers who **also** enable EOPT will see stricter checks; consumers who don't enable EOPT are unaffected at compile time but may pass `{ foo: undefined }` where our APIs now intend "foo absent" — runtime behaviour stays the same, but compile-time semantics differ. v0.2.0 not yet published, so no external consumers exist at flag-flip time.

## Target Audience

| Persona | Description | Pain before Wave 7.3b |
|---|---|---|
| `@gertsai/*` package maintainer | Internal developer in this monorepo | Optional-field semantics ambiguous — `{ foo: undefined }` and `{}` typed identically, leading to subtle serialization / spread / `Object.keys` differences at runtime |
| Downstream consumer of `@gertsai/*` v0.2.0 | External developer importing our packages | Receives DTS where `foo?: T` means "may be missing OR explicitly undefined"; no compile-time signal when consumer-side `{ foo: undefined }` was intended to mean "omit" |
| OSS contributor | Anyone opening a PR | Wants compiler to flag `{ field: undefined }` accidents before merge |
| Wave 7.3a + ADR-013 follow-up consumer | Future maintainer reading the type-system polish trail | Needs both flags consistently enabled; Wave 7.3a alone leaves the strict-flag pair half-done |

## Goals

1. **G-1**: `exactOptionalPropertyTypes: true` lives in `tsconfig.base.json`. Measured by `grep exactOptionalPropertyTypes tsconfig.base.json` matching. Satisfies FR-1.
2. **G-2**: All 38 packages typecheck clean (0 errors) with the workspace-wide flag. Measured by `pnpm typecheck` exit code 0. Satisfies FR-2.
3. **G-3**: Test suite shows no regression — pass count ≥ baseline (4953 post-Wave-7.3a), 0 new failing tests. Build pipeline + depcruise + oxlint remain green. Measured by full quality gate run. Satisfies FR-3 + FR-4 + FR-5.

## Functional Requirements

- FR-1: `tsconfig.base.json` carries `"exactOptionalPropertyTypes": true`. Acceptance: `cat tsconfig.base.json` shows the flag adjacent to `noUncheckedIndexedAccess`.
- FR-2: All 38 packages typecheck clean. Acceptance: `pnpm typecheck` exit 0; no TS2379/TS2412/TS2322 errors traceable to optional-property exact-shape violations.
- FR-3: Test suite remains green. Acceptance: `pnpm test` exit 0; pass count ≥ 4953 baseline.
- FR-4: Build pipeline remains green. Acceptance: `pnpm build` exit 0; all 38 dist/ folders populated.
- FR-5: depcruise and oxlint remain green. Acceptance: 0 violations / 0 errors.
- FR-6: Pattern guide documented in this PRD or RFC — how to choose between widening (`foo?: T | undefined`) and call-site narrowing (omit / delete).

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of the merge commit restores pre-Wave-7.3b state | Manual revert smoke on a throwaway branch |
| NFR-2 | Performance | typecheck wall-clock ≤ +20% of Wave-7.3a baseline (14.8s) | `time pnpm typecheck` before/after |
| NFR-3 | Compatibility | No DTS shape changes that break v0.1.0 published consumers | Manual DTS diff on 3 sample tier-1 packages |
| NFR-4 | Pattern consistency | Fixes apply one of three documented patterns: widen-type / omit-at-call / `delete` — chosen per case, not mixed within a file | Code review during build |

## Out of Scope

- Other strict flags (`noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `verbatimModuleSyntax`)
- Wave 7.3a re-work (already shipped)
- API redesign or removing optional-fields that EOPT exposes as ambiguous
- Modifying `examples/m9s-example` source layout (only fix compile errors)
- npm publish of any package (red line per CLAUDE.md)

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | One package surfaces >100 EOPT errors → unbounded effort | Medium | Medium | Pilot the flag locally per package; if any single >100 → pivot to temporary opt-out (RFC will codify) |
| R-2 | Fix introduces silent runtime behaviour change (callers used to pass `undefined` explicitly, now must `delete`) | Low | Medium | Prefer widening (`foo?: T \| undefined`) over forcing call-site changes in shared types; only force `delete` when API author explicitly intended "omit" semantics |
| R-3 | EOPT semantics in emitted `.d.ts` breaks downstream consumers in `gertsai_codex` / `GertsHub` when v0.2.0 publishes | Low | High | v0.2.0 not yet published; document semantic shift in CHANGELOG when we eventually publish |
| R-4 | Test files with deliberate `{ field: undefined }` patterns explode in count | Medium | Low | Allow `// @ts-expect-error` in test files if the pattern is intentional (mocking exact shapes) |

## Strategy (high level — RFC will detail)

**Big Bang with Pilot-then-Pivot** (mirror of RFC-005 strategy for Wave 7.3a):

1. Enable `exactOptionalPropertyTypes: true` in `tsconfig.base.json`.
2. Run `pnpm typecheck` from workspace root, capture total + per-package error counts.
3. Pivot decision:
   - If total ≤ 500 and no single package > 100 → fix all in this PR.
   - If a single package > 100 → temporarily opt out (`exactOptionalPropertyTypes: false` in that package's `tsconfig.json`), continue rollout on rest, follow-up issue for outlier.
   - If total > 500 but distributed → still proceed.

Fix patterns (RFC will detail with examples):
- **Widen type**: `foo?: T` → `foo?: T | undefined` when the optional field is legitimately allowed to be `undefined` (most common — preserves existing call-site behaviour).
- **Omit at call site**: change `{ ...rest, foo: undefined }` to `{ ...rest }` or use conditional spread when callers should not pass the field at all.
- **`delete` at runtime**: when a value must be mutated to remove the field.

## Related Artifacts

| Artifact | Relation | Status |
|---|---|---|
| PRD-009 | precedes (Wave 7.3a sibling — same strict-flags pair) | active |
| RFC-005 | informs (Big Bang with Pilot-then-Pivot pattern reused) | active |
| EVID-024 | informs (Wave 7.3a ship evidence — pattern proven) | active |
| PRD-008 | informs (Wave 7 closure) | active |
| RFC-006 (next) | refines | pending creation |
| EVID-025 (next) | informs | pending after build |

## Affected Files

- `tsconfig.base.json` (primary change)
- `packages/*/src/**/*.ts` — TBD by pilot
- `packages/*/src/**/*.test.ts` — TBD by pilot
- `examples/m9s-example/src/**` — TBD by pilot

## Acceptance Gate

PRD is satisfied when all 3 goals (G-1, G-2, G-3) measured and PASS, all 6 FRs verified, NFR-1 + NFR-2 spot-checked, evidence pack EVID-NNN records the test/typecheck/build counts.






