# @gertsai/rpc-proxy-builder

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
  - I-7  — module-private `Symbol('rpc-proxy')` brand for `isRpcProxy` (CWE-1321).
  - WeakMap cache returns the same proxy reference for the same action map (idempotent build).
