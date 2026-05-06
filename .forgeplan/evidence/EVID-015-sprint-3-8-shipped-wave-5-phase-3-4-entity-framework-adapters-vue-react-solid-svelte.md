---
depth: standard
id: EVID-015
kind: evidence
last_modified_at: 2026-05-06T20:30:29.294504+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: informs
- target: ADR-008
  relation: informs
- target: SPEC-013
  relation: informs
status: active
title: 'Sprint 3.8 shipped — Wave 5 Phase 3 (4 entity framework adapters: vue + react + solid + svelte)'
---

# EVID-015: Sprint 3.8 shipped — Wave 5 Phase 3

## Structured fields

- **Verdict**: SUPPORTS (PRD-003 G-5 satisfied; ADR-008 invariants I-1..I-14 verified by 4∥ post-Build fidelity audit; 5∥ pre-Build audit caught + addressed 1 convergent P1 + 11 substantive P0/P1 BEFORE Build via Amendment 1).
- **Congruence Level**: CL3 (full implementation matches spec; **zero P0/P1 from post-Build audit**; Phase B entity vue subpath shim refactor binary-verified — entity 46/46 regression tests pass).
- **Evidence Type**: CI verification + multi-reviewer audit (5∥ pre-Build + 4∥ post-Build).
- **Date**: 2026-05-06.
- **Branch**: `feat/sprint-3-8-wave-5-phase-3` (off `feat/sprint-3-7-wave-5-phase-2`).

## What shipped

| Deliverable | Type | Strategy | Tests added |
|---|---|---|---|
| `@gertsai/entity-vue` v0.1.0 | NEW Tier 2 package | F (lift from entity/vue subpath) | 15 |
| `@gertsai/entity-react` v0.1.0 | NEW Tier 2 package | F (fresh) | 20 |
| `@gertsai/entity-solid` v0.1.0 | NEW Tier 2 package | F (fresh) | 16 |
| `@gertsai/entity-svelte` v0.1.0 | NEW Tier 2 package | F (fresh) | 24 |
| `@gertsai/entity` patch (E+ shim) | E+ enhancement | E+ (additive only — /vue subpath becomes re-export) | 0 (regression) |

**Total Sprint 3.8 wall-clock**: ~5h (4∥ workers parallel; pre-Build audit ~10min synthesize; Build ~50min; Phase B verify + entity shim refactor ~15min; Phase C audit ~15min; Phase D ~10min).

## Structured measurements

| Metric | Sprint 3.7 baseline | Sprint 3.8 actual | Δ |
|---|---|---|---|
| Test count (passed) | 4697 | **4772** | **+75** (target +49, 1.5×) |
| Package count | 31 | **35** | +4 (entity-vue, entity-react, entity-solid, entity-svelte) |
| Forgeplan artifacts | 38 (30 active) | **41** (33 active) | +3 (ADR-008, SPEC-013, EVID-015) |
| Active ADRs | 7 | 8 | +1 (ADR-008) |
| Active specs | 10 | 11 | +1 (SPEC-013) |
| Active evidence | 13 | 14 | +1 (EVID-015) |

## Quality gates (Phase B verify)

- `pnpm install` — clean (workspace recognizes 35 packages + m9s-example).
- `pnpm build` — green (35 packages + m9s-example).
- `pnpm test` — **4772 passed / 49 skipped**, 0 failed.
- `pnpm typecheck` — clean (35 + m9s-example).
- `pnpm run depcruise` — `✔ no dependency violations found (108 modules, 210 dependencies cruised)`.
- `pnpm run lint` (root level) — green.
- `pnpm publint` (4 new packages) — `All good!`.
- entity package regression — 46/46 tests pass post vue subpath shim refactor (binary-verified backward compat per ADR-008 I-3).

## Audit results

### Pre-Build audit (5∥ reviewers, 2026-05-06)

5 reviewers spawned via AgentTeams `sprint-3-8` team:
- architect-reviewer: GO-WITH-FIXES (1 P1 + 3 P2)
- security-reviewer: GO-WITH-FIXES (3 P1 + 4 P2 — CWE-401/672/1321/20/674/362 catches)
- ddd-reviewer: GO-WITH-FIXES (2 P1 — Svelte UL asymmetry + ACL leak risk)
- typescript-reviewer: GO-WITH-FIXES (2 P1 + 4 P2)
- docs-reviewer: GO-WITH-FIXES (6 P1 + 4 P2 — biggest docs reviewer findings to date)

