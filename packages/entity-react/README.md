# @gertsai/entity-react

React framework adapter for [`@gertsai/entity`](../entity/README.md) — `reactReactiveAdapter`
(Proxy-based reactivity) and `useEntity` (a React hook on top of
`React.useSyncExternalStore`). Per
[ADR-008](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-008-framework-adapters-policy-reactiveadapter-contract-wave-5-phase-3.md)
Decision C + Amendment 1 invariants I-11..I-14.

## Install

```bash
pnpm add @gertsai/entity-react @gertsai/entity react
```

`react` is declared as a **peer-optional** dependency. Importing the adapter
without React installed throws a clear error at runtime:

```text
@gertsai/entity-react requires "react" >=18.0.0 as a peer dependency.
Install it with: pnpm add react
```

## Quickstart

```tsx
import { useEntity } from '@gertsai/entity-react';

function Profile({ user }: { user: UserEntity }) {
  const data = useEntity(user);
  return <h1>{data.name}</h1>;
}
```

Wire the adapter when constructing entities so that mutations through
`$patch` (or any other entity API) flow through the Proxy traps:

```ts
import { Entity } from '@gertsai/entity';
import { reactReactiveAdapter } from '@gertsai/entity-react';

class UserEntity extends Entity<{ name: string; age: number }> {}

const user = new UserEntity({
  data: { name: 'Ada', age: 36 },
  reactive: reactReactiveAdapter,
});
```

## API

| Export | Signature | Purpose |
|---|---|---|
| `reactReactiveAdapter` | `ReactiveAdapter` | Satisfies `@gertsai/entity` SPI; wraps targets in a `Proxy` with `set` / `defineProperty` / `deleteProperty` traps that synchronously notify subscribers. |
| `useEntity(entity)` | `<Data extends object>(entity: Entity<Data>) => Readonly<Data>` | React hook; returns the entity's `$data` reference and re-renders on every mutation. Built on `React.useSyncExternalStore` with a version-counter wrapper. |
| `subscribe(target, cb)` | `(target: object, cb: () => void) => () => void` | Low-level subscriber registry (used by `useEntity`); returns an unsubscribe function. |
| `getVersion(target)` | `(target: object) => number` | Read the per-target version counter. Bumps on every Proxy-trapped mutation. |

## Compatibility

| Peer | Supported | Tested |
|---|---|---|
| `@gertsai/entity` | `workspace:^` (≥0.1.0) | This monorepo |
| `react` | `>=18.0.0` (peer-optional) | `^18.0.0` |
| Node | ≥22 LTS | 22.x |

## Security / Caveats

- **Proxy overhead** — every mutation goes through three Proxy traps. For
  hot read-mostly paths the cost is negligible; for write-heavy inner loops
  consider batching mutations with `entity.$patch(partial)` instead of
  per-field assignments.
- **`markRaw` escape hatch** — pass values you never want wrapped (third-party
  class instances, large frozen blobs) through `reactReactiveAdapter.markRaw`
  before nesting them inside reactive data.
- **Module-private `Symbol('raw')`** — raw markers use a per-module Symbol
  (NOT `Symbol.for(...)` shared across modules). This blocks prototype
  pollution attacks (CWE-1321): a third-party Symbol planted on
  `Object.prototype` cannot silently raw-mark application objects.
- **`WeakMap` subscriber registry** — subscriber sets and version counters
  live in `WeakMap`s keyed by the reactive target. When the entity is
  destroyed and the data object becomes unreachable, the registry entry is
  reclaimed by the GC (CWE-401 / CWE-672 protected).
- **3-trap coverage** — `set`, `defineProperty`, and `deleteProperty` all
  notify subscribers. `Object.defineProperty(proxy, ...)` and
  `delete proxy.x` are not silent.
- **`Reflect.set` without external receiver** — the `set` trap propagates
  via `Reflect.set(target, key, value)` (no `receiver` argument), which
  prevents an attacker-supplied receiver from bypassing the notification.
- **Synchronous notify + re-entrancy guard** — subscribers fire
  synchronously inside the trap. A per-target boolean guard prevents
  infinite loops if a subscriber mutates the same target (CWE-674).

## Cross-references

- [ADR-008 — Framework adapters policy + ReactiveAdapter contract](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-008-framework-adapters-policy-reactiveadapter-contract-wave-5-phase-3.md)
- [PRD-003 — Wave 5 foundation](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)
- [`@gertsai/entity` `ReactiveAdapter` contract](../entity/src/types.ts)

## License

Apache-2.0. The `LICENSE` file is a symlink to the repository root.
