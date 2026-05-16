---
depth: standard
id: PRD-031
kind: prd
last_modified_at: 2026-05-16T18:31:48.570464+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-044
  relation: based_on
status: active
title: Wave 12.B-fix-3 — close HIGH type-system findings from EVID-044
---

# PRD-031 — Wave 12.B-fix-3 — close HIGH type-system findings from EVID-044

## Target Audience

- **Primary:** downstream consumers of `@gertsai/collection`, `@gertsai/ws-rpc`, `@gertsai/utils` who suffer compile-time noise from leaked `any` in exported generics, missing `typesVersions` for subpath exports, and silently-discarded `headers` option in browser-path WebSocket.
- **Secondary:** Wave 14 refactor team — collection surface cleanup feeds eventual surface-trimming refactors.

## Problem Statement

EVID-044 surfaced 7 HIGH-severity type-system findings. Wave 12.B-fix-2 closed all 7 HIGH security/data-integrity items; this PRD closes the type-system tier:

| # | Package | Finding | File |
|---|---|---|---|
| 1 | `@gertsai/collection` | Pervasive `: any` in exported generic constraints — `Constructor<T> = new (...args: any[]) => T`, `memoize<T extends (...args: any[]) => any>`, etc. Disables `Parameters<T>` / `ReturnType<T>` narrowing for all consumers. | `packages/collection/src/mixins/prototype.ts:8,28,29` + `mixins/PositionalAccess.ts:141,204+` + `utils/memoize.ts:32,39,169+` + `operations/memoized.ts:102+` |
| 2 | `@gertsai/collection` | Brand-bypass factories — `createCacheKey/createCollectionId/createSeqOperationIndex/createHashCode` cast without validation. Any consumer can forge branded values by calling the factory. | `packages/collection/src/types/branded.ts:70-102` |
| 3 | `@gertsai/collection` | Subpath exports declared without `typesVersions` — breaks Node10 TS<5.0 consumers (`moduleResolution: node` legacy) | `packages/collection/package.json:20-65` |
| 4 | `@gertsai/collection` | `Array<[any, any]>` in `entriesArray` public utility; `Set<any>` / `Map<any, number>` in `frequencies` operation; `flatten` returns `Array<any>` | `packages/collection/src/utils/helpers.ts:336`, `operations/set.ts:277-278`, `operations/aggregate.ts:367-368`, `operations/transform.ts:245-248` |
| 5 | `@gertsai/utils` | `Record<string, any>` in exported `getSyncFields` helper — value type `any` erodes consumer narrowing | `packages/utils/src/object/getSyncFields.ts:62,74` |
| 6 | `@gertsai/ws-rpc` | Public `headers?: Record<string, string>` accepted by browser path silently — only Node.js WebSocket forwards it; browser WebSocket discards. No type-level signal. | `packages/ws-rpc/src/client.ts:200,203` |
| 7 | `@gertsai/ws-rpc` | `connect()` second-call concurrent-listener race — `once('error')` listener from second caller can reject a resolved promise after `open` fires (logic HIGH, deferred here from fix-2 because the fix is type-shape-driven) | `packages/ws-rpc/src/client.ts:142-182` |

Without these fixes, downstream consumers ship with weakened compile-time guarantees and one runtime race condition.

## Goals

1. **All 7 HIGH type-system findings closed** — each cited `file:line` verified patched.
2. **No regression** — every package's test suite stays green; new tests added where reasonable (branded factories, ws-rpc connect race).
3. **Migration cost low** — `Constructor<T>` and `memoize` generic constraints widen `any` to `unknown` (call-sites use `Parameters<T>` / `ReturnType<T>` which work better with `unknown[]`). Brand factories may throw on invalid input — soft breaking, justified by security. `WsRpcOptions` split into `WsRpcOptionsNode` / `WsRpcOptionsBrowser` discriminated by env detection.

## Non-Goals

