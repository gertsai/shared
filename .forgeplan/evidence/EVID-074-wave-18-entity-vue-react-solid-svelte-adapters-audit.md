---
depth: tactical
id: EVID-074
kind: evidence
links:
- target: PRD-056
  relation: informs
status: active
title: Wave 18 — entity-{vue,react,solid,svelte} adapters audit
---

## Summary

Read-only audit of the 4 framework `ReactiveAdapter` packages (`@gertsai/entity-{vue,react,solid,svelte}`) produced under Sprint 3.8 per ADR-008. Total source LOC: ~700 (vue 65, react 226, solid 211, svelte 220). Total test LOC: ~700 across 18 test files. **0 CRITICAL, 5 HIGH, 7 MEDIUM, 5 LOW findings**. Source code, test code, and `package.json` files were inspected for each adapter; no source mutations were made.

The biggest theme is **cross-adapter inconsistency in notify timing and subscriber API surface**. Vue defers (microtask), React/Svelte notify synchronously, and Solid relies on Solid's reactive graph (effectively eager but not adapter-controlled). The 4 adapters expose 4 different consumer-facing APIs for "observe a mutation": Vue (nothing — relies on Vue's reactivity engine), React (`subscribe`+`getVersion`), Solid (none — Solid tracks transitively), and Svelte (`getStore`+`entityStore`). Consumers who swap adapters will hit this. **The second theme is re-entrancy semantics**: React + Svelte adopt a per-target boolean guard that swallows the inner mutation's subscriber notification (subscribers see only the outer state), Solid has no guard at all (relies on Solid's `produce` semantics — but tests use a mock so the real-runtime behaviour is unverified), Vue inherits Vue's batching. **The third theme is test coverage parity**: React has 7 dedicated test files (full matrix: adapter-conformance, proxy-traps, prototype-pollution, re-entrancy, WeakMap-GC, useEntity, peer-dep-gate); Svelte has 7 (entity-store + conformance + proxy-traps + re-entrancy + WeakMap-GC + prototype-pollution + peer-dep-gate); Solid has only 2 (adapter + use-entity) — re-entrancy and WeakMap-GC tests are missing; Vue has 3 (adapter, lift-fidelity, peer-dep-gate) — intentionally minimal because Vue's reactivity engine is upstream-tested, but it leaves the contract-conformance matrix nonsymmetric.

No critical security issues found. Prototype-pollution defence is in place across all 4 adapters (module-private `Symbol(...)` + `hasOwnProperty.call`). The `markRaw` brand is installed with `configurable: false, writable: false` in all four — intentionally one-way per ADR-008 design but not asserted by any test. The Solid adapter's `isStoreBranded` uses `Reflect.get` which is prototype-chain-aware; this is safe in practice (STORE_BRAND is a module-private `Symbol(...)` not exported) but lacks a dedicated negative test against `Object.prototype` symbol pollution.

## Structured Fields

- verdict: supports
- congruence_level: CL3
- evidence_type: internal_audit
- linked_artifact: PRD-056
- summary: 4-adapter audit — 0 critical, 5 high, 7 medium, 5 low; biggest themes are notify-timing inconsistency, re-entrancy semantics divergence, and Solid test-coverage parity gap.

## Coverage Stats

| Adapter | Source LOC | Test files | Test LOC | Findings (C/H/M/L) |
|---|---|---|---|---|
| `@gertsai/entity-vue` | 65 | 3 | 217 | 0/1/1/1 |
| `@gertsai/entity-react` | 226 | 7 | 375 | 0/1/2/1 |
| `@gertsai/entity-solid` | 211 | 2 | 228 | 0/2/3/2 |
| `@gertsai/entity-svelte` | 220 | 7 | 561 | 0/1/1/1 |

## CRITICAL findings

**None.** No security-critical findings (no injection, no arbitrary code execution, no prototype-pollution bypass). The `markRaw`/`isReactive` brand mechanism is solid across all 4 adapters per ADR-008 I-11.

## HIGH findings (per adapter)

### entity-vue

- **H-V1 — Notify timing diverges from React/Svelte** — `src/index.ts:55–65` — `vueReactiveAdapter` delegates to `@vue/runtime-core.shallowReactive`, which defers update propagation through Vue's microtask scheduler. React + Svelte adapters notify synchronously inside the Proxy trap; consumers swapping adapters (e.g. for SSR vs CSR) will observe out-of-order side effects in a single mutation batch. The ADR does not call out this asymmetry. **Fix:** document the contract explicitly in `ReactiveAdapter` JSDoc (`@gertsai/entity/src/types.ts:39`) and add a `notifyMode: 'sync' | 'microtask'` capability discriminator (additive, non-breaking).

### entity-react

