---
depth: standard
id: PRD-033
kind: prd
last_modified_at: 2026-05-16T19:39:49.824114+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-048
  relation: based_on
status: active
title: Wave 12.C-fix-1 — close CRITICAL peer cycle + 3 entity HIGHs from EVID-048
---

# PRD-033 — Wave 12.C-fix-1 — close CRITICAL peer cycle + 3 entity HIGHs from EVID-048

## Target Audience

- **Primary:** downstream consumers of `@gertsai/entity` (canonical hydration target for backend payloads in m9s-example + future consumers). The `__proto__` prototype-pollution finding (H-1) is the most impactful.
- **Secondary:** consumers of `plainReactiveAdapter` (the **default** adapter that ships with `@gertsai/entity`, used in server-side contexts without a framework).
- **Tertiary:** Wave 12.C-fix-2 / fix-3 teams — this PRD sets the precedent for surgical entity-package fixes.

## Problem Statement

EVID-048 surfaced 1 CRITICAL + 10 unique HIGH across 6 Tier-2 packages. This PRD closes the 4 **entity-related** items (CRIT-1 + H-1 + H-2 + H-5):

| # | Severity | Finding | File |
|---|---|---|---|
| CRIT-1 | CRITICAL | entity↔entity-vue peer cycle via `/vue` subpath shim | `packages/entity/src/vue.ts:14` + `package.json:62` |
| H-1 | HIGH (Sec) | `$patch` / `$setMetadata` CWE-1321 `__proto__` prototype pollution | `packages/entity/src/Entity.ts:103,113`; `EntityWithMetadata.ts:115,125` |
| H-2 | HIGH (Type/Sec) | plainReactiveAdapter brand uses shared `Symbol.for` + writable `defineProperty` (vs framework adapters' module-private + locked) | `packages/entity/src/adapters/plain.ts:11,19` |
| H-5 | HIGH (Arch) | Node `events` import in published `dist/index.d.ts` | `packages/entity/dist/index.d.ts:1-3` |

Without these fixes:
- `@gertsai/entity` peer-cycle ships in v0.x.x — pnpm resolves it via peer-optional, but the dep graph contains a cycle, blocking eventual v1.0 release per ADR-008 Decision B sunset.
- Any consumer accepting untrusted JSON has an indirect prototype-pollution vector through `entity.$patch(jsonPayload)`.
- plainReactiveAdapter (the **default** server-side adapter) has a tamperable brand — `Symbol.for` is global registry; `delete obj[brand]` removes the marker (vs framework adapters' locked `defineProperty`).
- Consumers need `@types/node` to typecheck `@gertsai/entity` despite no `engines.node` declaration.

## Goals

1. **All 4 findings closed** — each cited `file:line` verifiably patched.
2. **No regression** — entity test suite stays green; new tests added for `__proto__` filter (H-1) + brand tamper-protection (H-2) + peer-cycle removal verification (CRIT-1).
3. **Migration cost minimised** — `vueReactiveAdapter` inlined to break peer cycle without removing `/vue` subpath (v2.0 ADR-008 sunset path remains valid). Pre-1.0 SemVer minor bump.

## Non-Goals

- **NG-001** — Other EVID-048 HIGHs ship in Wave 12.C-fix-2 (type-leaks: queue bullmq, rest-request-manager Logger, storage-core capabilities doc) and 12.C-fix-3 (flux pipe, DI cleanup, rate-limiter, queue password).
- **NG-002** — MEDIUM/LOW findings deferred to polish sprint.
- **NG-003** — No `/vue` subpath removal in this PR — that's the v2.0 sunset (ADR-008 Decision B). Interim fix: break cycle by inlining.
- **NG-004** — No public-API redesign — surgical fixes only.

## Functional Requirements

- [ ] **FR-001 — Break entity↔entity-vue peer cycle.** Inline a thin local copy of `vueReactiveAdapter` in `packages/entity/src/adapters/vue.ts` (new file), remove the re-export from `@gertsai/entity-vue` in `packages/entity/src/vue.ts`, drop `@gertsai/entity-vue` from `peerDependencies` in `packages/entity/package.json`. The `@gertsai/entity/vue` subpath continues to work (consumers still get a Vue reactive adapter); v2.0 ADR-008 Decision B sunset deletes the subpath entirely.
- [ ] **FR-002 — `$patch` / `$setMetadata` `__proto__` filter.** Add a key-filter to the patch loop in both `Entity.$patch` and `EntityWithMetadata.$setMetadata`:
  ```ts
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
  ```
  Replace `Object.assign(_data, partial)` with the filtered loop in the `check=false` branch too. Verify: `entity.$patch({ __proto__: { admin: true } })` does NOT mutate `_data`'s prototype.
- [ ] **FR-003 — plainReactiveAdapter brand harmonisation.** Replace `Symbol.for('@gertsai/entity:raw')` with module-private `const RAW_MARKER = Symbol('@gertsai/entity:raw')`. Replace `[]=` setter with `Object.defineProperty(value, RAW_MARKER, { value: true, configurable: false, writable: false, enumerable: false })`. Match the pattern from `entity-react/src/adapter.ts:127-133`.
- [ ] **FR-004 — Remove Node `events` from public `.d.ts`.** Either declare `engines.node: ">=22"` in `packages/entity/package.json`, OR define a local `IEventEmitter` interface (mirror `flux/src/types.ts:198` pattern) and remove the `EventEmitter` import from public type surface. **Decision:** declare `engines.node` — simpler, matches `rest-request-manager` pattern, no surface change.
- [ ] **FR-005 — Tests.** Add tests for:
  - `entity.$patch({ __proto__: ... })` does not pollute (1 test)
  - `entity.$patch({ constructor: ... })` does not break (1 test)
  - `plainReactiveAdapter.markRaw(v)` + `delete v[brand]` does not un-mark (1 test)
  - `plainReactiveAdapter` brand inaccessible via `Symbol.for(...)` (1 test)
- [ ] **FR-006 — Changeset.** `@gertsai/entity: minor` (current → next). Body documents the 4 closures + cycle break.

## Non-Functional Requirements

- **NFR-001 — Backward-compat.** `entity.$patch(legalPayload)` continues to work — only attacker keys are filtered. `plainReactiveAdapter.markRaw(value)` continues to mark. `@gertsai/entity/vue` subpath continues to expose a Vue adapter — implementation source changes, public name does not.
- **NFR-002 — No new deps.** `@vue/runtime-core` already declared as peer-optional in entity package (per CLAUDE.md ADR-008); inlining `vueReactiveAdapter` reuses that. We REMOVE `@gertsai/entity-vue` from peers — net peer count decreases.
- **NFR-003 — Test budget.** 4 new tests + existing entity suite stays green.
- **NFR-004 — Forgeplan safety.** MCP only.
- **NFR-005 — Time bound.** Single session, ~30 min for solo teammate (small surgical scope).

## Related Artifacts

- **EVID-048** — sources CRIT-1, H-1, H-2, H-5.
- **PRD-032** — Wave 12.C audit (parent).
- **PRD-029/030/031** — Wave 12.B-fix-1/2/3 precedents.
- **ADR-008** — entity reactive adapter ISP + I-11 module-private symbols (FR-003).
- **CLAUDE.md** — tier-table notes on `entity/vue` subpath.

Refs: PRD-029 (precedent), EVID-048 (sources), ADR-008 (I-11 pattern).




