# @gertsai/rpc-proxy-builder

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
