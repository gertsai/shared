# @gertsai/entity

Backend-agnostic entity base classes for `@gertsai/*`. Provides `Model`,
`Entity`, and `EntityWithMetadata` with a pluggable reactivity layer.

Mirrors Orchestra's `orchlab/core` entity patterns, with these dependencies
stripped per ADR-005 Decision B:

- No `@vue/runtime-core` import in core (Vue lives in the `/vue` subpath).
- No `xid-ts` hard dep — pluggable `UuidProvider` (defaults to
  `crypto.randomUUID()`).
- No `lodash.isequal` — vendored compact `deepEqual`.
- No Firestore/Firelord references.

## Install

```sh
pnpm add @gertsai/entity
# Optional, only if you want the Vue adapter:
pnpm add @vue/runtime-core
```

## Quickstart

```ts
import { Entity, EntityWithMetadata } from '@gertsai/entity';

interface UserData {
  name: string;
  email: string;
}

class User extends Entity<UserData> {
  $defaultData(): UserData {
    return { name: '', email: '' };
  }
}

const u = new User({ data: { name: 'Alice', email: 'a@example.com' } });
u.on('patched', ({ partial }) => console.log('patched', partial));
const changed = u.$patch({ name: 'Alice B.' }); // returns boolean
```

## Migration from Orchestra `OrchestraEntity`

If you are porting code from Orchestra's `orchlab/core`, the following list
covers every behaviour change. None are silent — all are caught at the type
or test level if you rebuild against `@gertsai/entity`.

| Orchestra | `@gertsai/entity` | Why / Notes |
|---|---|---|
| `'destroy'` event | `'destroyed'` | Past-participle family for consistency (`'patched'`, `'saved'`, `'staled'`, `'refreshed'`, `'metadata-changed'`). |
| `metadata.isMockup` default `false` | `_isMockup` default **`true`** | A fresh `new MyEntity()` is unsaved/optimistic until `$markSaved()`. **Polarity-flipped.** Re-audit any `if (!entity.$isMockup) ...` branch. |
| `$isMockup` (single name) | `$isMockup` + aliases `$isUnsaved`, `$isOptimistic` | Same boolean, three names — pick the one that reads best in your domain. |
| `$patch(partial, check?)` returned `boolean` | `$patch(partial, check = true)` returns `boolean` | Preserved (was lost in the pre-fix Sprint 3.4, restored in 3.4.1). Per-key `deepEqual` gating; emits `'patched'` only on real change. Use `$patch(partial, false)` to force. |
| `$setMetadata(partial)` returned `boolean` | `$setMetadata(partial, check = true)` returns `boolean` | Same pattern as `$patch`. |
| `$markStaled(true \| false)` (single setter) | `$markStaled()` + `$markFresh()` | Two no-arg methods. Idempotent: each emits its event only on transition. |
| `static $generateUid()` | `EntityOpts.uuidProvider` | Defaults to `crypto.randomUUID()`. Pass `() => new Xid().toString()` if you still want xid-ts ids. |
| `OrchestraModel.globalSession` singleton | dropped | Pass `session` explicitly (`new MyEntity({ session })`) or work session-less. |
| `toJSONObject()` returned `EntityJSON` with `updated_at: this._data.updated_at?.toDate?.() ?? new Date()` | `toJSONObject(): EntityJSON<Data>` returns `{ _uid, data }` (and on `EntityWithMetadata`: `{ _uid, data, metadata, __typename }`) | No Firelord `Timestamp.toDate` fallback. If you need a timestamp, put it in `data` yourself. |
| `markRaw(this)` was called automatically in the Entity constructor | preserved | Still called — via the configured `ReactiveAdapter.markRaw(this)`. The Vue adapter routes to `@vue/runtime-core`'s `markRaw`; the default plain adapter sets a Symbol marker. |
| `_uid` could be `string \| (() => string)` | preserved on `EntityOpts.uid` | Function form is re-evaluated on every `_uuid` access. |
| `EntityOptions._uid_path?: string[]` | `EntityOpts.uidPath?: readonly string[]` | Renamed. Read via `entity.$uidPath`. Universal (no Firestore tie). |
| Required `_uid` in opts (constructor threw) | optional — auto-generated via `uuidProvider` | Aligns with library-first OSS use (no upstream id needed for in-memory entities). |

## API surface

| Export | Kind | Notes |
|---|---|---|
| `Model` | abstract class | session + lifecycle (`$destroy` emits `'destroyed'`) |
| `Entity<Data>` | abstract class | uid + `$data` + `$patch` (returns `boolean`, emits `'patched'` only on change) + `$uidPath` + `toJSONObject` / `toJSON` |
| `EntityWithMetadata<Data, Metadata, Typename>` | abstract class | adds `$metadata`, mockup/staled lifecycle, `__typename`, widened `toJSONObject` |
| `plainReactiveAdapter` | const | default no-op adapter (sets a Symbol marker on `markRaw`) |
| `deepEqual` | function | vendored structural equality |
| `vueReactiveAdapter` (`/vue` subpath) | const | wraps `shallowReactive`/`markRaw`/`isReactive` |
| Types: `Session`, `WithTypename`, `ReactiveAdapter`, `UuidProvider`, `ModelOpts`, `EntityOpts`, `EntityWithMetadataOpts`, `EntityJSON`, `EntityWithMetadataJSON` | type | public contracts |

