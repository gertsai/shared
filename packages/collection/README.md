<div align="center">

# @gertsai/collection

### Mutable, immutable, and persistent collections for TypeScript

A unified TypeScript collection library covering three semantics under one API:
in-place mutation, copy-on-write immutability, and HAMT-backed persistence with structural sharing.
Lazy `Seq` for chained operations, specialized maps (BiMap, MultiMap, OrderedMap, weak variants), and a tree-shakable functional core.

<br>

[![npm](https://img.shields.io/npm/v/@gertsai/collection?style=flat-square&color=orange)](https://www.npmjs.com/package/@gertsai/collection)
[![License: MIT](https://img.shields.io/badge/license-MIT-000.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178c6?style=flat-square)](https://www.typescriptlang.org/)

</div>

---

## Why @gertsai/collection

- **One mental model, three semantics.** `MutableCollection`, `ImmutableCollection`, and `PersistentCollection` share the same `ReadableCollection` interface — you pick the semantics, not the API.
- **Persistent structures with structural sharing.** Hash Array Mapped Trie (HAMT) backing for O(log32 n) writes that share branches across versions instead of cloning.
- **Lazy `Seq` for big pipelines.** Chained `filter` / `map` / `take` evaluate on demand and stop early — no intermediate arrays.
- **Specialized maps that JS lacks.** Bidirectional, multi-value, order-preserving, and weak-reference variants — typed and consistent.
- **Tree-shakable functional core.** Standalone `search` / `transform` / `aggregate` / `set` modules work on any iterable. Mixins (`withDeepOps`, `withBatchOps`, `withPositionalAccess`) layer extra capabilities only where needed.

## Install

```bash
npm install @gertsai/collection
# or
pnpm add @gertsai/collection
# or
yarn add @gertsai/collection
```

Requires TypeScript 5.3+. Zero runtime dependencies.

## Quickstart

```typescript
import {
  MutableCollection,
  ImmutableCollection,
  PersistentCollection,
  BiMap,
  seq,
} from '@gertsai/collection';

// Mutable: in-place, chainable
const inv = new MutableCollection<string, number>();
inv.set('apples', 50).set('oranges', 30).update('apples', (q) => (q ?? 0) - 10);

// Immutable: every write returns a new instance
const v0 = new ImmutableCollection([['a', 1], ['b', 2]]);
const v1 = v0.set('c', 3);
v0.has('c'); // false  — v0 untouched

// Persistent: structural sharing, cheap versioning
const p0 = new PersistentCollection<string, number>();
const p1 = p0.set('a', 1);
const p2 = p1.set('b', 2); // shares structure with p1

// Bidirectional lookup
const users = new BiMap<number, string>();
users.set(1, 'alice');
users.getKey('alice'); // 1

// Lazy: short-circuits, never materializes the full stream
const top10 = seq(inv.entries())
  .filter(([, qty]) => qty > 0)
  .map(([name]) => name)
  .take(10)
  .toArray();
```

## What you get

| Type | Semantics | Backing | Best for |
|---|---|---|---|
| **MutableCollection** | In-place mutation, chainable | Native `Map` | Hot loops, local state, builders |
| **ImmutableCollection** | Copy-on-write, returns new instance | Native `Map` | Small/medium snapshots, simple immutability |
| **PersistentCollection** | Structural sharing, versioned | HAMT (`PersistentMap`) | Time-travel, undo stacks, large shared state |
| **BiMap** | Bidirectional, unique values | Two `Map`s | Reverse lookups (id ↔ name) |
| **MultiMap** | One key → many values | `Map<K, V[]>` | Tags, indices, one-to-many relations |
| **OrderedMap** | Maintains + reorders insertion order | Linked map | LRU-like access, manual ordering |
| **WeakCollection / WeakBiMap / WeakValueMap** | Weak references | `WeakMap` / `WeakRef` | Caches keyed on objects |
| **Seq** | Lazy, cacheable iterable pipeline | Generator chain | Large/infinite streams, early termination |

## API surface

Imports are flat from the package root; each group is also tree-shakable.

| Group | Exports |
|---|---|
| **Core classes** | `MutableCollection`, `ImmutableCollection`, `PersistentCollection`, `PersistentMap`, `BaseCollection` |
| **Specialized** | `BiMap`, `MultiMap`, `OrderedMap`, `WeakCollection`, `WeakBiMap`, `WeakValueMap` |
| **Lazy** | `Seq`, `seq()`, `cachedSeq()` |
| **Factories** | `mutable()`, `immutable()`, `createCollection()`, `createMutableCollection()`, `createImmutableCollection()`, `createLightweightCollection()` |
| **Mixins** | `withExtendedOps`, `withBatchOps`, `withDeepOps`, `withPositionalAccess` |
| **Search ops** | `find`, `filter`, `some`, `every`, `findKey`, `findLast`, `take`, `skip` |
| **Transform ops** | `map`, `mapValues`, `mapKeys`, `flatMap`, `reverse`, `sort`, `sortByKey`, `sortByValue`, `chunk`, `zip`, `zipWithIndex` |
| **Aggregate ops** | `reduce`, `groupBy`, `sum`, `average`, `min`, `max`, `first`, `last`, `count`, `partition`, `frequencies`, `isEmpty` |
| **Set ops** | `union`, `intersection`, `difference`, `symmetricDifference`, `merge`, `mergeWith`, `mergeDeep`, `isSubset`, `isSuperset`, `isDisjoint`, `unique`, `duplicates` |
| **Memoization** | `memoize`, `memoizeMethod`, `memoizeReducer`, `memoizeCollectionOp`, `LRUCache`, namespace `memoized.*` |
| **Type guards** | `isReadableCollection`, `isIterable`, `isMap`, `isSet`, `isArray`, `isPlainObject`, `isFunction`, `isAsyncIterable`, `isEntry`, `isDefined` (+ matching `assert*` variants) |
| **Errors** | `CollectionError`, `InvalidArgumentError`, `KeyNotFoundError`, `UnsupportedOperationError`, `InvalidPathError`, `IndexOutOfBoundsError` |

Submodule entry points (`@gertsai/collection/operations/*`, `/specialized/*`, `/mixins/*`, `/core/*`) are also published for fine-grained imports.

### A few worked examples

**Lazy pipeline over a generator** — only the first 10 matches are produced.

```typescript
import { seq } from '@gertsai/collection';

function* users() {
  for (let i = 0; i < 1_000_000; i++) yield [`u${i}`, { score: Math.random() * 100 }] as const;
}

const top = seq(users())
  .filter(([, u]) => u.score > 90)
  .take(10)
  .toArray();
```

**Persistent versioning** — keep the old version, share the bytes.

```typescript
import { PersistentCollection } from '@gertsai/collection';

const v0 = new PersistentCollection<string, number>();
const v1 = v0.set('a', 1);
const v2 = v1.set('b', 2);
v0.size; // 0  — branches shared with v1, v2
```

**Mixins** — opt into extra surface only when needed.

```typescript
import { MutableCollection, withDeepOps, withBatchOps } from '@gertsai/collection';

class Store<K, V> extends withBatchOps(withDeepOps(MutableCollection<K, V>)) {}
```

## Performance

| Operation | MutableCollection | ImmutableCollection | PersistentCollection |
|---|---|---|---|
| `get` / `has` | O(1) | O(1) | O(log32 n) |
| `set` / `delete` | O(1) | O(n) (new Map) | O(log32 n) |
| `clone` | O(n) | O(1) (shared) | O(1) (shared) |
| iterate / `filter` | O(n) | O(n) | O(n) |

Specialized maps (`BiMap`, `MultiMap`, `OrderedMap`, `WeakCollection`) are O(1) on `get`/`set`/`delete`; `BiMap.getKey` is O(1), `OrderedMap.entryAt` is O(n).

`Seq` runs in constant memory and short-circuits — filtering 10k entries and taking the first 100 is roughly 6× faster than `Array.filter().slice()` in internal benchmarks. `PersistentCollection` makes 1k random updates ~6× cheaper than `ImmutableCollection` because it avoids full-Map copies.

## Status

`0.1.0` — initial public release. API stable for the documented surface; submodule paths under `core/*`, `mixins/*`, `operations/*`, `specialized/*` may still be reorganized before `1.0`. Tier 1 package: no internal `@gertsai/*` dependencies.

## License

MIT — see [LICENSE](LICENSE).

<br>

<div align="center">
<sub>Part of the <a href="https://github.com/gerts-ai">@gertsai</a> shared toolkit.</sub>
</div>