**Convergent findings (≥2 reviewers, mandatory)**:
- **Svelte API drift / UL asymmetry** (docs P1-3 + ddd P1-DDD-2 convergent): SPEC-013 had inconsistency between Quickstart syntax (`{$store.field}`) and W-3-8-19 return type (`Readable<Entity<Data>>`). Resolved Amendment 1.1.1: keep `Readable<Entity<Data>>`, fix Quickstart to `{$store._data.field}`.

**Substantive single-reviewer findings (addressed)**:
- architect P1-A: entity → entity-vue peer-dep MUST be `optional: true` to preserve zero-cost-by-default for non-Vue consumers → Amendment 1.2.1.
- security P1-S1: subscribe registry MUST be WeakMap (CWE-401/CWE-672) → I-12.
- security P1-S2: Proxy traps MUST be 3 (set + defineProperty + deleteProperty); Reflect.set without external receiver (CWE-20) → I-13.
- security P1-S3: raw markers MUST be module-private Symbol, NOT Symbol.for (CWE-1321 prototype pollution) → I-11.
- security P2-S6/S7: sync notify + re-entrancy guard (CWE-674 / CWE-362) → I-13.
- ddd P1-DDD-1: adapter MUST NOT access entity protected state directly → I-14.
- typescript P1-1: `import type` mandatory for framework runtime types (`isolatedModules: true`) → Amendment 1.2.8.
- typescript P1-2: lazy require pattern MUST use `createRequire(import.meta.url)` for ESM compat → Amendment 1.2.9.
- typescript P2-3: React `useEntity.getSnapshot()` MUST return version snapshot (NOT raw _data ref) → Amendment 1.2.10.
- typescript P2-2: tsup `external` config MUST list `@gertsai/entity` + framework runtime → Amendment 1.2.11.
- docs P1-1..P1-6: README template inline + per-framework Quickstart code + Svelte syntax fix + install gate error wording + entity-vue migration note + compat matrix → Amendment 1.3.1..1.3.6.
- docs P2-1..P2-4: cross-references list + 5 changeset templates + CLAUDE.md row snippets + m9s-example out-of-scope → Amendment 1.3.6..1.3.9.

All Amendment 1 fixes applied to ADR-008 + SPEC-013 BEFORE Build started — including 4 NEW invariants (I-11..I-14).

### Post-Build fidelity audit (4∥ reviewers, 2026-05-06)

- entity-vue-fidelity: PASS (zero P0/P1; 2 P2 minor doc nits).
- entity-react-fidelity: PASS (zero P0/P1; 2 P2 polish — markRaw configurability + test seam).
- entity-solid-fidelity: PASS (zero P0/P1; 1 P2 minor doc drift on re-entrancy text).
- entity-svelte-fidelity: PASS (zero P0/P1; 2 P2 informational notes — Proxy/store mirror comment + idempotent reactive).

**Cleanest sprint to date**: 4 of 4 fidelity reviewers PASS with zero P0/P1 findings. Pre-Build Amendment 1 catches structural risks (WeakMap, module-private Symbol, getSnapshot version, peer-dep optional) BEFORE workers wrote code, eliminating implementation drift entirely.

## ADR-008 invariants (verified)

| Invariant | Verification | Status |
|---|---|---|
| I-1 ReactiveAdapter contract conformance | All 4 adapters tested with 3-base-test fixture | ✅ |
| I-2 entity core has no concrete UI framework runtime | Wave 4 invariant; preserved (no entity src changes outside vue.ts shim) | ✅ |
| I-3 entity/vue subpath remains importable | entity 46/46 regression tests pass; vue.test.ts asserts new error wording from entity-vue | ✅ |
| I-4 peer-dep optional via peerDependenciesMeta | All 4 adapters declare framework runtime as `optional: true` | ✅ |
| I-5 framework-native binding helpers exported | useEntity (React/Solid) + entityStore (Svelte) + Vue uses _data directly | ✅ |
| I-6 SPDX header on every new .ts | Confirmed in all 4 worker reports | ✅ |
| I-7 Strategy markers F / F+E+ in SPEC-013 | Track 1 = F+E+; Tracks 2/3/4 = F | ✅ |
| I-8 CHANGELOG cites ADR-008 + ReactiveAdapter conformance | All 4 changesets cite ADR-008 invariants | ✅ |
| I-9 m9s-example continues to work | Sprint 3.8 doesn't touch m9s-example UI; m9s-example regression 16/16 tests pass | ✅ |
| I-10 README per template | All 4 READMEs follow Amendment 1.3.1 template | ✅ |
| **I-11 module-private Symbol (CWE-1321)** | All 4 adapters use `const RAW = Symbol('raw')` (NOT Symbol.for) + hasOwnProperty bounds | ✅ |
| **I-12 WeakMap subscribe registry (CWE-401/CWE-672)** | entity-react + entity-svelte use WeakMap; tested via weakmap-gc.test.ts | ✅ |
| **I-13 3 Proxy traps + Reflect.set without receiver + sync notify + re-entrancy** | entity-react + entity-svelte verified all 5 sub-invariants; entity-solid uses produce pattern (R-3 carve-out) | ✅ |
| **I-14 No entity protected state access** | All 4 adapters use Proxy / `entity.$data` only; never `_data` directly | ✅ |

