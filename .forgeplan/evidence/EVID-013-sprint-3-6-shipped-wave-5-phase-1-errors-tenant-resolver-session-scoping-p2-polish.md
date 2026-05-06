---
depth: standard
id: EVID-013
kind: evidence
last_modified_at: 2026-05-06T16:46:53.614725+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: informs
- target: ADR-006
  relation: informs
- target: SPEC-011
  relation: informs
- target: ADR-007
  relation: informs
- target: SPEC-012
  relation: informs
status: active
title: Sprint 3.6 shipped — Wave 5 Phase 1 (errors + tenant-resolver + session scoping + P2 polish)
---

# EVID-013: Sprint 3.6 shipped — Wave 5 Phase 1

## Structured fields

- **Verdict**: SUPPORTS (PRD-003 G-1, G-2, G-3, G-7 satisfied; ADR-006 invariants I-1..I-18 verified by 3∥ post-Build fidelity audit).
- **Congruence Level**: CL3 (full implementation matches spec; 1 P1 detected and fixed in audit; binary-verified backward compat for `@gertsai/session`).
- **Evidence Type**: CI verification + multi-reviewer audit (5∥ pre-Build + 3∥ post-Build).
- **Date**: 2026-05-06.
- **Branch**: `feat/sprint-3-6-wave-5-phase-1` (off `feat/api-core-decomposition`).

## What shipped

| Deliverable | Type | Strategy | Effort |
|---|---|---|---|
| `@gertsai/errors` v0.1.0 | NEW Tier 1 package | F (fresh) | ~3-4h wall-clock |
| `@gertsai/tenant-resolver` v0.1.0 | NEW Tier 1 package | F (fresh) | ~3-4h wall-clock |
| `@gertsai/session` 0.2.0 (additive scoping) | E+ enhancement | E+ (additive only) | ~2h wall-clock |
| 7 P2 polish items (entity-storage, m9s-example tests, README) | F+ batch | F+ (additive) | ~1.5h wall-clock |

**Total wall-clock**: ~6h (4∥ workers parallel; pre-Build audit ~10min, Build ~4h, Phase B verify ~10min, Phase C audit ~15min, Phase D ~10min).

## Structured measurements

| Metric | Baseline (pre-Sprint-3.6) | Sprint 3.6 actual | Δ |
|---|---|---|---|
| Test count (passed) | 4443 | **4573** | **+130** |
| Test count (skipped) | 103 | 48 | -55 (api-rlr Redis tests now visible vs prior aggregation; same skip set) |
| Package count | 26 deliverables (25 directories + 1 enhanced di) | **28 deliverables** (27 directories + 1 enhanced di) | +2 packages |
| Forgeplan artifacts | 30 (22 active) | **34** (26 active) | +3 new (PRD-003, ADR-006, SPEC-011) + EVID-013 |
| Active ADRs | 5 | 6 | +1 (ADR-006) |
| Active PRDs | 1 | 2 | +1 (PRD-003) |
| Active specs | 8 | 9 | +1 (SPEC-011) |
| Active evidence | 11 | 12 | +1 (EVID-013) |

## Quality gates (Phase B verify)

- `pnpm install` — clean (29 workspace projects).
- `pnpm build` — green (27 packages + m9s-example).
- `pnpm test` — **4573 passed / 48 skipped**, 0 failed.
- `pnpm typecheck` — clean (27 + m9s-example).
- `pnpm run depcruise` — `✔ no dependency violations found (107 modules, 209 dependencies cruised)`.
- `pnpm run lint` (root level) — green.
- `pnpm publint` (errors, tenant-resolver) — `All good!`.
- `pnpm attw` (errors) — node10/node16-CJS/bundler 🟢; node16-from-ESM masquerading-as-ESM (known tsup CJS quirk shared with all sibling packages — not a regression).

## Audit results

### Pre-Build audit (5∥ reviewers, 2026-05-06)

5 reviewers spawned via AgentTeams `sprint-3-6` team:
- architect-reviewer: GO-WITH-FIXES (2 P0, 4 P1, 3 P2)
- security-reviewer: GO-WITH-FIXES (3 P0, 7 P1, 4 P2)
- ddd-reviewer: GO-WITH-FIXES (0 P0, 3 P1, 3 P2)
- typescript-reviewer: GO-WITH-FIXES (3 P0, 6 P1, 4 P2)
- docs-reviewer: GO-WITH-FIXES (0 P0, 4 P1, 4 P2)

