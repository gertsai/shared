# @gertsai/rpc-proxy-builder

> Tier 3 type-safe RPC proxy builder. Derives `Promise`-returning method maps
> from `ActionDefinition` records via a read-only ECMAScript `Proxy` —
> transport-agnostic (Moleculer / WebSocket / HTTP).

[![npm version](https://img.shields.io/npm/v/@gertsai/rpc-proxy-builder.svg)](https://www.npmjs.com/package/@gertsai/rpc-proxy-builder)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

---

## Install

```sh
pnpm add @gertsai/rpc-proxy-builder @gertsai/api-core
# or
npm install @gertsai/rpc-proxy-builder @gertsai/api-core
```

`@gertsai/api-core` is a **type-only peer** — `ActionDefinition` is a pure
TypeScript interface with no runtime cost. Your concrete RPC transport
(Moleculer broker, WebSocket client, HTTP fetch wrapper) lives outside this
package and is wired in via the `RpcTransport` interface.

---

## Quickstart

```typescript
import { createRpcProxy, type RpcTransport } from '@gertsai/rpc-proxy-builder';
import type { ActionDefinition } from '@gertsai/api-core/contracts';

interface User { id: string; name: string }

const actions = {
  getUser:    {} as ActionDefinition<{ id: string }, User>,
  createUser: {} as ActionDefinition<{ name: string }, User>,
  deleteUser: {} as ActionDefinition<{ id: string }, void>,
} satisfies Record<string, ActionDefinition<unknown, unknown>>;

// Plug your transport (Moleculer broker.call, WS client, HTTP fetch...)
const transport: RpcTransport = {
  async call(action, input, options) {
    return myBroker.call(action, input, options);
  },
};

const proxy = createRpcProxy(transport, actions);

const user = await proxy.getUser({ id: 'u-1' }, { timeoutMs: 5000 });
//        ^? Promise<User>  — input + output fully type-narrowed
```

---

## API

### `createRpcProxy<TActionMap>(transport, actions): RpcProxy<TActionMap>`

Builds a read-only Proxy over `actions`. Each property `K` becomes
`(input: I, options?: RpcCallOptions) => Promise<O>` derived from
`actions[K]: ActionDefinition<I, O>`.

The same proxy reference is returned for the same `actions` object
(WeakMap cache — idempotent build).

### `isRpcProxy(value): boolean`

Type guard — returns `true` iff `value` was produced by `createRpcProxy`
in this module instance. Backed by a module-private `Symbol`, so external
callers cannot forge the brand (CWE-1321).

### `RpcTransport`

```typescript
interface RpcTransport {
  call<I, O>(action: string, input: I, options?: RpcCallOptions): Promise<O>;
}
```

### `RpcCallOptions`

```typescript
interface RpcCallOptions {
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}
```

Additive — new fields stay optional.

---

## Compatibility

| Peer | Range | Notes |
|---|---|---|
| `@gertsai/api-core` | `workspace:^` | type-only — `ActionDefinition` interface, no runtime |
| Node | `>=22 LTS` | aligned with monorepo `target: node22` |
| TypeScript | `>=5.0` | uses standard mapped + conditional types |

No concrete transport is imported. Bring your own (Moleculer / WS / HTTP).

---

## Security & caveats

- **Read-only Proxy (I-15).** `set` and `deleteProperty` traps return
  `false` — assignment is a no-op in sloppy mode and a `TypeError` in
  strict mode. Callers cannot inject methods after build.
- **Unknown action throws (I-14).** Accessing a property absent from the
  action map throws `Error('Unknown RPC action: <name>')`. This blocks
  fail-open behavior and namespace probing (CWE-1230); never returns
  `undefined` for unknown keys.
- **Module-private brand (I-7).** `isRpcProxy` is backed by a
  `Symbol('rpc-proxy')` local to this module. Forgery via
  `Symbol.for('rpc-proxy')` does **not** pass (CWE-1321).
- **WeakMap cache.** Idempotent build — same `actions` object yields the
  same proxy reference; the cache holds proxies only as long as the
  action map itself is reachable.
- **Symbol-keyed access** (e.g., `Symbol.iterator`, `Symbol.asyncIterator`)
  returns `undefined` rather than throwing, so `for...of` and similar
  language hooks degrade gracefully.

---

## Cross-references

- **ADR-009** — Wave 5 Phase 4 extraction policy (Decision C, invariants
  I-6, I-7, I-14, I-15, Amendment 1).
- **PRD-003** — Wave 5 errors / runtime-context / framework-adapters
  developer-experience foundation.
- **`@gertsai/api-core/contracts`** — `ActionDefinition<I, O>` type-only
  contract consumed here.

---

## License

[Apache-2.0](./LICENSE) © gerts.ai
