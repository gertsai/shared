---
depth: standard
id: EVID-075
kind: evidence
last_modified_at: 2026-05-20T09:34:10.365493+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-057
  relation: informs
status: active
title: Wave 19 — 5 HIGH + 7 MED entity adapter findings closed from EVID-074
---

## Summary

Wave 19 closes 5 HIGH + 7 MED findings from EVID-074. Solo teammate (`typescript-pro`). 75 → **119** tests across 4 adapter packages (+44, +59%). Solid coverage tripled (16 → 38 tests, was the audit gap). Workspace typecheck 0 errors. 0 public API surface change (Solid set-throw is behaviour break per pre-fix silent-failure path being incorrect).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-057
- **summary**: 12/12 H+M closed; 44 new regression tests; Solid coverage parity achieved.

## Closures (Teammate V)

### FR-001 (H-V1) — notify-timing JSDoc
- `@gertsai/entity` `ReactiveAdapter` interface: explicit per-adapter timing documented
- Per-adapter JSDoc at export site

### FR-002 (H-R1, H-Sv1) — re-entrancy contract pin
- 10 new tests across entity-react + entity-svelte `re-entrancy.test.ts`
- **Decision**: pin contract + JSDoc, NO adapter change. Audit conflated implementation order with semantic correctness — underlying target IS mutated correctly; only explicit notify is suppressed during re-entry. `useSyncExternalStore` reads live proxy + live version on next snapshot.

### FR-003 (H-S1) — Solid test parity
- 4 new test files in entity-solid: `proxy-traps.test.ts` (6) + `re-entrancy.test.ts` (4) + `weakmap-gc.test.ts` (4) + `prototype-pollution.test.ts` (4)
- Real `solid-js/store` runtime (no `vi.mock`) — Solid 1.x → 2.x behavioural drift now observable in CI
- 16 → 38 tests (+22, +137%)

### FR-004 (H-S2) — Solid set trap try/catch
- All 3 Solid traps wrap `setStore(produce(...))` in try/catch; write failures now surface

### FR-005 (M-Sv1) — entityStore adapter check
- Foreign-adapter detection + informative `Error`
- 2 new tests

### FR-006 (M-V1, L-S1) — __resetCacheForTests
- Added to entity-vue + entity-solid mirroring entity-react/svelte

### FR-007 (M-R2) — markRaw non-reversibility tests
- 12 new tests (3 per adapter × 4 adapters)
- **Vue note**: Vue's `markRaw` uses `__v_skip` with `configurable: true, writable: false` — Vue tests assert Vue's actual contract; audit claim about all-4 inaccurate for Vue.

## Acceptance verification (all PASS)

| Adapter | Build | Typecheck | Tests |
|---|---|---|---|
| @gertsai/entity-vue | ✅ ESM+CJS+DTS | ✅ 0 | ✅ 19 (was 15, +4) |
| @gertsai/entity-react | ✅ | ✅ 0 | ✅ 29 (was 20, +9) |
| @gertsai/entity-solid | ✅ | ✅ 0 | ✅ **38 (was 16, +22)** |
| @gertsai/entity-svelte | ✅ | ✅ 0 | ✅ 33 (was 24, +9) |
| **Total** | **4/4** | **0 errors** | **119 (was 75, +44)** |

Workspace typecheck (45 projects): 0 errors. svelte-check 1087 files 0 warnings.

## Net change

14 files modified + 4 new test files. **+1002 LOC** (690 mods + 312 new). Mostly tests + JSDoc; ~99 LOC source in entity-solid (try/catch + reset cache + JSDoc).

## Behaviour break (entity-solid minor bump)

FR-004 changes Solid's `set`/`deleteProperty`/`defineProperty` from silent-fail-with-true to throw-on-failure. Pre-fix code silently relied on writes succeeding when they were actually failing → now surfaces failure. Per-adapter bump rationale:
- `@gertsai/entity-solid`: **minor** (behaviour break)
- Others (vue, react, svelte): patch

## Decision rationale (FR-002 NOT a fix)

The audit's interpretation that "subscriber receives stale snapshot" conflated implementation order with semantic correctness:
- Re-entrancy guard fires BEFORE `notify()` call, suppressing the recursive subscriber-fire
- BUT the underlying `target` IS mutated (inner trap's `Reflect.set` runs before guard)
- AND React's `useSyncExternalStore` reads the live proxy + live version on next snapshot
- → React renders against final post-mutation state

Tests pin the intentional flood-control semantics:
1. No stack overflow on re-entry
2. Target reflects final inner mutation
3. Subscribers fire at-most-once per outer burst (flood control)
4. Version counter bumps once per outer burst
5. Subsequent non-re-entrant writes produce fresh notifications
6. Later-registered subscribers see live data

This is the desired contract. Pinning prevents future regression that would over-notify.

## Wave 20+ deferred

- React WeakMap state consolidation (refactor only, low value)
- Lift subscriber API into `ReactiveAdapter` interface (v1.0.0 candidate — current API surface diverges across 4 adapters)
- EVID-074 LOW findings (5) — cosmetic JSDoc/test naming, deferred

## Refs

- PRD-057 (target)
- EVID-074 (Wave 18 audit source)
- PRD-056 + EVID-074 (audit precedent)
- ADR-008 (entity reactive adapters)
- Sprint 3.8 W-3-8-{1..21}