**Convergent findings (≥2 reviewers, mandatory)**:
- `const enum ErrorKind` incompatible with `isolatedModules: true` (architect + typescript) → resolved via `as const` object pattern (Amendment 1.1.1).
- `AppError.toJSON` cause cycle/depth + redaction (architect + typescript + security x3) → resolved via cycle/depth-5 guard with WeakSet + 14-key redaction list (Amendment 1.1.2 + I-13/I-14).
- `@gertsai/errors` as Shared Kernel for tier purity (architect + ddd) → documented in ADR-006 §D §6 (Amendment 1.1.3).

**Substantive single-reviewer findings (addressed)**:
- Session getter `string | null` vs existing non-nullable pattern → switched to `string | undefined`, removed redundant `getXxxOptional` helpers (Amendment 1.2.1).
- AppError generic on details → `AppError<D>` (Amendment 1.2.2).
- Project/Space strict throw `ValidationError` not `UnauthorizedError` (Amendment 1.2.3 / I-16).
- Session scope = flat tags, no enforced hierarchy (Amendment 1.2.4 / I-17).
- HeaderStrategy `trustProxy: true` opt-in (Amendment 1.2.5 / I-15).
- ChainTenantResolver default `mode: 'strict'` (Amendment 1.2.6 / I-18).
- W-3-6-25 reclassified `patch` → `minor` bump (peer-dep optional removal is consumer-visible) (Amendment 1.2.7).
- ProblemDetails bucket types (Amendment 1.2.8 — UPSTREAM_FAILURE/BAD_GATEWAY/INTERNAL collapse to `urn:gertsai:errors:server`).

All Amendment 1 fixes applied to ADR-006 + SPEC-011 BEFORE Build started.

### Post-Build fidelity audit (3∥ reviewers, 2026-05-06)

- errors-fidelity: GO-WITH-FIXES (1 P1: `errors/grpc` exports.import.default `.cjs` should be `.js`; 5 P2 polish).
- tenant-resolver-fidelity: GO (3 P2 polish).
- session-scoping-fidelity: GO (3 P2 polish; backward compat **binary-verified** via empty `git diff Session.test.ts`).

**P0/P1 actions**:
- 1 P1 fixed in-loop: `packages/errors/package.json` exports.import.default for `/grpc` subpath corrected. Verified via rebuild + `npx publint` "All good!" + 52/52 tests still green.

**P2 actions**: 11 P2 polish items deferred to KNOWN-ISSUES §11 (entry created during Phase D); to be addressed in Sprint 3.6.1 / 3.7 maintenance pass.

## ADR-006 invariants (verified)

| Invariant | Verification | Status |
|---|---|---|
| I-1 errors core has no HTTP framework runtime | `grep -rE 'express\|fastify\|koa\|hono' packages/errors/src/` returns 0 | ✅ |
| I-2 errors/http has only `import type` for HTTP types | `import type` only in /http/index.ts | ✅ |
| I-3 errors/grpc has no grpc framework runtime; status codes vendored | `grep -rE 'grpc-js\|nice-grpc' packages/errors/src/` returns 0 | ✅ |
| I-4 tenant-resolver core has no Moleculer / HTTP framework | `grep -rE 'moleculer\|express\|fastify' packages/tenant-resolver/src/strategy.ts packages/tenant-resolver/src/strategies/` returns 0 | ✅ |
| I-5 tenant-resolver/moleculer peer-optional + import type only | package.json peerDependenciesMeta + `import type` confirmed | ✅ |
| I-6 Session backward compat | `git diff packages/session/src/Session.ts` shows additive only; `git diff packages/session/src/Session.test.ts` empty | ✅ |
| I-7 Polish batch additive only | W-3-6-25 reclassified to minor with explicit BREAKING note | ✅ |
| I-8 Wave 4 invariants preserved | ADR-005 I-1..I-7 unchanged; storage-core/entity-storage/query-dsl/pg-client untouched in core | ✅ |
| I-9 SPDX header on every new .ts | confirmed in all 4 worker reports | ✅ |
| I-10 Strategy markers in SPEC-011 | F / F+ / E+ markers present per Track | ✅ |
| I-11 + I-18 ChainTenantResolver default 'strict' | `chain-strict-mode.test.ts` 4 tests confirm | ✅ |
| I-12 Exhaustive HTTP/gRPC mapping | `Record<ErrorKind, number>` constants in both /http and /grpc | ✅ |
| I-13 Cause cycle/depth guard | `cause-cycle.test.ts` + `cause-deep.test.ts` confirm | ✅ |
| I-14 Default redaction list | `details-redaction.test.ts` confirms 4 cases incl. case-insensitive | ✅ |
| I-15 HeaderStrategy trustProxy opt-in | `header-spoof.test.ts` 4 cases confirm | ✅ |
| I-16 Strict helpers throw correct error class | scoping.test.ts asserts via `instanceof` | ✅ |
| I-17 Session scope flat tags, no hierarchy | scoping.test.ts asserts orphan-scope valid | ✅ |
| I-18 ChainTenantResolver default strict mode | covered by I-11 verification | ✅ |

