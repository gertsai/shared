# @gertsai/rpc-proxy-builder

## 6.0.0

### Patch Changes

- Updated dependencies [33eacbc]
  - @gertsai/api-core@0.7.0

## 5.0.0

### Patch Changes

- Updated dependencies [1d1fd18]
- Updated dependencies [964a57e]
- Updated dependencies [6bdeaa2]
- Updated dependencies [e27a5d2]
- Updated dependencies [b7a1e2d]
  - @gertsai/api-core@0.6.0

## 4.0.2

### Patch Changes

- 30d3b10: Wave 28 — close EVID-080 MED+LOW polish tail across 7 packages (4 MED + 10 LOW, +13 new tests).

  Solo teammate (typescript-pro). +252/-19 LOC. 0 workspace typecheck errors.

  **MED tail (4 actionable, M4 uuid rename deferred to v1.x; M10 already-correct):**

  - **FR-1 (M3) entity** — `EntityWithMetadata.$markSaved` becomes idempotent (guard on `_isMockup === false`). Matches `$markStaled`/`$markFresh` pattern.
  - **FR-2 (M5) session** — Default `errorHandler` now calls `console.error` instead of silent no-op. Easy revert via explicit `errorHandler: () => {}` opt.
  - **FR-3 (M8) tenant-resolver** — JSDoc on `chain-resolver` serial-by-design loop. Doc-only.
  - **FR-4 (M9) runtime-context** — `@example` JSDoc on `requireAuthContextWithDataAccess` showing distinction from `isImpersonating` (from `@gertsai/session-guard`).

  **LOW tail (10):**

  - **FR-6 (L1) audit-primitives** — `convert.ts` adds RangeError guards for negative epoch ms inputs.
  - **FR-7 (L2) async-utils** — `with-timeout.ts` JSDoc on AbortController best-effort fire-and-forget semantics.
  - **FR-8 (L3) async-utils** — `throttle.ts` JSDoc on `cancel()` reset-lastInvoke behaviour.
  - **FR-9 (L4) entity** — `adapters/vue.ts` truthy-check → `typeof === 'function'` triple-check with descriptive error.
  - **FR-10 (L5) tenant-resolver** — `header.strategy.ts` JSDoc on `string[]` header first-value behaviour.
  - **FR-11 (L6) tenant-resolver** — `subdomain.strategy.ts` IPv4 regex now range-precise (octets 0–255).
  - **FR-12 (L7) rpc-proxy-builder** — `proxy.ts` adds `has`/`ownKeys`/`getOwnPropertyDescriptor` traps. `'foo' in proxy` and `Object.keys(proxy)` now behave as expected.
  - **FR-13 (L8) rpc-proxy-builder** — `proxy.ts` get trap special-cases `then`/`catch`/`finally` → `undefined` for Promise-unwrap detection. `await proxy` no longer throws.
  - **FR-14 (L9) logger-factory** — `winston/index.ts` JSDoc on fatal→error mapping loss-of-distinction.
  - **FR-15 (L10) logger-factory** — `pino/index.ts` accepts optional `pinoOptions` second arg passed through to `pino()`. Backward compat preserved.

  **M4 (OperatorRef.\_uid → uuid rename)** — intentionally **deferred** to v1.x minor/major. Surface-breaking rename, not a patch-level polish.

  **M10 (`ctx.meta ?? {}` lazy-create)** — EVID-080 tagged as "code is correct; readability note". No action.

  **Tests**: +13 new (1 entity EntityWithMetadata + 1 entity vue + 1 session console.error + 1 tenant-resolver subdomain IPv4 + 4 audit-primitives negative epochs + 2 rpc-proxy-builder traps + 1 rpc-proxy-builder thenable + 2 logger-factory pinoOptions).

  **Behaviour clarifications**:

  - FR-1: `$markSaved` no-op when already saved — consumers who relied on re-emit must call manually.
  - FR-2: New errorHandler default emits `console.error('[gertsai/session] uncaught error:', err)`. Pass explicit handler to silence.
  - FR-12: `'foo' in proxy` and `Object.keys(proxy)` semantics change from "always empty" to "reflects registered actions".
  - FR-13: `await proxy` returns the proxy itself (was: threw `Unknown RPC action: then`).
  - FR-15: `pino(opts)` signature added — defaults preserved when called with no args.

  All bumps: patch. Zero public surface breaks.

  EVID-080 tail closure: **4/4 actionable MED closed + 10/10 LOW closed**. Combined with Wave 26 (5/5 HIGH + 3/10 MED), audit gap fully drained across all 41 packages.

  Refs: PRD-064, EVID-080 (Wave 25 audit), EVID-082 (Wave 28 evidence).

  - @gertsai/api-core@0.5.2

## 4.0.1

### Patch Changes

