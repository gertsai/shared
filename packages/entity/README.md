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

## Usage

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
u.$patch({ name: 'Alice B.' });
```

### Vue adapter (optional)

```ts
import { Entity } from '@gertsai/entity';
import { vueReactiveAdapter } from '@gertsai/entity/vue';

const u = new User({ reactive: vueReactiveAdapter, data: { name: 'A' } });
// u.$data is now wrapped in shallowReactive(), works in Vue templates/computed.
```

## Reactivity adapters for any UI framework

The `ReactiveAdapter` interface has only **3 methods** (`reactive`, `markRaw`,
`isReactive`). You can drop in any framework's reactive layer with ~10 LOC.
Below are ready-to-paste snippets for popular ecosystems. Copy them into your
project (no need to wait for an `@gertsai/*` package).

### React (`useSyncExternalStore`)

React doesn't have an "observable wrap" primitive — instead, hook into the
entity's `'patched'` / `'metadata-changed'` events with `useSyncExternalStore`:

```ts
import { useSyncExternalStore } from 'react';
import type { Entity, EntityWithMetadata } from '@gertsai/entity';

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
    () => entity.$data, // also supports server snapshot
    () => entity.$data,
  );
}

// Usage in component:
//   const data = useEntity(user); // re-renders on $patch
```

The `plainReactiveAdapter` (default) is the right choice for React — no
proxy, just plain objects + event-driven re-renders.

### Svelte (writable store wrapper)

```ts
import { readable } from 'svelte/store';
import type { ReactiveAdapter } from '@gertsai/entity';
import type { Entity } from '@gertsai/entity';

// 1) Use plainReactiveAdapter (default).
// 2) Wrap any Entity in a readable store driven by its events:
export function entityStore<E extends Entity<object>>(entity: E) {
  return readable(entity.$data, (set) => {
    const onPatched = () => set(entity.$data);
    entity.on('patched', onPatched);
    entity.on('metadata-changed', onPatched);
    return () => {
      entity.off('patched', onPatched);
      entity.off('metadata-changed', onPatched);
    };
  });
}

// In .svelte: $: data = $entityStore(user);
```

### Solid (`createStore`)

```ts
import { createStore, reconcile } from 'solid-js/store';
import type { ReactiveAdapter } from '@gertsai/entity';

export function makeSolidReactiveAdapter(): ReactiveAdapter {
  const SOLID_RAW = Symbol.for('@gertsai/entity:solid-raw');
  return {
    reactive<T extends object>(target: T): T {
      const [store, setStore] = createStore(target);
      // Re-export setter via Proxy for Object.assign() to flow through:
      return new Proxy(store, {
        set(_, key, value) {
          setStore(reconcile({ ...store, [key]: value }) as T);
          return true;
        },
      }) as T;
    },
    markRaw<T>(value: T): T {
      if (value && typeof value === 'object') {
        (value as Record<symbol, true>)[SOLID_RAW] = true;
      }
      return value;
    },
    isReactive(value: unknown): boolean {
      return !!value && typeof value === 'object' && !((value as Record<symbol, unknown>)[SOLID_RAW]);
    },
  };
}
```

### MobX (`observable`)

```ts
import { observable, isObservable } from 'mobx';
import type { ReactiveAdapter } from '@gertsai/entity';

export const mobxReactiveAdapter: ReactiveAdapter = {
  reactive<T extends object>(target: T): T {
    return observable(target, undefined, { deep: false }); // shallow, mirrors shallowReactive
  },
  markRaw<T>(value: T): T {
    return value; // MobX inspects deep:false already
  },
  isReactive(value: unknown): boolean {
    return isObservable(value);
  },
};
```

### Preact signals (`signal` / `effect`)

```ts
import { signal, effect } from '@preact/signals-core';
import type { ReactiveAdapter } from '@gertsai/entity';

// Signals don't wrap objects; instead, use plainReactiveAdapter and connect
// via effect() inside your component:
//
//   effect(() => { renderUserCard(user.$data); });
//   user.on('patched', () => /* trigger signal */);
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

Each will be peer-dep-only, ≤30 LOC, and version-independent from
`@gertsai/entity` core. Track progress under [PRD-002](../../.forgeplan/prds/PRD-002*.md)
+ a future `@gertsai/entity-*` ADR.

## API surface

| Export | Kind | Notes |
|---|---|---|
| `Model` | abstract class | session + lifecycle (`$destroy` emits `'destroyed'`) |
| `Entity<Data>` | abstract class | uid + `$data` + `$patch` (emits `'patched'`) |
| `EntityWithMetadata<Data, Metadata, Typename>` | abstract class | adds `$metadata`, mockup/staled lifecycle, `__typename` |
| `plainReactiveAdapter` | const | default no-op adapter |
| `deepEqual` | function | vendored structural equality |
| `vueReactiveAdapter` (`/vue` subpath) | const | wraps `shallowReactive`/`markRaw`/`isReactive` |
| Types: `Session`, `WithTypename`, `ReactiveAdapter`, `UuidProvider`, `ModelOpts`, `EntityOpts`, `EntityWithMetadataOpts` | type | public contracts |

## Events

| Class | Event | Payload |
|---|---|---|
| `Model` | `destroyed` | — |
| `Entity` | `patched` | `{ partial, data }` |
| `EntityWithMetadata` | `metadata-changed` | `{ partial, metadata }` |
| `EntityWithMetadata` | `saved` | — |
| `EntityWithMetadata` | `staled` | — |
| `EntityWithMetadata` | `refreshed` | — |

## License

Apache 2.0