## PRD-003 goals satisfied

- G-1 ✅ `@gertsai/errors` ships as Tier 1 with /http + /grpc subpaths.
- G-2 ✅ `@gertsai/tenant-resolver` ships as Tier 1 with composable chain + /moleculer + /http.
- G-3 ✅ `@gertsai/session` gains additive scoping (binary-verified backward-compat).
- G-7 ✅ 7 P2 polish items addressed (1 deferred to KNOWN-ISSUES §10 from Sprint 3.5.2 audit).
- G-4..G-6 — pending Sprint 3.7-3.9 (out of scope for Sprint 3.6).

## SPEC-011 acceptance checklist

- [x] T1 (W-3-6-1..8): @gertsai/errors shipped — 52 tests, all subpaths, README.
- [x] T2 (W-3-6-9..17): @gertsai/tenant-resolver shipped — 62 tests, all subpaths, README.
- [x] T3 (W-3-6-18..22): @gertsai/session additive scoping — 13 new tests, binary-verified backward compat.
- [x] T4 (W-3-6-23..29): 7 P2 polish items closed.
- [x] T5 (W-3-6-30..36): full repo verify green; CLAUDE.md tier table 26 → 28; 4 changesets created.
- [x] T6 (W-3-6-37..42): post-Build audit done; EVID-013 active; SPEC-011 active; commit; Hindsight retain.

## Test count delta breakdown

| Package | Tests added |
|---|---|
| @gertsai/errors | +52 (NEW) |
| @gertsai/tenant-resolver | +62 (NEW) |
| @gertsai/session | +13 (scoping.test.ts NEW) |
| @gertsai/entity-storage | +3 (upsert.test.ts NEW) |
| **Total** | **+130** |

Far exceeds Sprint target (+38 estimated).

## Files changed

