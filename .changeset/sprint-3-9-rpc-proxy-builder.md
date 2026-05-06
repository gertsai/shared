---
'@gertsai/rpc-proxy-builder': minor
'@gertsai/api-core': patch
---

Initial release of @gertsai/rpc-proxy-builder (Tier 3). Type-safe RPC proxy generator.

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