## Events

| Class | Event | Payload | Notes |
|---|---|---|---|
| `Model` | `destroyed` | — | Emitted once by `$destroy()`; idempotent on a second call. |
| `Entity` | `patched` | `{ partial, data }` | **Skipped on no-op** (`$patch` returns `false`, no event). Pass `$patch(partial, false)` to bypass and force emission. |
| `EntityWithMetadata` | `metadata-changed` | `{ partial, metadata }` | **Skipped on no-op** (`$setMetadata` returns `false`, no event). Pass `$setMetadata(partial, false)` to bypass. |
| `EntityWithMetadata` | `saved` | — | Emitted by `$markSaved()` (no idempotency guard — re-emits on each call). |
| `EntityWithMetadata` | `staled` | — | Emitted by `$markStaled()` only on transition `false → true`. |
| `EntityWithMetadata` | `refreshed` | — | Emitted by `$markFresh()` only on transition `true → false`. |

### Vue adapter (optional)

```ts
import { Entity } from '@gertsai/entity';
import { vueReactiveAdapter } from '@gertsai/entity/vue';

const u = new User({ reactive: vueReactiveAdapter, data: { name: 'A' } });
// u.$data is now wrapped in shallowReactive(), works in Vue templates/computed.
// u itself is markRaw'd, so Vue won't recursively wrap the instance when you
// push it into reactive([...]) — instanceof checks keep working.
```

## Reactivity adapters for any UI framework

The `ReactiveAdapter` interface has only **3 methods** (`reactive`, `markRaw`,
`isReactive`). You can drop in any framework's reactive layer with ~10 LOC.
Below are ready-to-paste snippets for popular ecosystems. Copy them into your
project (no need to wait for an `@gertsai/*` package).

### React (`useSyncExternalStore`)

React doesn't have an "observable wrap" primitive. Drive re-renders by
subscribing to the entity's events and returning a fresh snapshot on each
notification. The default `plainReactiveAdapter` is correct here — entity
data is just a plain object that React reads on each render.

```tsx
import { useSyncExternalStore } from 'react';
import type { Entity } from '@gertsai/entity';

/**
 * Subscribes to `'patched'` (and, for EntityWithMetadata, `'metadata-changed'`)
 * and returns a NEW reference on each notification so React's referential
 * equality bail-out fires the re-render.
 */
export function useEntity<E extends Entity<object>>(entity: E) {
  return useSyncExternalStore(
    (cb) => {
      entity.on('patched', cb);
      entity.on('metadata-changed', cb);
      return () => {
        entity.off('patched', cb);
        entity.off('metadata-changed', cb);
      };
    },
    // getSnapshot: clone-on-read so each subscribe-fire produces a NEW ref.
    () => ({ ...entity.$data }),
    // getServerSnapshot
    () => ({ ...entity.$data }),
  );
}

// Usage:
//   const data = useEntity(user); // re-renders on $patch
```

> Why the spread? `useSyncExternalStore` bails out when `getSnapshot`
> returns referentially equal values. With `plainReactiveAdapter` the
> underlying object reference is stable across `$patch`, so we shallow-clone
> to force React to see a new reference whenever an event fires.

### Svelte (writable store wrapper)

```ts
import { readable } from 'svelte/store';
import type { Entity } from '@gertsai/entity';

export function entityStore<E extends Entity<object>>(entity: E) {
  return readable(entity.$data, (set) => {
    const onChange = () => set({ ...entity.$data });
    entity.on('patched', onChange);
    entity.on('metadata-changed', onChange);
    return () => {
      entity.off('patched', onChange);
      entity.off('metadata-changed', onChange);
    };
  });
}

// In .svelte: $: data = $entityStore(user);
```

### Solid (`createStore` + `reconcile`)

```ts
import { createStore, reconcile } from 'solid-js/store';
import type { Entity } from '@gertsai/entity';

export function makeSolidEntity<E extends Entity<object>>(entity: E) {
  const [state, setState] = createStore({ ...entity.$data });
  entity.on('patched', () => {
    setState(reconcile({ ...entity.$data }));
  });
  entity.on('metadata-changed', () => {
    setState(reconcile({ ...entity.$data }));
  });
  return state;
}

// Usage:
//   const data = makeSolidEntity(user);
//   <span>{data.name}</span>
```

`reconcile` keeps Solid's fine-grained reactivity intact (only changed leaves
trigger updates), and we read from `entity.$data` (plain object) inside the
listener.

### MobX (`observable.shallow`)

