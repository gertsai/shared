# @gertsai/entity-vue

Vue 3 `ReactiveAdapter` for [`@gertsai/entity`](../entity) — opt-in
reactivity bridge that delegates to `@vue/runtime-core`'s
`shallowReactive` / `markRaw` / `isReactive`. Per
[ADR-008](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-008-framework-adapters-policy-reactiveadapter-contract-wave-5-phase-3.md)
Decision B + Amendment 1.

The adapter loads `@vue/runtime-core` lazily via `createRequire(import.meta.url)`
so consumers who don't import this package never pay for the peer dep.

## Install

```bash
pnpm add @gertsai/entity-vue @vue/runtime-core
```

`@vue/runtime-core` is declared as a **peer-optional** dependency. If it is
not resolvable when an adapter method is called, the adapter throws:

```
@gertsai/entity-vue requires "@vue/runtime-core" >=3.0.0 as a peer dependency.
Install it with: pnpm add @vue/runtime-core
```

## Quickstart

Pass `vueReactiveAdapter` to `Entity` so its `_data` proxy participates in
Vue's reactivity graph; consume the entity inside a `<script setup>` block as
you would any reactive object.

```ts
// store/user.ts
import { Entity } from '@gertsai/entity';
import { vueReactiveAdapter } from '@gertsai/entity-vue';

interface UserData {
  name: string;
  email: string;
}

export const user = new Entity<UserData>({
  data: { name: 'Ada', email: 'ada@example.com' },
  reactive: vueReactiveAdapter,
});
```

```vue
<!-- components/Profile.vue -->
<script setup lang="ts">
import { user } from '../store/user';
// `user._data` is a Vue shallowReactive proxy — fields trigger re-render.
</script>

<template>
  <h1>{{ user._data.name }}</h1>
  <input v-model="user._data.email" />
</template>
```

## API

| Export | Purpose |
|---|---|
| `vueReactiveAdapter: ReactiveAdapter` | Vue 3 implementation of the `ReactiveAdapter` contract from `@gertsai/entity`. |
| `vueReactiveAdapter.reactive<T>(target)` | Wraps `target` in `shallowReactive(target)`. |
| `vueReactiveAdapter.markRaw<T>(value)` | Marks `value` so it's never wrapped in a reactive proxy. |
| `vueReactiveAdapter.isReactive(value)` | Returns `true` iff `value` is a Vue reactive proxy. |

## Compatibility

| Peer | Supported | Tested |
|---|---|---|
| `@gertsai/entity` | `workspace:^` | matches monorepo version |
| `@vue/runtime-core` | `>=3.0.0` | `^3.0.0` (see `pnpm-lock.yaml`) |

Node `>=22` (matches `@gertsai/*` baseline). Lazy require uses
`createRequire(import.meta.url)` and works in both ESM and CJS tsup output.

## Security/Caveats

- **Shallow reactivity only.** `vueReactiveAdapter.reactive(target)` calls
  Vue's `shallowReactive`, which proxies only the top-level keys of
  `target`. Nested object mutations (`entity._data.profile.city = '…'`)
  do **not** trigger Vue re-renders unless the nested object is itself
  passed through `reactive()` or wrapped on assignment.
- **No SSR-specific handling.** The adapter assumes a runtime where
  `@vue/runtime-core` is loadable; consumer apps that do SSR should pin
  the same Vue version on both server and client.
- **Module-private state.** `_shallowReactive` / `_markRaw` / `_isReactive`
  are cached after the first successful `loadVue()` call. There is no
  prototype-pollution surface — markers come from Vue's internal symbols,
  not a `Symbol.for(...)` registry. (Compare with the new Sprint 3.8
  Proxy-based adapters, which use module-private `Symbol('raw')` per
  ADR-008 I-11.)

## Migration from `@gertsai/entity/vue` subpath

Sprint 3.4 shipped `vueReactiveAdapter` via `@gertsai/entity/vue` subpath.
Sprint 3.8 (this release) extracts it to a standalone `@gertsai/entity-vue`
package; the subpath now re-exports from this package as a backward-compat
shim per ADR-008 Decision B + I-3.

**Existing imports continue to work without changes**:

```typescript
import { vueReactiveAdapter } from '@gertsai/entity/vue'; // still works
import { vueReactiveAdapter } from '@gertsai/entity-vue'; // new canonical path
```

The `/vue` subpath shim will be removed in v1.0. Migrate at your convenience.

## Cross-references

- [ADR-008 — Framework adapters policy + ReactiveAdapter contract (Wave 5 Phase 3)](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-008-framework-adapters-policy-reactiveadapter-contract-wave-5-phase-3.md)
- [PRD-003 — Wave 5 errors / runtime-context / framework adapters / DX foundation](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md)
- [`@gertsai/entity` — `ReactiveAdapter` contract](../entity/src/types.ts)

## License

Apache-2.0. The `LICENSE` file is a symlink to the repository root.