- **H-R1 — Re-entrant subscriber notification is silently dropped** — `src/adapter.ts:27–40` (`notify`) — when a subscriber mutates the same target inside its callback, the inner `notify(t)` call hits `reentrancyGuard.get(target) === true` and returns immediately, BEFORE the inner mutation's version bump and BEFORE iterating subscribers. The outer trap already did `Reflect.set` so the data IS updated, but subscribers receive a stale snapshot. `useSyncExternalStore` will resolve correctly on the next render because `getVersion()` reads the live counter — but only because `getSnapshot()` is called by React separately. Any non-React consumer of `subscribe(target, cb)` will see fewer notifications than mutations. Existing test `re-entrancy.test.ts` only asserts `invocations >= 1` so the divergence is not pinned. **Fix:** either (a) document the "single notify per microtask burst" contract explicitly + assert it in test; or (b) defer the inner notify to a queued microtask so subscribers eventually see every mutation. Recommendation: option (a) — current behaviour is intentional flood-control, just needs documentation.

### entity-solid

- **H-S1 — No re-entrancy guard at all** — `src/adapter.ts:104–133` (3 traps) — Solid adapter's `set`/`deleteProperty`/`defineProperty` traps unconditionally call `setStore(produce(...))`. The mock used by `adapter.test.ts:13–27` short-circuits the producer immediately, so the real-runtime re-entrancy behaviour is never exercised. In real `solid-js/store`, `setStore` triggers signal recomputation synchronously — a subscriber that writes back to the same store inside an effect could recurse. Solid 1.x does some internal batching but contract-level safety relies on it. **Fix:** add a re-entrancy test that runs against actual `solid-js/store` (drop the mock for one test file) OR add an explicit guard mirroring React/Svelte for parity.
- **H-S2 — `set` trap returns `true` unconditionally regardless of underlying write success** — `src/adapter.ts:104–111` — `setStore(produce(...))` has no return value; the trap discards any error. If the target is sealed/frozen or contains a non-writable property descriptor, the write silently no-ops and the proxy still reports `true` to the caller. JavaScript's strict mode contract for Proxy `set` traps requires returning `false` when the write would have failed; returning `true` here triggers an invariant violation in strict mode (silent in sloppy mode). **Fix:** wrap the `setStore` call in try/catch and reflect the result; or accept the limitation and document it as an ADR-008 caveat.

### entity-svelte

- **H-Sv1 — Same re-entrancy-drops-notification issue as React** — `src/adapter.ts:66–77` (`notify`) — identical pattern to entity-react. Outer mutation: `Reflect.set` writes, then `notify(target)` → guard up → `store.set({...target})` (snapshot at outer write) → subscriber fires → subscriber mutates → trap → `notify(target)` → guard true → **early return, store.set never fires with the inner snapshot**. The `re-entrancy.test.ts:32–50` test passes because it asserts `target.count === 2` (data IS updated) but does NOT assert `observations` count or the snapshot subscribers received. Subscribers see `{count: 1}` even though `target.count === 2`. **Fix:** same as H-R1 — document the contract or queue an explicit follow-up `store.set` after the guard clears.

## MEDIUM/LOW findings (consolidated)