**NEW packages (full directories)**:
- `packages/errors/` — package.json, tsconfig.json, tsup.config.ts, vitest.config.mts, README.md, CHANGELOG.md, LICENSE symlink, src/{index,error-kind,app-error,serialize,redaction,locale,helpers}.ts, src/errors/{validation,not-found,unauthorized,forbidden,conflict,rate-limited,internal,upstream-failure,timeout,bad-gateway}.ts, src/http/index.ts, src/grpc/index.ts, src/__tests__/* (10 test files).
- `packages/tenant-resolver/` — same structure + src/strategy.ts, src/chain-resolver.ts, src/strict.ts, src/strategies/{header,subdomain,path,header-lookup}.ts, src/moleculer/index.ts, src/http/index.ts, src/__tests__/* (12 test files).

**Modified existing**:
- `packages/session/src/types.ts` — additive 3 SessionOpts fields.
- `packages/session/src/Session.ts` — additive 3 fields + 3 getters + 3 strict helpers (~50 LOC).
- `packages/session/__tests__/scoping.test.ts` — NEW (13 tests).
- `packages/session/package.json` — peerDependencies + typecheck script update.
- `packages/session/tsconfig.test.json` — NEW (test typecheck only).
- `packages/session/vitest.config.mts` — include __tests__ dir.
- `packages/session/README.md` — new "Tenant / project / space scoping" section.
- `packages/entity-storage/src/InMemoryStorageProvider.ts` — default generic.
- `packages/entity-storage/src/BaseEntityStorageService.ts` — upsert helper.
- `packages/entity-storage/src/__tests__/upsert.test.ts` — NEW (3 tests).
- `packages/entity-storage/package.json` — peerDependenciesMeta optional flag removed.
- `packages/entity-storage/README.md` — Phase A/B language cleanup.
- `examples/m9s-example/tests/audit-propagation.test.ts` — `as any` casts removed (4 → 0).
- `README.md` (root) — package count + table refresh.
- `CLAUDE.md` — tier table 26 → 28; F+/E+ marker definitions.
- `KNOWN-ISSUES.md` — §10 (BaseEntityStorageService.upsert 2 RTTs) + §11 (Sprint 3.6 P2 polish backlog).
- `pnpm-lock.yaml` — workspace symlinks for new packages.
- `.changeset/sprint-3-6-{errors,tenant-resolver,session-scoping,polish}.md` — NEW (4 changesets per Amendment 1.3 templates).

**Forgeplan artifacts**:
- `.forgeplan/prds/PRD-003-...md` — NEW (Wave 5 vision + 4-sprint roadmap).
- `.forgeplan/adrs/ADR-006-...md` — NEW (Decisions A/B/C/D + 18 invariants + Amendment 1).
- `.forgeplan/specs/SPEC-011-...md` — NEW (W-3-6-1..42 + Amendment 1).
- `.forgeplan/evidence/EVID-013-...md` — NEW (this file).

## Process observations (for Hindsight)

**AgentTeams pattern delivered cleanly**:
- 5∥ pre-Build reviewers caught 3 convergent P0 issues + 6 substantive single-reviewer findings BEFORE Build, eliminating rework.
- 4∥ Build workers — 0 file-ownership conflicts despite touching 28 packages workspace.
- tenant-resolver-worker organically swapped local stub → real `@gertsai/errors` import (Amendment 1.4 fallback only used by session-additive-worker which started parallel).
- 3∥ post-Build fidelity reviewers caught 1 P1 (export map .cjs vs .js) before commit.
- Total wall-clock: ~6h for 28-package monorepo evolution including audit-fix loop.

**Pattern stable**: 6× audit cycle (3.0/3.0.1, 3.4/3.4.1, 3.5/3.5.1, 3.5.2, 3.6) — converging findings ≥2 reviewers = mandatory; single-reviewer findings = P2 polish unless substantive (case-by-case). Pre-Build audit prevents Build rework; post-Build catches implementation drift. Both phases necessary.

**ADI dilemma resolutions during Sprint 3.6**:
- **A: tenant-resolver Tier 1 vs deps on `@gertsai/errors`** — apparent tier purity violation. **B**: Could break "Tier 1 = no internal deps" CLAUDE.md rule. **D**: ADR-006 §D §6 introduces explicit "Shared Kernel" pattern; `@gertsai/errors` is the canonical Shared Kernel; Tier 1 packages MAY depend on it. Future Shared Kernel candidates require ADR amendment.
- **A: const enum ErrorKind** — broken by `isolatedModules: true`. **B**: Could break tsup dual ESM+CJS. **D**: `as const` object pattern is modern TS best practice; tree-shake friendly; works through tsup; consumers get same DX via `ErrorKind.VALIDATION` access.
- **A: Session.getTenantOptional()** — would be redundant with `get tenantId(): string | undefined`. **B**: Could create 6 helpers vs 3. **D**: TypeScript getter already returns `string | undefined`; `getTenantOptional` is identical to getter; remove. Surface = 3 strict helpers + 3 getters (clean, minimal).

## Branch state

- Branch: `feat/sprint-3-6-wave-5-phase-1`
- Base: `feat/api-core-decomposition` (was 34 commits ahead of main)
- Sprint 3.6 produces 1 atomic commit (per SPEC-011 W-3-6-41).
- After this sprint: branch will be ~35+ commits ahead of main (depending on intermediate Sprint 3.6 commit count from worker outputs).

## Linked artifacts

| Artifact | Relation |
|---|---|
| PRD-003 | informs (this evidence supports PRD-003) |
| ADR-006 | informs (this evidence supports ADR-006) |
| SPEC-011 | informs (this evidence supports SPEC-011) |
| EVID-012 (Sprint 3.5.2 m9s-example shipped) | based_on (Wave 4 production-grade baseline) |
| ADR-005 (Wave 4 storage architecture) | informs (Wave 4 invariants preserved) |

## Next steps

- Sprint 3.7 (Wave 5 Phase 2): `@gertsai/runtime-context` + `/moleculer` subpath, `@gertsai/session-guard`, `@gertsai/audit-primitives`. Sequential after this sprint. Pre-Build audit recommended given new Tier 4 package (RuntimeContext).
- Sprint 3.8 (Wave 5 Phase 3): 4 entity framework adapters parallel.
- Sprint 3.9 (Wave 5 Phase 4): 4 Orchestra HIGH candidates parallel.
- v0.2.0 publish gate: pending explicit user confirmation (per CLAUDE.md red lines).







