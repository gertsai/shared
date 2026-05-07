---
depth: standard
id: EVID-014
kind: evidence
last_modified_at: 2026-05-06T19:47:05.223304+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: informs
- target: ADR-007
  relation: informs
- target: SPEC-012
  relation: informs
- target: ADR-008
  relation: informs
- target: SPEC-013
  relation: informs
status: active
title: Sprint 3.7 shipped — Wave 5 Phase 2 (runtime-context + session-guard + audit-primitives + errors patch + entity-audit E+)
---

# EVID-014: Sprint 3.7 shipped — Wave 5 Phase 2

## Structured fields

- **Verdict**: SUPPORTS (PRD-003 G-4 satisfied; ADR-007 invariants I-1..I-22 verified by 3∥ post-Build fidelity audit; 5∥ pre-Build audit caught + addressed 1 convergent P0 + 7 substantive P0/P1 BEFORE Build).
- **Congruence Level**: CL3 (full implementation matches spec; 1 P1 detected + fixed in audit-fix loop; backward compat for `@gertsai/entity-audit` E+ refactor verified — 30/30 tests pass post-refactor).
- **Evidence Type**: CI verification + multi-reviewer audit (5∥ pre-Build + 3∥ post-Build).
- **Date**: 2026-05-06.
- **Branch**: `feat/sprint-3-7-wave-5-phase-2` (off `feat/sprint-3-6-wave-5-phase-1`).

## What shipped

| Deliverable | Type | Strategy | Tests added |
|---|---|---|---|
| `@gertsai/runtime-context` v0.1.0 | NEW Tier 4 package | F (fresh) | 51 |
| `@gertsai/session-guard` v0.1.0 | NEW Tier 2 package | F (fresh) | 47 |
| `@gertsai/audit-primitives` v0.1.0 | NEW Tier 2 package | F (fresh) | 20 |
| `@gertsai/errors` patch (parametric refactor) | E+ enhancement | E+ (additive only) | 6 |
| `@gertsai/entity-audit` E+ refactor (re-export) | E+ enhancement | E+ (additive only) | 0 (regression) |

**Total Sprint 3.7 wall-clock**: ~5h (4∥ workers parallel; pre-Build audit 5∥ ~10min synthesize; Build ~1h; Phase B verify ~10min; Phase C audit ~15min; P1 fix-loop ~10min; Phase D ~10min).

## Structured measurements

| Metric | Sprint 3.6 baseline | Sprint 3.7 actual | Δ |
|---|---|---|---|
| Test count (passed) | 4573 | **4697** | **+124** (target +59, 2.1×) |
| Package count | 28 | **31** | +3 (runtime-context, session-guard, audit-primitives) |
| Forgeplan artifacts | 34 (26 active) | **38** (30 active) | +4 (ADR-007, SPEC-012, EVID-014, runtime auto-state) |
| Active ADRs | 6 | 7 | +1 (ADR-007) |
| Active specs | 9 | 10 | +1 (SPEC-012) |
| Active evidence | 12 | 13 | +1 (EVID-014) |
| Test count delta breakdown | — | runtime-context +51, session-guard +47, audit-primitives +20, errors patch +6 | +124 total |

## Quality gates (Phase B verify)

- `pnpm install` — clean (32 workspace projects).
- `pnpm build` — green (31 packages + m9s-example).
- `pnpm test` — **4697 passed / 49 skipped**, 0 failed.
- `pnpm typecheck` — clean (31 + m9s-example).
- `pnpm run depcruise` — `✔ no dependency violations found (108 modules, 210 dependencies cruised)`.
- `pnpm run lint` (root level) — green.
- `pnpm publint` (runtime-context, session-guard, audit-primitives) — `All good!`.
- entity-audit regression (E+ refactor) — 30/30 tests pass; existing public API surface preserved.

## Audit results

### Pre-Build audit (5∥ reviewers, 2026-05-06)

