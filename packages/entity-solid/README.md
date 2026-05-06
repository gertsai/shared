# @gertsai/entity-solid

Solid.js framework adapter for [`@gertsai/entity`](../entity). Wraps entity
data in a `solid-js/store` so Solid components can subscribe to fine-grained
mutations of `Entity._data` with the same reactive primitives Solid uses
elsewhere in your application.

Per ADR-008 Decision D, SPEC-013 W-3-8-12..16, Amendment 1 invariants
I-11..I-14.

---

## Install

```bash
pnpm add @gertsai/entity @gertsai/entity-solid solid-js
```

`solid-js` is declared as a **peer-optional** dependency: this package
loads `solid-js/store` lazily, so consumers that import it but never
invoke the adapter never pay the peer-dep cost.

## Quickstart

```tsx
import { Entity } from '@gertsai/entity';
import { solidReactiveAdapter, useEntity } from '@gertsai/entity-solid';

interface UserData {
  name: string;
  age: number;
}

class UserEntity extends Entity<UserData> {
  $defaultData(): UserData {
    return { name: 'anon', age: 0 };
  }
}

const user = new UserEntity({
  data: { name: 'gerts', age: 30 },
  reactive: solidReactiveAdapter,
});

function Profile() {
  const store = useEntity(user);
  return <h1>{store.name}</h1>;
}
```

Solid tracks signal reads inside the JSX expression; any mutation of
`user.$data.name` (e.g. via `user.$patch({ name: 'next' })`) routes through
the adapter's `set` Proxy trap → `setStore(produce(...))` → fine-grained
re-render of the `<h1>` only.

## API

### `solidReactiveAdapter: ReactiveAdapter`

Implementation of the `@gertsai/entity` `ReactiveAdapter` contract backed by
`createStore` + `produce` from `solid-js/store`. Pass it as the
`reactive` option to any `Entity` / `EntityWithMetadata` constructor.

- `reactive<T>(target)` — wraps `target` in a `Proxy` over a Solid store; the
  Proxy intercepts `set` / `defineProperty` / `deleteProperty` and routes
  every mutation through `setStore(produce(...))` so Solid's reactive graph
  fires synchronously (I-13).
- `markRaw<T>(value)` — installs a module-private `Symbol('raw')` brand on
  `value` so `reactive(value)` becomes a no-op (escape hatch for objects
  that must not be wrapped, e.g. third-party class instances).
- `isReactive(value)` — `true` iff `value` is a Proxy returned by this
  adapter's `reactive(...)`.

### `useEntity<Data>(entity: Entity<Data>): Readonly<Data>`

Returns the entity's `$data` reference for use inside Solid components.
Solid tracks signal reads transitively, so no extra hook subscription is
needed — simply read `store.field` and Solid will re-render the dependent
JSX when `Entity._data.field` changes through the adapter.

## Compatibility

- **Solid**: `solid-js >=1.0.0`. Tested against Solid 1.8+.
- **Node**: `>=22` (matches monorepo baseline).
- **Browsers**: any environment where Solid runs.

## Security caveats

- **CWE-1321 (prototype pollution)**: marker symbols are module-private
  `Symbol(...)` — NOT `Symbol.for(...)` — and lookups use
  `Object.prototype.hasOwnProperty.call(value, MARK)`. A foreign object
  cannot forge a raw / store brand by polluting `Object.prototype`.
- **CWE-401 (memory leak)**: Solid's `createStore` manages reactive
  subscriptions internally and releases them when the owning component is
  disposed. The adapter does not maintain its own subscriber registry — there
  is no module-level `Map` to leak.
- **CWE-674 (recursion)**: mutations are issued through `setStore(produce(...))`
  which Solid serializes; the adapter's Proxy traps do not recurse.
- **Peer-dep gate**: importing this package without `solid-js` installed is
  safe — the error is deferred to the first call that needs `solid-js/store`.

## Cross-references

- [ADR-008](../../.forgeplan/adrs/ADR-008-framework-adapters-policy-reactiveadapter-contract-wave-5-phase-3.md)
  — framework adapter policy + invariants I-11..I-14.
- [SPEC-013](../../.forgeplan/specs/SPEC-013-sprint-3-8-wave-5-phase-3-4-entity-framework-adapters-vue-react-solid-svelte.md)
  — Sprint 3.8 deliverable scope.
- [`@gertsai/entity`](../entity) — base classes (`Model` / `Entity` /
  `EntityWithMetadata`) and the `ReactiveAdapter` contract.
- [`@gertsai/entity-vue`](../entity-vue),
  [`@gertsai/entity-react`](../entity-react),
  [`@gertsai/entity-svelte`](../entity-svelte) — sibling adapters.

## License

Apache-2.0 © gerts.ai. See [`LICENSE`](./LICENSE).