```ts
import { observable, isObservable } from 'mobx';
import type { ReactiveAdapter } from '@gertsai/entity';

export const mobxReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    // observable.shallow mirrors the semantics of Vue's shallowReactive:
    // only the top-level keys are tracked; nested mutations are NOT
    // automatically observable (matches how Entity._data is meant to be
    // patched at the first level).
    return observable.shallow(target) as T;
  },
  markRaw<T>(value: T): T {
    return value; // shallow tracking already excludes nested objects.
  },
  isReactive(value: unknown): boolean {
    return isObservable(value);
  },
};
```

### Preact signals (`signal` / `effect`)

```ts
import { signal, effect } from '@preact/signals-core';
import type { Entity } from '@gertsai/entity';

// Signals don't wrap objects; instead, use plainReactiveAdapter and bridge
// to a signal you control:
export function entitySignal<E extends Entity<object>>(entity: E) {
  const tick = signal(0);
  entity.on('patched', () => (tick.value = tick.value + 1));
  entity.on('metadata-changed', () => (tick.value = tick.value + 1));
  // Inside an `effect()`, read tick.value AND entity.$data — `effect` will
  // re-run on every patch.
  return { tick, data: () => entity.$data };
}
```

### Nano Stores / Zustand / Valtio / Jotai

All follow the same shape: keep `plainReactiveAdapter` as the entity's
reactive layer, then bridge entity events (`'patched'`, `'metadata-changed'`)
to your store's `set()` / `subscribe()` API. ~5-10 LOC each.

### Roadmap: dedicated framework packages

If you'd rather not vendor the snippet, we plan to extract dedicated
packages in **Wave 5+** based on demand:

- `@gertsai/entity-react`
- `@gertsai/entity-svelte`
- `@gertsai/entity-solid`
- `@gertsai/entity-mobx`
- `@gertsai/entity-preact-signals`

Each will be peer-dep-only, ~30 LOC, and version-independent from
`@gertsai/entity` core. Track progress under [PRD-002](../../.forgeplan/prds/PRD-002*.md)
+ a future `@gertsai/entity-*` ADR.

## Compatibility

`@gertsai/entity` is intentionally minimal — no `crypto-browserify`-style
shims, no polyfills. The hard runtime requirements are:

| Runtime | Minimum | Notes |
|---|---|---|
| Node | **22 LTS recommended**; **19+ minimum** | `crypto.randomUUID()` was added in Node 19; the package imports it via `node:crypto`. Older Node consumers must pass a custom `UuidProvider`. |
| Chrome | **92+** | `crypto.randomUUID()` shipped in Chrome 92 / April 2021. |
| Firefox | **95+** | Shipped December 2021. |
| Safari | **15.4+** | Shipped March 2022. |
| Vue (optional) | **`@vue/runtime-core` ^3.0.0** | Only required if you import `@gertsai/entity/vue`. Declared as `peerDependenciesMeta.optional`. |

For older Node versions or legacy browsers, pass a custom `UuidProvider`:

```ts
import { Entity } from '@gertsai/entity';
import { Xid } from 'xid-ts';

class User extends Entity<{ name: string }> {
  $defaultData() {
    return { name: '' };
  }
}

const u = new User({ uuidProvider: () => new Xid().toString() });
```

The same hook works for ULID, NanoID, snowflake, or any deterministic
in-test stub.

## Troubleshooting / FAQ

### Why is my new entity `$isMockup === true`?

Default polarity in `@gertsai/entity` is `true` — a freshly constructed
entity is considered unsaved/optimistic until you call `$markSaved()`. This
is **inverted** from Orchestra's `OrchestraEntity` (where the default was
`false`). If you ported code that relied on the Orchestra default, audit
any `if (!entity.$isMockup) ...` branches; they will now run for unsaved
entities. Aliases `$isUnsaved` and `$isOptimistic` are exposed for
clarity — they all read the same boolean.

To opt out, construct with `isMockup: false`:

```ts
const u = new User({ isMockup: false, data: serverRow });
```

### React doesn't re-render on `$patch` — what's wrong?

`Entity._data` is a plain object (under `plainReactiveAdapter`); its
reference doesn't change across `$patch`. React's `useSyncExternalStore`
needs a *new* snapshot reference on every notification, so the
recommended pattern is:

```ts
() => ({ ...entity.$data })   // shallow-clone in getSnapshot
```

See the React snippet above for the full hook.

### Vue: my `instanceof MyEntity` check fails inside a `reactive([])` array

It shouldn't — the constructor calls `this._reactive.markRaw(this)` for
exactly this reason. The plain adapter sets a marker symbol; the Vue
adapter calls `@vue/runtime-core`'s `markRaw`. If your check still fails,
verify:

1. You constructed the entity with `reactive: vueReactiveAdapter` (not the
   default plain adapter, whose marker Vue does not honor).
2. You did not manually `reactive(myEntity)` somewhere — that bypasses the
   marker check.

### Can I use this on the server, without any UI framework?

Yes. The default `plainReactiveAdapter` is a no-op pass-through. `Entity`
and `EntityWithMetadata` work without Vue, without Solid, without React,
without anything in the DOM. Events are plain Node `EventEmitter` events.

## License

Apache 2.0