5 reviewers spawned via AgentTeams `sprint-3-7` team:
- architect-reviewer: GO-WITH-FIXES (3 P1)
- security-reviewer: GO-WITH-FIXES (4 P0, 3 P1)
- ddd-reviewer: GO-WITH-FIXES (3 P1)
- typescript-reviewer: GO-WITH-FIXES (1 P0, 5 P1, 5 P2)
- docs-reviewer: GO-WITH-FIXES (4 P1)

**Convergent findings (≥2 reviewers, mandatory)**:
- **TimestampProvider shape collision** (architect P1-1 + ddd P1-3): existing entity-audit uses call-signature `() => Timestamp`; spec proposed object-with-method. → Resolved Amendment 1.1.3 (call-signature pattern).
- **Errors subclasses NOT parametric** (typescript P0-1 + ddd P1-2 + architect via shape collision): `extends NotFoundError<{ contextField: 'session' }>` doesn't compile — Sprint 3.6 errors fixed D. → Resolved Amendment 1.1.1 (parametric refactor with default D, additive backward-compat).
- **`@gertsai/errors` Shared Kernel pattern reuse for Wave 5 Phase 2** (architect + ddd convergent): documented in Amendment.

**Substantive single-reviewer findings (addressed)**:
- security P0-1: `sessionMiddleware` MUST auto-`$freeze()` post-init (TOCTOU CWE-367) → I-16.
- security P0-2: `ProviderContext.get<T>(token)` MUST be symbol-only (CWE-843 type confusion) → I-17.
- security P0-3: `isInTenant` MUST guard undefined-tenant (CWE-285 silent bypass) → I-18.
- security P0-4: `isImpersonating` MUST throw on empty UUIDs (CWE-285) → I-19.
- security P1-1: `correlationId` MUST use `crypto.randomUUID()` (CWE-330) → I-20.
- security P1-3: dedicated errors MUST mark safeForTransport (CWE-209) → I-21.
- ddd P1-1: `$freeze()` lazy memoization conflict → I-22 (eager-init in $freeze).
- ddd P1-2: `assertAuthenticated` throws wrong domain (DataAccessUuidMissingError instead of AuthenticationRequired) → Amendment 1.1.2 (split into 5 errors + 5 assertions).
- ddd P1-3: audit-primitives Timestamp aliasing — E+ entity-audit re-export elevated to MANDATORY → Amendment 1.1.4 (5th changeset).
- typescript P0-2: Session getter `string | null` vs existing pattern → already addressed in Sprint 3.6 (string | undefined).
- architect P1-3: Session $-mutator throws bare Error vs SessionDestroyedError → documented divergence in session-guard README, Sprint 3.7.x deferred.
- ddd P2 promoted: AuthContext factories split (`requireAuthContext` + `requireAuthContextWithDataAccess`).
- docs P1-1..P1-4: README template + Security per-package + 5 changeset templates + CLAUDE.md prewrite — all applied as Amendment 1.3.

All Amendment 1 fixes applied to ADR-007 + SPEC-012 BEFORE Build started — including expanding Wave 1 from 3 workers to 4 (errors-patch-worker added per Amendment 1.1.1).

### Post-Build fidelity audit (3∥ reviewers, 2026-05-06)

