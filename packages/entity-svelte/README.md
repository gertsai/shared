# @gertsai/entity-svelte

Svelte framework adapter for [`@gertsai/entity`](../entity). Pluggable
`ReactiveAdapter` backed by Svelte `writable` stores plus an
`entityStore` factory that yields a `Readable<Entity<Data>>` compatible
with Svelte's `$store` template syntax. Tier 2 — depends only on
`@gertsai/entity` and (peer-optional) `svelte`.

Per ADR-008 Decision E + Amendment 1.1.1 + invariants I-11..I-14.

## Install

```sh
pnpm add @gertsai/entity-svelte @gertsai/entity svelte
```

`svelte` is declared as an **optional peer dependency**. Without it
installed, importing the adapter package succeeds at module-resolution
time, but the first call to `svelteReactiveAdapter.reactive(...)` (or
`entityStore(...)`, which delegates to it) throws:

```
Error: @gertsai/entity-svelte requires "svelte" >=4.0.0 as a peer
dependency. Install it with: pnpm add svelte
```

## Quickstart

```svelte
<script lang="ts">
  import { Entity } from '@gertsai/entity';
  import { entityStore, svelteReactiveAdapter } from '@gertsai/entity-svelte';

  class User extends Entity<{ name: string; email: string }> {
    $defaultData() {
      return { name: '', email: '' };
    }
  }

  const user = new User({
    reactive: svelteReactiveAdapter,
    data: { name: 'Ada', email: 'ada@example.com' },
  });

  const store = entityStore(user);
</script>

<h1>{$store._data.name}</h1>
<p>{$store._data.email}</p>

<button on:click={() => user.$patch({ name: 'Grace' })}>Rename</button>
```

The `$store` syntax dereferences a `Readable<Entity>` — `$store._data`
reads through the live reactive proxy and `$store._uuid` exposes the
entity's stable id. Mutations via `entity.$patch(...)` flow through the
adapter's Proxy traps (`set` / `defineProperty` / `deleteProperty`) and
synchronously update the underlying `writable` store, which retriggers
the template.

## API

| Export | Signature | Notes |
|---|---|---|
| `svelteReactiveAdapter` | `ReactiveAdapter` | Pluggable adapter. Pass via `new Entity({ reactive: svelteReactiveAdapter })`. |
| `entityStore` | `<Data extends object>(entity: Entity<Data>) => Readable<Entity<Data>>` | Returns a Svelte-compatible `Readable` whose value is the entity itself. |
| `Readable` | `interface Readable<T> { subscribe(cb: (v: T) => void): () => void }` | Re-exported minimal shape — structurally compatible with `svelte/store`'s `Readable<T>`. |

`ReactiveAdapter` methods (per `@gertsai/entity` SPI):

- `reactive<T extends object>(target): T` — returns a Proxy that updates
  the backing `writable(target)` on mutation. Idempotent: calling
  `reactive` twice on the same object returns the original target
  (already-branded objects are returned as-is).
- `markRaw<T>(value): T` — stamps an internal symbol so `reactive`
  skips wrapping. Escape hatch for non-reactive values.
- `isReactive(value): boolean` — true iff `value` was produced by this
  adapter's `reactive()`.

## Compatibility

| Peer | Supported | Tested |
|---|---|---|
| `@gertsai/entity` | `workspace:^` (≥0.1.0) | per workspace lockfile |
| `svelte` | `>=4.0.0` | `^4.2.0` (devDep) |

`svelte` is **optional**: any consumer that imports `@gertsai/entity-svelte`
without invoking `svelteReactiveAdapter.reactive(...)` (e.g., a
typed-only re-export) does not require it at runtime. The first
`reactive(...)` call eagerly resolves `svelte/store.writable` via
`createRequire(import.meta.url)` so the gate works identically in ESM
and CJS builds (ADR-008 Amendment 1.2.9).

## Security / Caveats

- **Proxy overhead**: every reactive object is wrapped in a `Proxy`.
  Use `svelteReactiveAdapter.markRaw(value)` to opt sub-trees out
  (escape hatch — value is returned untouched on subsequent
  `reactive(...)` calls).
- **Module-private raw marker** (CWE-1321): the raw marker uses a
  module-local `Symbol('raw')` looked up with
  `Object.prototype.hasOwnProperty.call` — `Object.prototype[RAW]`
  pollution does not affect adapter behavior (ADR-008 I-11).
- **WeakMap-backed registry** (CWE-401, CWE-672): the
  target → `writable` store mapping uses `WeakMap` so backing stores
  are eligible for GC once the wrapped object is collected
  (ADR-008 I-12).
- **Three Proxy traps + sync notify + re-entrancy guard**
  (CWE-20, CWE-674, CWE-362): `set` / `defineProperty` /
  `deleteProperty` all notify subscribers synchronously; a per-target
  boolean prevents subscriber-driven mutation from looping forever
  (ADR-008 I-13). The `set` trap uses `Reflect.set(target, key, value)`
  without an external receiver to defeat receiver-injection attacks.
- **No protected-state access** (ADR-008 I-14): the adapter only
  observes mutations through the Proxy returned from `reactive(...)`;
  `entityStore` reaches the data target via the public `entity.$data`
  view rather than the protected `_data` field.

## Cross-references

- [ADR-008 — Framework adapters policy + ReactiveAdapter contract](../../.forgeplan/adrs/ADR-008-framework-adapters-policy-reactiveadapter-contract-wave-5-phase-3.md)
- [PRD-003 — Wave 5 Errors / Runtime Context / Framework Adapters DX foundation](../../.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)
- [`packages/entity/src/types.ts` — `ReactiveAdapter` SPI](../entity/src/types.ts)

## License

Apache-2.0 — see [LICENSE](./LICENSE).