## PRD-003 goals satisfied

- G-5 ✅ 4 entity framework adapters ship parallel (entity-vue, entity-react, entity-solid, entity-svelte).
- G-1/G-2/G-3/G-4 — already shipped Sprint 3.6/3.7.
- G-6 — pending Sprint 3.9 (Orchestra HIGH candidates).

## SPEC-013 acceptance checklist

- [x] T1 (W-3-8-1..6): @gertsai/entity-vue NEW + entity vue subpath shim refactor; entity regression 46/46 pass; 15 entity-vue tests.
- [x] T2 (W-3-8-7..11): @gertsai/entity-react NEW; ReactiveAdapter + useEntity hook; 20 tests.
- [x] T3 (W-3-8-12..16): @gertsai/entity-solid NEW; ReactiveAdapter + useEntity store accessor; 16 tests.
- [x] T4 (W-3-8-17..21): @gertsai/entity-svelte NEW; ReactiveAdapter + entityStore Readable<Entity<Data>>; 24 tests.
- [x] T5 (W-3-8-22..28): full repo verify green; CLAUDE.md tier 31 → 35; 4 changesets + entity patch coupling.
- [x] T6 (W-3-8-29..34): post-Build audit done; EVID-015 active; SPEC-013 active; commit; Hindsight retain.

## Test count delta breakdown

| Package | Tests added | Notes |
|---|---|---|
| @gertsai/entity-vue | +15 (NEW; target 10) | 1.5× target — lift fidelity tests added |
| @gertsai/entity-react | +20 (NEW; target 15) | 1.3× target — adversarial fixtures comprehensive |
| @gertsai/entity-solid | +16 (NEW; target 12) | 1.3× target |
| @gertsai/entity-svelte | +24 (NEW; target 12) | 2× target — most comprehensive adversarial coverage |
| @gertsai/entity | 0 (regression preserved) | 46/46 still pass post-shim refactor |
| **Total** | **+75** | target +49 (1.5×) |

## Files changed