- runtime-context-fidelity: GO-WITH-FIXES (1 P1: `requireAuthContextWithDataAccess` doesn't enforce contract — same seam runtime-context-worker flagged for Phase B handover; reviewer independently confirmed; 5 P2 polish).
- session-guard-fidelity: GO (zero P0/P1; 2 P2 polish).
- audit-primitives-fidelity: GO (zero P0/P1; 2 informational notes incl. Amendment 1.1.4 used `dependencies` instead of literal `peerDependencies` — functionally equivalent for monorepo workspace lockstep).

**P0/P1 actions**:
- 1 P1 fixed in-loop: `packages/runtime-context/src/auth-context.ts` — imported `DataAccessUuidMissingError` from `@gertsai/session-guard` (peer-dep added to package.json), switched throw class. Added explicit empty-string test in `auth-context.test.ts`. Runtime-context test count 50 → 51.

**P2 actions**: ~10 P2 polish items deferred to KNOWN-ISSUES §12 (Sprint 3.7.x maintenance pass).

## ADR-007 invariants (verified)

| Invariant | Verification | Status |
|---|---|---|
| I-1 runtime-context core has no Moleculer/HTTP framework runtime | grep -rE 'moleculer\|express\|fastify' packages/runtime-context/src/ outside /moleculer = 0 | ✅ |
| I-2 /moleculer subpath uses `import type` only | confirmed `import type { Context } from 'moleculer'` | ✅ |
| I-3 RequestContext throws AppError subclasses | 5 dedicated errors all extend parametric @gertsai/errors | ✅ |
| I-4 ContextFrozenError on post-freeze mutation | tested in `request-context-freeze.test.ts` | ✅ |
| I-5 session-guard core no Moleculer/DI | confirmed pure session helpers | ✅ |
| I-6 session-guard errors extend AppError taxonomy | 5 errors all extend parametric @gertsai/errors | ✅ |
| I-7 audit-primitives zero internal deps | package.json has empty deps + peerDependencies | ✅ |
| I-8 entity-audit existing API preserved | 30/30 regression tests pass post-refactor | ✅ |
| I-9 Tier 4 placement documented | CLAUDE.md tier table updated | ✅ |
| I-10 SPDX header on every new .ts | confirmed in all 4 worker reports + audit | ✅ |
| I-11 Per-package strategy markers in SPEC-012 | F / F / F + E+ markers present | ✅ |
| I-12 RequestContext getters honor Session.dataAccessUuid semantics | request-context.ts delegates to Session getters | ✅ |
| I-13 assertOperatorType validates current session.operatorType | tested in assertions.test.ts | ✅ |
| I-14 Timestamp shape backend-agnostic | { seconds, nanoseconds } structural-equivalent across packages | ✅ |
| I-15 sessionMiddleware ctx.locals (not ctx.meta) | confirmed `ctx.locals.requestContext = ...` | ✅ |
| I-16 sessionMiddleware auto-$freeze() | confirmed `requestContext.$freeze()` before `next(ctx)` | ✅ |
| I-17 ProviderContext symbol-only tokens | runtime TypeError on non-symbol; tested | ✅ |
| I-18 isInTenant undefined-tenant guard | tested in guards.test.ts | ✅ |
| I-19 isImpersonating empty-UUID guard | throws DataAccessUuidMissingError; tested | ✅ |
| I-20 crypto.randomUUID for correlationId | confirmed `randomUUID` from `node:crypto` | ✅ |
| I-21 errors transport redaction | reuses Sprint 3.6 REDACTION_KEYS via /http/grpc subpaths | ✅ |
| I-22 $freeze() eager-init lazy fields | tested in request-context-freeze.test.ts | ✅ |

## PRD-003 goals satisfied

- G-4 ✅ `@gertsai/runtime-context` ships as Tier 4 + `/moleculer` subpath.
- G-1 ✅ `@gertsai/errors` extended (parametric subclasses, Sprint 3.7 patch 0.1.0 → 0.1.1).
- G-2/G-3 ✅ already shipped Sprint 3.6.
- G-5/G-6 — pending Sprint 3.8/3.9.

## SPEC-012 acceptance checklist

- [x] T1 (W-3-7-1..10): `@gertsai/runtime-context` shipped — 51 tests, /moleculer subpath, README.
- [x] T2 (W-3-7-11..17): `@gertsai/session-guard` shipped — 47 tests, 5 errors (incl. AuthenticationRequiredError), 5 assertions, 3 checks, README.
- [x] T3 (W-3-7-18..23): `@gertsai/audit-primitives` shipped — 20 tests, call-signature TimestampProvider, README.
- [x] Amendment 1.1.1: errors patch parametric refactor — 6 new tests, additive backward-compat.
- [x] Amendment 1.1.4: entity-audit E+ re-export from audit-primitives — backward-compat preserved.
- [x] T4 (W-3-7-24..30): full repo verify green; CLAUDE.md tier table 28 → 31; 5 changesets created.
- [x] T5 (W-3-7-31..36): post-Build audit done; P1 fixed in-loop; EVID-014 active; SPEC-012 active; commit pending.

## Test count delta breakdown

| Package | Tests added | Notes |
|---|---|---|
| @gertsai/runtime-context | +51 (NEW; was target 22) | 2.3× target |
| @gertsai/session-guard | +47 (NEW; target 16) | 2.9× target |
| @gertsai/audit-primitives | +20 (NEW; target 16) | 1.25× target |
| @gertsai/errors | +6 (parametric subclass tests) | additive |
| @gertsai/entity-audit | 0 (regression preserved) | 30/30 still pass |
| **Total** | **+124** | target was +59 (2.1×) |

## Files changed

**NEW packages (full directories)**:
- `packages/runtime-context/` — package.json, tsconfig.json, tsup.config.ts, vitest.config.mts, README.md, CHANGELOG.md, LICENSE symlink, src/{index, request-context, types, auth-context, feature-context, provider-context, errors}.ts, src/moleculer/index.ts, src/__tests__/* (7 test files).
- `packages/session-guard/` — same structure + src/{index, guards, errors, assertions, check}.ts, src/__tests__/* (4 test files + helpers).
- `packages/audit-primitives/` — same structure + src/{index, types, providers, convert}.ts, src/__tests__/* (3 test files).

**Modified existing**:
- `packages/errors/src/errors/{validation,not-found,unauthorized,forbidden,conflict,rate-limited,internal,upstream-failure,timeout,bad-gateway}.ts` — parametric refactor (10 files).
- `packages/errors/src/__tests__/parametric-subclasses.test.ts` — NEW (6 tests).
- `packages/entity-audit/src/types.ts` — Timestamp re-exported from audit-primitives.
- `packages/entity-audit/src/timestamp.ts` — re-exports from audit-primitives + deprecated aliases.
- `packages/entity-audit/package.json` — added `@gertsai/audit-primitives` dependency.
- `packages/runtime-context/src/auth-context.ts` — Phase D P1 fix: import DataAccessUuidMissingError from session-guard, switched throw class.
- `packages/runtime-context/src/__tests__/auth-context.test.ts` — NEW test for explicit empty-string DataAccessUuidMissingError throw.
- `packages/runtime-context/package.json` — Phase D added `@gertsai/session-guard` peer-dep.
- `CLAUDE.md` — tier table 28 → 31; updated 3 rows + 1 enhanced (entity-audit).
- `pnpm-lock.yaml` — workspace symlinks for new packages.
- `.changeset/sprint-3-7-{runtime-context,session-guard,audit-primitives,errors-patch,entity-audit}.md` — NEW (5 changesets per Amendment 1.3.3 templates).

**Forgeplan artifacts**:
- `.forgeplan/adrs/ADR-007-...md` — NEW (Decisions A/B/C/D + 22 invariants + Amendment 1).
- `.forgeplan/specs/SPEC-012-...md` — NEW (W-3-7-1..36 + Amendment 1).
- `.forgeplan/evidence/EVID-014-...md` — NEW (this file).

## Process observations (for Hindsight)

**AgentTeams pattern delivered cleanly**:
- 5∥ pre-Build reviewers caught 1 convergent P0 (errors parametric) + 7 substantive findings BEFORE Build, eliminating rework.
- 4∥ Build workers (errors-patch + 3 new packages) — 0 file-ownership conflicts. errors-patch-worker FIRST in Wave 1 unblocked others.
- Phase B team-lead applied entity-audit E+ refactor cleanly — matched Amendment 1.5 file-ownership matrix.
- 3∥ post-Build fidelity reviewers caught 1 P1 (auth-context seam) before commit.
- Total wall-clock: ~5h for 31-package monorepo evolution including audit-fix loop.

**Pattern stable**: 7-cycle audit pattern (3.0/3.0.1, 3.4/3.4.1, 3.5/3.5.1, 3.5.2, 3.6, 3.7) — converging findings ≥2 reviewers = mandatory; single-reviewer findings = P2 unless substantive (case-by-case). Pre-Build audit prevents Build rework; post-Build catches implementation drift. Both phases necessary.

**ADI dilemma resolutions during Sprint 3.7**:
- **A: errors subclasses parametric vs Sprint 3.7 dedicated errors syntax** — apparent blocker. **B**: Could break Sprint 3.7 5+5 dedicated errors, OR break Sprint 3.6 published errors API. **D**: Parametric refactor with **default D** matching Sprint 3.6 shape — strictly additive backward-compat. Existing call sites compile unchanged.
- **A: TimestampProvider object-with-method vs entity-audit existing call-signature** — collision. **B**: Could force entity-audit breaking change, OR ship duplicate types. **D**: Match existing entity-audit shape (call-signature) — Amendment 1.1.3. E+ refactor (entity-audit re-export from audit-primitives) becomes seamless.
- **A: assertAuthenticated throws DataAccessUuidMissingError vs AuthenticationRequiredError** — semantic mismatch. **B**: Could conflate identity with scope domains. **D**: Split into 5 errors (added AuthenticationRequiredError); rename assertHasDataAccessUuid for the scope check. Amendment 1.1.2.
- **A: ProviderContext.get<T>(token: symbol | string) vs symbol-only** — security risk. **B**: Could break consumer ergonomics OR allow type confusion. **D**: Symbol-only (compile-time-known names) per I-17. Consumers requiring string-keyed providers wrap via `Symbol.for(name)` at call site.
- **A: requireAuthContextWithDataAccess seam handover** — runtime-context-worker delivered with TODO comment + SessionMissingError stand-in. **B**: Could ship technical debt OR delay Sprint 3.7. **D**: Phase D fix-loop — import DataAccessUuidMissingError from session-guard + switch error class + add explicit-empty-string test. 4 LOC change.

## Branch state post-Sprint 3.7

`feat/sprint-3-7-wave-5-phase-2` is 1 commit ahead of `feat/sprint-3-6-wave-5-phase-1` (which is 1 commit ahead of `feat/api-core-decomposition`, which is 34 commits ahead of main). Total: ~36+ commits ahead of main.

## Pre-existing infra issue note

Per-package `pnpm lint` continues to fail per repo-wide ESLint flat-config gap (Sprint 3.6 noted). Root-level `pnpm run lint` exits 0 (covers what matters). NOT a Sprint 3.7 regression. Track for monorepo-wide fix.

## Linked artifacts

| Artifact | Relation |
|---|---|
| PRD-003 | informs (this evidence supports PRD-003 G-4) |
| ADR-007 | informs (this evidence supports ADR-007 invariants I-1..I-22) |
| SPEC-012 | informs (this evidence supports SPEC-012) |
| EVID-013 (Sprint 3.6 baseline) | based_on |
| ADR-006 (Sprint 3.6 placement) | informs (Shared Kernel pattern reused) |
| ADR-005 (Wave 4 storage) | informs (Wave 4 invariants preserved) |

## Next steps

- Sprint 3.8 (Wave 5 Phase 3): 4 entity framework adapters (entity-vue, entity-react, entity-solid, entity-svelte) parallel.
- Sprint 3.9 (Wave 5 Phase 4): 4 Orchestra HIGH candidates (rpc-proxy-builder, logger-factory, async-utils, rest-request-manager) parallel.
- v0.2.0 publish gate: pending explicit user confirmation (per CLAUDE.md red lines).