| ID | Severity | Adapter | File:line | Finding | Suggested fix |
|---|---|---|---|---|---|
| M-V1 | M | vue | `src/index.ts:22–53` | Lazy-load caching done as 3 separate module-level lets — no `__resetCacheForTests` seam like Svelte's. Peer-dep-gate test patches `Module._load` to dodge this, but resetting cache in tests still requires `vi.resetModules()`. | Add `__resetVueCacheForTests()` mirroring `__resetWritableCacheForTests` for symmetry. |
| L-V1 | L | vue | n/a | Test parity gap — no proxy-traps / re-entrancy / WeakMap-GC tests because Vue owns reactivity. Defensible by design but contract matrix is nonsymmetric across adapters. | Document the gap in package README (`Why no X tests: Vue's reactivity engine is upstream-tested`). |
| M-R1 | M | react | `src/adapter.ts:80, 138–142` | `isReactive` uses `reactiveProxies.has(value)`. A WeakSet keyed by proxy identity — correct. But `hasOwnProperty.call(target, RAW)` on line 80 is the only fast path for "this target is raw"; an object that was already wrapped (target → proxy in `targetToProxy`) goes through the cached path. Correct, but the interplay between `reactiveProxies`, `targetToProxy`, `proxyToTarget` is 3 module-level WeakMaps + 1 WeakSet — high cognitive load. | Consolidate state into a single `WeakMap<object, { proxy: object; subs: Set<()=>void>; version: { value: number } }>` keyed by target. |
| M-R2 | M | react | `src/adapter.ts:126–136` | `markRaw` mutates the argument via `Object.defineProperty` with `configurable: false`. No test asserts the un-overwritability (Sprint 3.10 W-3-10-13 cited in JSDoc but the assertion is not present). | Add a test asserting `expect(() => Object.defineProperty(value, RAW, {value: false})).toThrow()` to pin the invariant. |
| L-R1 | L | react | `src/use-entity.ts:32–49` | `loadReact()` swallows the underlying error (`catch {}`) and re-throws a generic install-hint message. Hides the real failure mode (e.g., React 17 installed, useSyncExternalStore missing) from operators. | Wrap original error as `cause`: `throw new Error(..., { cause: err })`. |
| M-S1 | M | solid | `src/adapter.ts:84–87` | `isStoreBranded` uses `Reflect.get(value, STORE_BRAND)` which is prototype-chain-aware. STORE_BRAND is module-private so practical risk is low, but a dedicated negative test (pollute `Object.prototype[Symbol.for('@gertsai/entity-solid:store')] = true` and confirm `isReactive({})` returns false) is missing. | Add prototype-pollution negative test specifically targeting STORE_BRAND. |
| M-S2 | M | solid | `src/adapter.ts:120–133` | `defineProperty` trap discards descriptor metadata (configurable/enumerable/writable/get/set) — only `value` (or `get()` result) is extracted and re-assigned. `Object.defineProperty(proxy, k, {get: fn, configurable: false})` becomes a plain assignment of `fn()` result. | Document the Solid-store-specific limitation; add a test that asserts the lossy behaviour so it doesn't drift. |
| M-S3 | M | solid | no test file | No re-entrancy, no WeakMap-GC, no dedicated proxy-traps test file. Coverage is folded into adapter.test.ts but doesn't reach parity with React/Svelte matrices required by PRD-056 §Cross-cutting. | Add `__tests__/proxy-traps.test.ts`, `re-entrancy.test.ts`, `weakmap-gc.test.ts` for parity. |
| L-S1 | L | solid | `src/adapter.ts:33,44–65` | No `__resetSolidCacheForTests` test seam like Svelte's; tests use `vi.resetModules()` + `vi.doMock('node:module', ...)` which is workable but inconsistent with Svelte's pattern. | Add `__resetSolidCacheForTests()` for symmetry. |
| L-S2 | L | solid | `src/adapter.ts:13–17` | Tests rely on the `solid-js/store` mock (`vi.mock('solid-js/store', ...)`) — `produce` is faked as identity-mutate. Real Solid runtime is not exercised in CI, so behavioural drift in Solid 2.x will be invisible. | Add a `*.real.test.ts` that runs against actual `solid-js/store` (skip-by-default like integration tests, similar to `.integration.test.ts` convention). |
| M-Sv1 | M | svelte | `src/entity-store.ts:25–46` | `entityStore(entity)` calls `svelteReactiveAdapter.reactive(entity.$data)` but if the Entity was constructed with `plainReactiveAdapter` (NOT svelte's), `entity._data` is the unwrapped raw object. The call wraps a fresh proxy and stores it under that raw target's key — but `entity.$patch` still mutates `entity._data` directly. So writes hit the proxy traps installed during construction (none if plain), bypassing svelte's notify. `entityStore` subscribers see only the initial emission. No runtime guard, no error. | Validate `isReactive(entity.$data)` and throw `Error('entityStore requires Entity constructed with svelteReactiveAdapter')` if not. |
| L-Sv1 | L | svelte | `src/adapter.ts:108–113, 119` | `proxy` itself is branded via `Object.defineProperty(proxy, REACTIVE_BRAND, ...)` AND the proxy is registered in `stores` under the proxy key (line 119). Means every reactive call writes 2 WeakMap entries (target + proxy). Memory overhead is small but the dual-mapping is asymmetric vs target-only mapping. | Document the dual-key mapping rationale in `getStore` JSDoc (currently noted as "Mirror the target → store mapping" but not why both are needed). |

## Cross-cutting observations

1. **Notify-timing asymmetry is the biggest contract drift.** Vue → microtask (Vue's scheduler), React/Svelte → synchronous inside trap, Solid → synchronous via Solid's reactive graph (which itself batches signals). The `ReactiveAdapter` interface in `@gertsai/entity/src/types.ts:39–46` does NOT specify notify timing. Any consumer that depends on synchronous post-mutation reads will see different behaviour swapping Vue ↔ React/Svelte. This is a v1.0.0 stability gate.

2. **Subscriber-API surface is 4 different things.** Vue exposes nothing (relies on Vue). React exposes `subscribe(target, cb)` + `getVersion(target)`. Solid exposes nothing (relies on Solid). Svelte exposes `getStore(target)` and `entityStore(entity)`. PRD-056 explicitly expects "all 4 implement the SAME `ReactiveAdapter` interface" — they do for the 3 contract methods, but the de-facto consumer-facing surface diverges substantially. Extraction candidate: lift `subscribe(target, cb): () => void` into the `ReactiveAdapter` interface as optional, and provide a polyfill helper for Vue/Solid.

3. **Re-entrancy contract is implicit.** React + Svelte have boolean guards that drop inner-mutation notifications; Solid has no guard (depends on Solid runtime); Vue depends on Vue's flush queue. None of this is documented in the interface. Subscribers MUST be designed defensively or the contract MUST be pinned. Recommendation: pin the contract in JSDoc + add a parametric test suite that runs identical scenarios against all 4 adapters (current suites are per-adapter siloed).

4. **Test coverage is uneven.** Svelte/React have full security matrix (proxy-traps + prototype-pollution + re-entrancy + WeakMap-GC + peer-dep-gate + conformance + hook). Solid has only adapter + use-entity. Vue has only adapter + lift-fidelity + peer-dep-gate. For OSS publish credibility a parity contract test fixture (consumed by all 4) would close this systemically.

5. **`markRaw` non-reversibility is documented but untested.** All 4 adapters use `configurable: false, writable: false` per ADR-008 Amendment 1.2.x but none asserts the invariant via `expect(() => Object.defineProperty(v, RAW, {value: false})).toThrow()`. A regression in `markRaw` defaults from `false` to `true` (a one-character bug) would silently break the security model.

6. **Package.json shape is consistent across all 4** — same scripts (build/clean/test/typecheck/lint), same publishConfig (npm.pkg.github.com), same SemVer 2.0.0, peer-deps marked optional uniformly, no `engines.node` declared (relies on workspace defaults). 

7. **Code-shape duplication.** The lazy-peer-dep `try { require(...) } catch { throw Error(install hint) }` pattern is repeated verbatim in vue/solid/svelte (react uses the same shape for `useSyncExternalStore`). Extraction candidate: a `@gertsai/peer-dep-loader` micro-package or a per-package internal helper. Low priority.

## Suggested Wave 19 fix sequence

Prioritised — each item is an independent PR-sized chunk:

1. **Document notify-timing contract** in `@gertsai/entity/src/types.ts:39` JSDoc — name the divergence explicitly (`sync` for React/Svelte/Solid-via-store, `microtask` for Vue). Add a `notifyMode?: 'sync' | 'microtask'` informational property to `ReactiveAdapter`. Low risk, high consumer value. **Closes H-V1.**
2. **Pin the re-entrancy contract** for React + Svelte. Add a single test per adapter that asserts the observed subscriber-call count vs mutation count when a subscriber mutates the same target, then document it in JSDoc. **Closes H-R1, H-Sv1.**
3. **Fix entity-solid coverage parity**: add `__tests__/{proxy-traps,re-entrancy,weakmap-gc,prototype-pollution}.test.ts` (re-use React's shape). **Closes H-S1, M-S1, M-S3.**
4. **Add Solid `set` trap success-reporting** (try/catch around `setStore`, return `false` on throw). **Closes H-S2.**
5. **Add `entityStore` runtime adapter check**: throw if `entity.$data` is not adapter-wrapped. **Closes M-Sv1.**
6. **Add `__resetCacheForTests` for vue + solid** for symmetry with svelte. **Closes M-V1, L-S1.**
7. **Add markRaw non-reversibility assertion** (one test per adapter, ~3 lines each). **Closes M-R2 (and applies to all 4).**
8. **Consolidate React WeakMap state** into a single per-target record. Refactor only, no contract change. **Closes M-R1.** Wave 20 candidate (larger).
9. **Lift consumer-facing subscriber API into the `ReactiveAdapter` interface** as optional `subscribe?`/`getVersion?` — supply Vue/Solid polyfills via Vue `watchEffect` / Solid `createEffect`. v1.0.0 candidate, NOT Wave 19. **Closes cross-cutting #2.**

## Methodology

Read-only: source `.ts` files for `packages/entity-{vue,react,solid,svelte}/src/**` + `package.json` files inspected; `@gertsai/entity/src/types.ts` consulted for the canonical interface; the `Entity` class's wiring (`packages/entity/src/Entity.ts:51`) verified to confirm `_reactive.reactive(seed)` is called once at construction (relevant to M-Sv1). 14 source files read end-to-end (4 `adapter.ts` + 3 `use-entity.ts` + 2 svelte support files + 4 `index.ts` + 1 `types.ts`). 13 test files read end-to-end. No source mutations, no execution of test suites (audit budget). All findings have file:line citations.

## Refs

- PRD-056 (target — Wave 18 deferred audit)
- ADR-008 (entity reactive adapters; Decisions B/C/D/E + Amendment I-11..I-14)
- Sprint 3.8 W-3-8-{1..21}
- EVID-058 (deferred audit identification — Wave 5 closure)
- EVID-067 (audit pattern precedent — Wave 17 reference)