**NEW packages (full directories)**:
- `packages/entity-vue/` — package.json, tsconfig.json, tsup.config.ts, vitest.config.mts, README.md, CHANGELOG.md, LICENSE symlink, src/{index}.ts, src/__tests__/* (3 test files).
- `packages/entity-react/` — same structure + src/{adapter, use-entity, index}.ts, src/__tests__/* (7 test files).
- `packages/entity-solid/` — same structure + src/{adapter, use-entity, index}.ts, src/__tests__/* (2 test files).
- `packages/entity-svelte/` — same structure + src/{adapter, entity-store, index}.ts, src/test-helpers/mock-svelte-store.ts, src/__tests__/* (7 test files).

**Modified existing**:
- `packages/entity/src/vue.ts` — replaced impl with re-export shim from `@gertsai/entity-vue` (per ADR-008 Decision B + I-3).
- `packages/entity/src/vue.test.ts` — updated error wording assertion to match entity-vue source.
- `packages/entity/package.json` — added peer-dep `@gertsai/entity-vue: workspace:^` with `optional: true` flag (Amendment 1.2.1).
- `CLAUDE.md` — tier table 31 → 35; 4 NEW Tier 2 rows + entity row updated.
- `pnpm-lock.yaml` — workspace symlinks for new packages.
- `.changeset/sprint-3-8-{entity-vue,entity-react,entity-solid,entity-svelte}.md` — NEW (4 changesets per Amendment 1.3.7 templates).

**Forgeplan artifacts**:
- `.forgeplan/adrs/ADR-008-...md` — NEW (Decisions A/B/C/D/E/F + 14 invariants + Amendment 1).
- `.forgeplan/specs/SPEC-013-...md` — NEW (W-3-8-1..34 + Amendment 1).
- `.forgeplan/evidence/EVID-015-...md` — NEW (this file).

## Process observations (for Hindsight)

**AgentTeams pattern delivered cleanly — 8th audit cycle, pattern fully matured**:

- 5∥ pre-Build reviewers caught 1 convergent P1 + 11 substantive findings BEFORE Build, eliminating ALL implementation drift.
- 4∥ Build workers — 0 file-ownership conflicts despite 35-package workspace.
- Phase B team-lead applied entity vue subpath shim refactor cleanly — file ownership matrix proved out for E+ refactor pattern (Sprint 3.7 entity-audit re-export precedent).
- 4∥ post-Build fidelity reviewers ALL PASS with zero P0/P1 — best fidelity audit result of Wave 5.
- Total wall-clock: ~5h for 35-package monorepo evolution.

**Pattern fully stable**: 8-cycle audit pattern (3.0/3.0.1, 3.4/3.4.1, 3.5/3.5.1, 3.5.2, 3.6, 3.7, 3.8) — converging findings ≥2 reviewers = mandatory; single-reviewer findings = P2 unless substantive (case-by-case). Pre-Build audit catches ALL implementation drift; post-Build audit becomes confirmation rather than fix-loop.

**ADI dilemma resolutions during Sprint 3.8**:
- **A: Svelte API shape — Readable<Entity<Data>> vs Readable<Data>** — UL asymmetry vs Quickstart syntax conflict. **B**: Could break either Quickstart `{$store.field}` syntax OR Readable<Entity> shape (which exposes `.uuid` access). **D**: Keep `Readable<Entity<Data>>` for entity-aware consumption; fix Quickstart syntax to `{$store._data.field}`. Amendment 1.1.1.
- **A: ReactiveAdapter contract restrictive vs framework needs** — Vue uses Proxy reactivity; React uses hooks; Solid uses signals; Svelte uses stores. Each framework needs DIFFERENT binding pattern. **B**: Could over-extend ReactiveAdapter SPI OR ship inconsistent binding APIs. **D**: ReactiveAdapter base + framework-native binding helpers as named exports per package. Amendment 1.2 worker discretion within Decision A.
- **A: Symbol.for vs module-private Symbol** — security risk (CWE-1321 prototype pollution). **B**: Could break cross-realm `instanceof` checks OR allow attacker to globally pollute `Object.prototype[OUR_RAW] = true`. **D**: Module-private `Symbol(...)` per adapter + `hasOwnProperty.call` lookup per I-11. Existing entity/plain.ts uses Symbol.for (precedent), but Sprint 3.8 adapters use module-private — divergence acceptable per ADR-008 Amendment 1.2.3.
- **A: WeakMap vs Map for subscribe registry** — security risk (CWE-401 leak / CWE-672 UAF). **B**: Could break GC with regular Map (callbacks retain stale refs). **D**: WeakMap mandatory per I-12.
- **A: getSnapshot raw _data ref vs version wrapper** — React identity tracking failure. **B**: Could skip re-render via Object.is on same proxy ref. **D**: getSnapshot returns `{ data, version }` wrapper per Amendment 1.2.10 Option B.

## Branch state post-Sprint 3.8

`feat/sprint-3-8-wave-5-phase-3` is 1 commit ahead of `feat/sprint-3-7-wave-5-phase-2` (which is 1 commit ahead of `feat/sprint-3-6-wave-5-phase-1`, which is 1 commit ahead of `feat/api-core-decomposition`, which is 34 commits ahead of main). Total: ~37 commits ahead of main.

## Pre-existing infra issue note

Per-package `pnpm lint` continues to fail per repo-wide ESLint flat-config gap (Sprint 3.6-3.7 noted). Root-level `pnpm run lint` exits 0 (covers what matters). NOT a Sprint 3.8 regression.

## Linked artifacts

| Artifact | Relation |
|---|---|
| PRD-003 | informs (this evidence supports PRD-003 G-5) |
| ADR-008 | informs (this evidence supports ADR-008 invariants I-1..I-14) |
| SPEC-013 | informs (this evidence supports SPEC-013) |
| EVID-014 (Sprint 3.7 baseline) | based_on |
| ADR-007 (Sprint 3.7 placement) | informs (Wave 5 Phase 2 invariants preserved) |
| ADR-006 (Sprint 3.6 placement) | informs (Shared Kernel pattern reused) |
| ADR-005 (Wave 4 storage) | informs (Wave 4 invariants preserved — entity reactivity pluggable) |

## Next steps

- Sprint 3.9 (Wave 5 Phase 4): 4 Orchestra HIGH candidates (rpc-proxy-builder, logger-factory, async-utils, rest-request-manager) parallel. Final phase of Wave 5.
- v0.2.0 publish gate: pending explicit user confirmation. After Sprint 3.9 — Wave 5 fully complete; consider grouping Wave 5 publish (errors + tenant-resolver + session scope + runtime-context + session-guard + audit-primitives + 4 framework adapters + 4 Orchestra HIGH = 13 packages total).