- **NG-001** — MEDIUM/LOW findings from EVID-044 deferred to a polish sprint or rolled into Wave 14.
- **NG-002** — No collection-surface restructuring (FR-001 widens types but doesn't move exports). Wave 14 scope.
- **NG-003** — No Tier-2/3/4/5 audit follow-up — separate waves (12.C/D/E/F).
- **NG-004** — No public-npm-vs-GitHub-Packages migration.

## Functional Requirements

- [ ] **FR-001** — `@gertsai/collection` generic constraints: replace `(...args: any[]) => any` with `(...args: readonly unknown[]) => unknown` in `Constructor<T>`, `memoize<T>`, `memoizeReducer`, `memoizeMethod`, `defineProtoMethod`. Call-sites preserve narrowing via `Parameters<T>` / `ReturnType<T>` which work identically with `unknown[]`.
- [ ] **FR-002** — `@gertsai/collection` brand factories: validate input in factory body — `createCacheKey(value)` checks pattern, throws `BrandValidationError` (new export) on fail; same for `createCollectionId`, `createSeqOperationIndex`, `createHashCode`. Use minimal validators (length, pattern, type).
- [ ] **FR-003** — `@gertsai/collection` `package.json`: add `typesVersions` block mapping `./core/*`, `./mixins/*`, `./operations/*`, `./specialized/*` to their `dist/*.d.ts`. Mirror pattern from `@gertsai/tenant` + `@gertsai/m9s-cache` (Sprint 3.0.1 F-4 standard).
- [ ] **FR-004** — `@gertsai/collection` operation/helper return types: `entriesArray` returns `Array<[PropertyKey, unknown]>`; `frequencies<K, V>(...)` returns `Map<K, number>`; `flatten` returns `Array<unknown>`.
- [ ] **FR-005** — `@gertsai/utils` `getSyncFields<T extends Record<string, unknown>>(data: T): Partial<T>` — replace `any` value type with `unknown`, return type narrows to `Partial<T>`.
- [ ] **FR-006** — `@gertsai/ws-rpc` `WsRpcOptions` split: discriminated union `WsRpcOptions = WsRpcOptionsNode | WsRpcOptionsBrowser`. Only Node variant accepts `headers?`. At runtime, `connect()` reads `env` flag or uses `ws` package presence detection.
- [ ] **FR-007** — `@gertsai/ws-rpc` `connect()` race fix: store the single shared `Promise` of the in-flight connect on `this._connecting` so second/third callers await the SAME promise; first call sets up `once('open')` / `once('error')`, subsequent callers do NOT re-register listeners.
- [ ] **FR-008** — All 3 affected packages get changesets:
  - `@gertsai/collection: minor` (current → next) — FR-001 to FR-004
  - `@gertsai/utils: minor` (current → next) — FR-005
  - `@gertsai/ws-rpc: minor` (current → next) — FR-006 + FR-007

## Non-Functional Requirements

- **NFR-001 — Test budget.** Existing tests stay green. New tests for: brand factory validation (FR-002), `WsRpcOptions` discriminated types (FR-006 compile-time `// @ts-expect-error` test), `connect()` concurrent-call shared-promise (FR-007).
- **NFR-002 — File ownership disjoint.** 3 teammates work on 3 packages.
- **NFR-003 — Forgeplan safety.** MCP only.
- **NFR-004 — Time bound.** ≤2 hours wallclock.
- **NFR-005 — No new deps.** None of the 3 packages gains a runtime dependency.
- **NFR-006 — Backward-compat additive where possible.** `BrandValidationError` is new (additive). `getSyncFields` generic constraint narrowing — minor break for callers passing `Record<string, any>` (rare). `WsRpcOptionsBrowser` strips `headers?` — soft break for code that previously set it on browser (where it was silently discarded anyway).

## Related Artifacts

- **EVID-044** — sources all 7 type-system HIGHs.
- **PRD-028** — Wave 12.B audit parent.
- **PRD-029, PRD-030 + EVID-045, EVID-046** — fix-1 and fix-2 precedents.
- **RFC-022** — execution strategy for this PRD.
- **CLAUDE.md** — IRREVERSIBLE publish red line.

Refs: PRD-030 (precedent), EVID-044 (sources), RFC-022 (execution).