- f219b2c: Wave 26 — close 5 HIGH + 3 MED EVID-080 findings across 4 packages (+ tenant-resolver test+doc).

  Solo teammate (typescript-pro). +14 tests, 0 workspace typecheck errors.

  **FR-1 (H1) session** — `Session.token` getter throws `SessionDestroyedError` (was bare `Error`). Test asserts `instanceof SessionDestroyedError` (was string-match).

  **FR-2 (H2) runtime-context** — `provider-context._lookup` refactored to `{ present, value }` discriminator. `provide(token, undefined)` now distinguishable from "not bound" — `get(token)` returns `undefined` instead of throwing `ProviderNotFoundError`. +4 tests.

  **FR-3 (H3) rpc-proxy-builder** — proxyCache nested `WeakMap<actions, WeakMap<transport, proxy>>`. Different transports sharing same actions now get distinct proxies (fixes multi-instance singleton bug per ADR-012 Wave 6.3). +2 tests.

  **FR-4 (H4) entity** — `Entity.$patch` + `EntityWithMetadata.$setMetadata` swap `for...in` → `Object.keys(input)` (skip prototype chain, prototype-pollution defense).

  **FR-5 (H5) entity** — `EntityJSON.data: Readonly<Data>` type widening (compile-time mutation rejection). `@ts-expect-error` test pins.

  **FR-6 (M1+M2) entity deep-equal** — `Object.is` for primitives (NaN equality + +0/-0 distinction) + symmetric `Object.keys` length guard. +6 tests for edge cases.

  **FR-7 (M6) tenant-resolver** — `path.strategy.ts` wildcard sentinel changed `___WILDCARD___` → `\x1FWILDCARD\x1F` (Unit-Separator control char). `split`/`join` replace instead of regex (avoids special-char interpretation). +1 test confirms literal `___WILDCARD___` segment doesn't collide.

  **FR-8 (M7) tenant-resolver** — NON_PRINTABLE JSDoc note about ASCII-only limitation (no Cyrillic/CJK/emoji/non-Latin-1).

  **Tests**: +14 new (4 runtime-context + 2 rpc-proxy-builder + 1 entity Entity + 6 entity deep-equal + 1 tenant-resolver path).

  **Behaviour clarification**:

  - FR-1: `SessionDestroyedError extends AppError extends Error` — `instanceof Error` still passes; substring matchers `'destroyed'` still pass.
  - FR-2: `get`/`getOptional` signatures unchanged. Behaviour change only for previously-broken bound-to-undefined case.
  - FR-3: Public surface unchanged. Cache identity for `(sameActions, sameTransport)` still holds.
  - FR-4/5/6/7/8: Pure correctness improvements; no API breaks.

  All bumps: patch.

  EVID-080 H closure: **5/5 HIGH closed**. 3/10 MED closed. Remaining 7 MED + 8 LOW deferred (cosmetic / out-of-scope per PRD-063).

  After Wave 25+26 all 41 packages deep-audited, 100% HIGH closure rate maintained.

  Refs: PRD-063, EVID-080 (Wave 25 audit), ADR-006/007/009/010 + ADR-012 Wave 6.3.

## 4.0.0

### Patch Changes

- Updated dependencies [e16d41f]
  - @gertsai/api-core@0.5.0

## 3.0.0

### Patch Changes

- Updated dependencies [5cfbfec]
  - @gertsai/api-core@0.4.0

## 2.0.0

### Patch Changes

- Updated dependencies [2e111ed]
  - @gertsai/api-core@0.3.0

## 1.0.0

### Minor Changes

- c6896c4: Initial release of @gertsai/rpc-proxy-builder (Tier 3). Type-safe RPC proxy generator.

  - `createRpcProxy<TActionMap>(transport, actions)` — Proxy with **3 traps** per ADR-009 I-15:
    - `get`: returns action fn or throws `Error('Unknown RPC action: ...')` per I-14 (CWE-1230 fail-open + namespace probing prevention).
    - `set`: returns false (TypeError in strict mode).
    - `deleteProperty`: returns false.
  - Module-private `Symbol('rpc-proxy')` brand markers per Sprint 3.8 I-11 reuse (CWE-1321 prototype pollution protection).
  - `isRpcProxy(value)` type guard with forgery resistance.
  - WeakMap-backed idempotent cache (same actions map → same proxy ref).
  - Type-only peer on `@gertsai/api-core/contracts` (consumes `ActionDefinition<I, O>`).
  - Generic over transport — implementable for Moleculer broker / WebSocket / HTTP / custom.

  @gertsai/api-core patch: NEW additive `ActionDefinition<TInput, TOutput>` type-only contract added to `/contracts` subpath per ADR-009 Amendment 1.1.1. Backward-compat preserved (additive only).

### Patch Changes

- Updated dependencies [0755c6d]
- Updated dependencies [1f8494e]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
- Updated dependencies [c6896c4]
- Updated dependencies [56eb238]
  - @gertsai/api-core@0.2.0

## 0.1.0

### Minor Changes

- Initial release per SPEC-014 W-3-9-17..21 + ADR-009 Amendment 1.

  Type-safe RPC proxy builder. Derives `Promise`-returning method maps from
  `Record<string, ActionDefinition<I, O>>` via a read-only ECMAScript `Proxy`.
  Transport-agnostic — Moleculer broker, WebSocket RPC, and HTTP clients
  plug in via the `RpcTransport` interface (no concrete runtime imports).

  Invariants per ADR-009:

  - I-14 — unknown action throws synchronously (no fail-open / namespace probing, CWE-1230).
  - I-15 — read-only Proxy: `set` and `deleteProperty` traps reject mutation.
  - I-7 — module-private `Symbol('rpc-proxy')` brand for `isRpcProxy` (CWE-1321).
  - WeakMap cache returns the same proxy reference for the same action map (idempotent build).
