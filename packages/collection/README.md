# @orchlab/collection

High-performance TypeScript collection library with mutable/immutable collections, lazy evaluation, and advanced memoization.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./package.json)

## 🚀 Features

- **🔄 Dual Mode Collections** - Both mutable and immutable implementations
- **⚡ Lazy Evaluation** - Process large datasets efficiently with `Seq`
- **💾 Smart Caching** - Built-in memoization and LRU cache
- **🎯 Zero Dependencies** - Pure TypeScript, no external deps
- **🔧 Type Safe** - Full TypeScript support with generics
- **📦 Tree Shakeable** - Import only what you need
- **⚙️ Optimized** - Structural sharing, no unnecessary copies

## 📦 Installation

```bash
npm install @orchlab/collection
# or
yarn add @orchlab/collection
# or
pnpm add @orchlab/collection
```

## 🎯 Quick Start

```typescript
import {
  MutableCollection,
  ImmutableCollection,
  Seq,
} from '@orchlab/collection';

// Mutable collection - modifies in place
const users = new MutableCollection([
  ['u1', { name: 'Alice', age: 30 }],
  ['u2', { name: 'Bob', age: 25 }],
]);

users.set('u3', { name: 'Charlie', age: 35 });
const adults = users.filter((user) => user.age >= 30);

// Immutable collection - returns new instances
const config = new ImmutableCollection([
  ['api_url', 'https://api.example.com'],
  ['timeout', 5000],
]);

const newConfig = config.set('debug', true); // Original unchanged

// Lazy sequences - process on demand
const result = new Seq(largeDataset)
  .filter((x) => x > 100)
  .map((x) => x * 2)
  .take(10)
  .toArray();
```

## 📚 Core Concepts

### MutableCollection

In-place modifications for performance-critical code:

```typescript
const collection = new MutableCollection<string, number>();

// Basic operations
collection.set('a', 1);
collection.set('b', 2);
collection.delete('a');
collection.clear();

// Transformations (return new collections)
const doubled = collection.mapValues((v) => v * 2);
const filtered = collection.filter((v) => v > 10);
const keys = collection.mapKeys((k) => k.toUpperCase());

// Set operations
const other = new MutableCollection([
  ['c', 3],
  ['d', 4],
]);
const union = collection.union(other);
const intersection = collection.intersection(other);
const difference = collection.difference(other);

// Sorting
collection.sort(); // By key
collection.sortByValue(); // By value
collection.reverse();

// Grouping
const users = [
  { name: 'Alice', dept: 'Eng' },
  { name: 'Bob', dept: 'Sales' },
];
const byDept = MutableCollection.groupBy(users, (u) => u.dept);
```

### ImmutableCollection

Persistent data structures with structural sharing:

```typescript
const original = new ImmutableCollection([
  ['a', 1],
  ['b', 2],
]);

// All operations return new instances
const updated = original.set('c', 3);
console.log(original.has('c')); // false
console.log(updated.has('c')); // true

// Optimized: returns same instance if no change
const same = original.set('a', 1); // Same value
console.log(same === original); // true!

// Batch mutations efficiently
const batch = original.withMutations((mutable) => {
  mutable.set('c', 3);
  mutable.set('d', 4);
  mutable.delete('a');
}); // Single new collection created
```

### Seq - Lazy Evaluation

Process large datasets without creating intermediate collections:

```typescript
const largeData = new MutableCollection(millionItems);

// Operations are lazy - nothing happens yet
const processed = new Seq(largeData)
  .filter((item) => item.isActive)
  .map((item) => item.value * 2)
  .skip(1000)
  .take(100);

// Execution happens only when you iterate
const results = processed.toArray(); // Now it runs!

// Cached sequences for multiple iterations
import { cachedSeq } from '@orchlab/collection';

const cached = cachedSeq(data)
  .filter((x) => x > 0)
  .map((x) => x * 2);

Array.from(cached); // Computes and caches
Array.from(cached); // Uses cache - no recomputation!
```

### Specialized Collections

Beyond the core collections, the library provides specialized data structures for specific use cases.

#### OrderedMap

Maintains insertion order and allows for efficient reordering and positional access. It's ideal for implementing LRU caches or managing UI element lists.

```typescript
import { OrderedMap } from '@orchlab/collection';

const ordered = new OrderedMap([
  ['a', 1],
  ['b', 2],
  ['c', 3],
]);

ordered.moveToFront('c');
// Order is now: c, a, b

ordered.moveAfter('a', 'c');
// Order is now: a, c, b

console.log(ordered.at(1)); // 3 (value at index 1)
```

### Array-returning transforms

When you need arrays (not collections) explicitly:

```typescript
// Always returns an array of results
const arr1 = collection.mapArray((v, k, i) => `${k}:${v}`);

// Maps and flattens, always returns an array
const arr2 = collection.flatMapArray((v) => [v, v * 2]);
```

### Lazy iterators (no allocations)

Use lazy variants to avoid intermediate arrays/collections:

```typescript
// Lazily filter entries
for (const [k, v] of collection.filterIter((v) => v > 0)) {
  // process
}

// Lazily take/skip entries
const first10 = Array.from(collection.takeIter(10));
const after100 = Array.from(collection.skipIter(100));
```

#### BiMap

Ensures a one-to-one mapping between keys and values, allowing lookups in both directions (key-to-value and value-to-key) in O(1) time.

```typescript
import { BiMap } from '@orchlab/collection';

const users = new BiMap([
  ['user1', 'Alice'],
  ['user2', 'Bob'],
]);

console.log(users.get('user1')); // 'Alice'
console.log(users.getKey('Alice')); // 'user1'

// Values must be unique. This will remove the mapping for 'user1'.
users.set('user3', 'Alice');
console.log(users.has('user1')); // false
```

#### MultiMap

Allows a single key to map to multiple values, stored in a collection (Array or Set).

```typescript
import { MultiMap } from '@orchlab/collection';

// By default, allows duplicates (uses an array)
const tags = new MultiMap([
  ['post1', 'typescript'],
  ['post1', 'performance'],
  ['post2', 'typescript'],
]);

console.log(tags.getAll('post1')); // ['typescript', 'performance']

// Configure to store unique values (uses a Set)
const uniqueTags = new MultiMap([], { allowDuplicates: false });
uniqueTags.add('post1', 'ts');
uniqueTags.add('post1', 'ts'); // This duplicate is ignored
console.log(uniqueTags.getAll('post1')); // ['ts']
```

## 🎨 Advanced Features

### Memoization

Cache expensive operations automatically:

```typescript
import { memoize, memoizeCollectionOp } from '@orchlab/collection';

// Memoize any function
const expensiveFn = (n: number) => {
  console.log('Computing...');
  return n * n;
};

const memoized = memoize(expensiveFn);
memoized(5); // Logs: Computing...
memoized(5); // No log - returns cached result

// Memoize collection operations
const processCollection = memoizeCollectionOp((coll: Map<string, number>) => {
  // Expensive computation
  return Array.from(coll.values()).reduce((a, b) => a + b, 0);
});

const map = new Map([
  ['a', 1],
  ['b', 2],
]);
processCollection(map); // Computes
processCollection(map); // Returns cached
```

### Deep Operations

Work with nested data structures:

```typescript
import { createMutableCollection } from '@orchlab/collection';

const nested = createMutableCollection(
  [['user', { profile: { name: 'Alice', age: 30 } }]],
  { withDeep: true },
);

// Deep get
const name = nested.getIn(['user', 'profile', 'name']); // 'Alice'

// Deep set
nested.setIn(['user', 'profile', 'age'], 31);

// Deep update
nested.updateIn(['user', 'profile', 'age'], (age) => age + 1);
```

### Memoized Operations

Pre-memoized versions of common operations:

```typescript
import { memoized } from '@orchlab/collection';

// All operations are memoized
const doubled = memoized.map(collection, (v) => v * 2);
const filtered = memoized.filter(collection, (v) => v > 10);
const sum = memoized.reduce(collection, (a, b) => a + b, 0);

// Create batch of memoized operations
const batch = memoized.createMemoizedBatch([
  (coll) => coll.filter((v) => v > 0),
  (coll) => coll.map((v) => v * 2),
  (coll) => coll.reduce((a, b) => a + b, 0),
]);
```

## 🏗️ Patterns & Best Practices

### Choose the Right Collection

```typescript
// Use MutableCollection when:
// - Performance is critical
// - Working with local data
// - Many in-place updates
const workingSet = new MutableCollection();
workingSet.set('temp', value);
workingSet.delete('old');

// Use ImmutableCollection when:
// - Sharing data between components
// - Need history/undo
// - Concurrent access
const sharedState = new ImmutableCollection();
const newState = sharedState.set('user', userData);
```

### Optimize Large Datasets

```typescript
// ❌ Bad - creates intermediate collections
const result = hugeCollection
  .filter((x) => x > 0) // Creates new collection
  .mapValues((x) => x * 2) // Creates another collection
  .take(10); // Only need 10!

// ✅ Good - lazy evaluation
const result = new Seq(hugeCollection)
  .filter((x) => x > 0)
  .map((x) => x * 2)
  .take(10)
  .toArray();
```

### Batch Updates

```typescript
// ❌ Bad - creates N intermediate collections
let coll = immutable;
for (const [k, v] of items) {
  coll = coll.set(k, v); // New collection each time
}

// ✅ Good - single new collection
const coll = immutable.withMutations((mut) => {
  for (const [k, v] of items) {
    mut.set(k, v);
  }
});
```

### Cache Expensive Operations

```typescript
import { LRUCache } from '@orchlab/collection';

// Manual caching
const cache = new LRUCache<string, Result>(100);

function process(key: string): Result {
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const result = expensiveComputation(key);
  cache.set(key, result);
  return result;
}

// Or use built-in memoization
const processAuto = memoize(expensiveComputation, {
  maxSize: 100,
  ttl: 60000, // 1 minute
});
```

## 📊 Performance

### Benchmarks

Operations on 1000 items (avg ms):

## ⚡ Real-world Performance Benchmarks

Based on 10,000 operations on collections with 10,000 elements:

| Operation     | Native Map  | MutableCollection         | ImmutableCollection | OrderedMap                | BiMap            |
| ------------- | ----------- | ------------------------- | ------------------- | ------------------------- | ---------------- |
| **SET**       | 2.53M ops/s | **2.80M ops/s** (+10.5%)  | 731 ops/s           | 2.15M ops/s (-14.9%)      | -                |
| **GET**       | 8.73M ops/s | **11.47M ops/s** (+31.4%) | -                   | **10.60M ops/s** (+21.4%) | **12.94M ops/s** |
| **Iteration** | 16.4K ops/s | 7.85K ops/s               | -                   | 4.21K ops/s               | -                |
| **Filter**    | -           | 42.4K ops/s               | -                   | -                         | -                |
| **Map**       | -           | 111.8K ops/s              | -                   | -                         | -                |
| **Reduce**    | -           | 164.9K ops/s              | -                   | -                         | -                |

### Specialized Collections Performance:

- **PersistentCollection**: 689K ops/s set operations with structural sharing
- **BiMap**: 12.9M ops/s forward lookup, 12.3M ops/s reverse lookup
- **MultiMap**: 4.5M ops/s add value, 6.0M ops/s getAll values
- **Seq (Lazy)**: Processes only needed elements, comparable to native iteration

Run benchmarks yourself: `npx tsx benchmarks/performance.bench.ts`

### Architecture & Future Improvements

The library is built upon a solid architectural foundation that emphasizes modularity, clean separation of concerns, and performance.

- **Core Principles**: The design follows SOLID principles, favors composition over inheritance, and utilizes pure functions for operations, ensuring a testable and maintainable codebase.
- **Modularity**: The library is divided into a `core` module for base collections, an `operations` module for pure data transformations, `mixins` for code reuse, and `specialized` collections for specific use cases.
- **Flexibility**: It supports both mutable and immutable programming paradigms, allowing developers to choose the best approach for their needs.

Based on a detailed analysis, the following areas have been identified for potential future enhancements:

1.  **Performance Optimizations**:
    - Certain methods within the mixins (`at`, `keyAt`, `findLast`) currently convert iterables to arrays, which can be inefficient for large datasets. These could be optimized to use iterators directly.
    - The `PersistentCollection`'s internal data accessor `[INTERNAL_DATA]` creates a new `Map` on each call, which could be a performance bottleneck in hot paths.

2.  **API Consistency and Clarity**:
    - Methods like `sweep` in `ExtendedOps` perform in-place mutations. Their names could be made more explicit (e.g., `sweepInPlace`) to clearly signal their behavior.
    - The dynamic application of mixins via `Object.defineProperty` is functional but complex. Exploring alternative patterns could simplify the internal workings and improve debuggability.

3.  **Operation Enhancements**:
    - The `flatMap` function in the `operations` module could be generalized to support any `Iterable` as a return type, not just arrays.
    - Aggregate functions like `min` and `max` could be implemented via `reduce` for greater code simplicity and consistency.

These potential improvements are intended to further refine an already robust and well-designed library, focusing on edge-case performance and developer experience.

### Mixins: instance vs prototype

By default, instance-level mixins are used. You can opt into prototype augmentation:

```bash
# Option 1: environment variable
ORCH_COLLECTION_USE_PROTO_MIXINS=1 node app.js

# Option 2: runtime toggle (e.g., before creating collections)
globalThis.__ORCH_COLLECTION_USE_PROTO_MIXINS__ = true;
```

Guidance:

- Prototype mixins tend to be faster for massive creation of many small collections.
- Instance mixins tend to be faster for hot method calls on long-lived collections.
- Default remains OFF; enable only if benchmarks show benefit for your workload.

### Memory Optimization

ImmutableCollection uses structural sharing:

```typescript
const coll1 = new ImmutableCollection(thousandItems);
const coll2 = coll1.set('key', 'value');

// Only the changed node is copied
// 999 items are shared between coll1 and coll2
```

## 🔧 API Reference

### Collection Creation

```typescript
// From entries
const coll = MutableCollection.from([
  ['a', 1],
  ['b', 2],
]);

// From individual entries
const coll = ImmutableCollection.of(['a', 1], ['b', 2]);

// Empty collection
const coll = MutableCollection.empty<string, number>();

// With mixins
import { createMutableCollection } from '@orchlab/collection';

const extended = createMutableCollection(data, {
  withExtended: true, // Additional utilities
  withBatch: true, // Batch operations
  withDeep: true, // Deep get/set
  withPositional: true, // Index-based access
});
```

### Factory Options and Mixins Compatibility

Factory accepts the following options for `createCollection`:

```ts
type CollectionOptions = {
  immutable?: boolean; // default false
  immutableEngine?: 'map' | 'hamt'; // default 'hamt' when immutable=true
  withExtended?: boolean; // ExtendedOps (random, sweep, tap, ensure, ...)
  withBatch?: boolean; // withMutations, groupBy, unique, ...
  withDeep?: boolean; // getIn, setIn, updateIn, mergeDeep, ...
  withPositional?: boolean; // first, last, at, keyAt, ...
  withAll?: boolean; // enable all applicable mixins
};
```

Compatibility matrix:

- Mutable (default): `withExtended`, `withBatch`, `withDeep`, `withPositional`, and `withAll` are supported.
- Immutable with `immutableEngine: 'map'`: supports `withBatch`, `withDeep`, and `withPositional`. ExtendedOps are intentionally disabled.
- Immutable with `immutableEngine: 'hamt'` (Persistent): all mixins are disabled to preserve persistent semantics and minimal surface.

### Notes and deprecations

- Default export object is deprecated. Prefer named exports for better tree-shaking:
  ```ts
  import { MutableCollection, ImmutableCollection } from '@orchlab/collection';
  ```
- ExtendedOps are available only for mutable collections; the flag `withExtended` has no effect for immutable collections (both `map` and `hamt`).

Convenience creators:

```ts
createMutableCollection(entries?) // Mutable with withAll=true (Extended+Batch+Deep+Positional)
createImmutableCollection(entries?) // Immutable(map) with withAll=true (Batch+Deep+Positional)
createLightweightCollection(entries?) // Mutable without mixins
createLightweightImmutableCollection(entries?) // Immutable(map) without mixins
```

#### Mixin Details

- **`withExtended`**: Adds `random`, `randomKey`, `sweep`, `tap`, `ensure`, `hasAll`, `hasAny`, `partition`, `concat`. Available only for **Mutable** collections.
- **`withBatch`**: Adds `withMutations`, `asMutable`, `asImmutable`, `toSeq`, `flip`, `groupBy`, `unique`, and more.
- **`withDeep`**: Adds `getIn`, `setIn`, `updateIn`, `deleteIn`, `mergeDeep`.
- **`withPositional`**: Adds `at` (access by index), `keyAt`, `firstKey`, `lastKey`, `firstEntry`, `lastEntry`.

### Common Methods & Complexity

All collections implement these methods with the following time complexities:

#### Basic Operations

- `get(key)` - Get value by key - **O(1)**
- `set(key, value)` - Set value - **O(1)** amortized
- `has(key)` - Check if key exists - **O(1)**
- `delete(key)` - Remove entry - **O(1)**
- `clear()` - Remove all entries - **O(1)**
- `size` - Number of entries - **O(1)**

#### Iteration

- `keys()` - Iterator of keys - **O(1)** to create, **O(n)** to iterate
- `values()` - Iterator of values - **O(1)** to create, **O(n)** to iterate
- `entries()` - Iterator of [key, value] pairs - **O(1)** to create, **O(n)** to iterate
- `forEach(fn)` - Iterate with callback - **O(n)**

#### Transformations

- `map(fn)` - Transform to array - **O(n)**
- `filter(fn)` - Filter entries - **O(n)**
- `reduce(fn, initial)` - Reduce to single value - **O(n)**
- `mapValues(fn)` - Transform values - **O(n)**
- `mapKeys(fn)` - Transform keys - **O(n)**

#### Search Operations

- `find(fn)` - Find first matching value - **O(n)** worst case
- `some(fn)` - Test if any match - **O(n)** worst case
- `every(fn)` - Test if all match - **O(n)** worst case

#### Set Operations

- `union(other)` - Combine collections - **O(n + m)**
- `intersection(other)` - Common entries - **O(n + m)**
- `difference(other)` - Unique to first - **O(n + m)**
- `symmetricDifference(other)` - XOR - **O(n + m)**

#### Special Collections Complexity

**PersistentCollection (HAMT)**

- `get/set/has/delete` - **O(log₃₂ n)** ≈ **O(1)** for practical sizes
- Structural sharing reduces memory overhead

**OrderedMap**

- Maintains insertion order with **O(1)** access
- `moveToFront/moveToBack` - **O(1)**
- `indexOf(key)` - **O(n)**

**BiMap**

- Bidirectional lookup in **O(1)**
- `getKey(value)` - **O(1)**
- Space complexity: **O(2n)**

**MultiMap**

- Multiple values per key
- `add(key, value)` - **O(1)** amortized
- `getAll(key)` - **O(k)** where k is values for key

### Type Exports

```typescript
import type {
  ReadableCollection,
  WritableCollection,
  ImmutableOps,
  MutableOps,
  TransformOps,
  AggregateOps,
  SearchOps,
  SetOps,
} from '@orchlab/collection';
```

## 📚 Examples

Explore comprehensive examples in the `/examples` directory:

### Basic Usage (`basic-usage.ts`)

- Mutable and Immutable collections
- Lazy sequences with Seq
- Memoization patterns
- Grouping and aggregation
- Performance patterns

```bash
npx tsx examples/basic-usage.ts
```

### Advanced Patterns (`advanced-usage.ts`)

- Real-world data processing pipelines
- State management with history/undo
- Multi-level caching strategies
- Functional composition
- Reactive collections
- Deep operations on nested data
- Stream processing
- Error handling and recovery
- Performance monitoring

```bash
npx tsx examples/advanced-usage.ts
```

### Framework Integration (`framework-integration.ts`)

- React hooks and state management
- Vue.js Composition API
- Redux reducers and selectors
- MobX observable collections
- Express/Node.js session store
- Request caching middleware

```bash
npx tsx examples/framework-integration.ts
```

### Real-World Solutions (`real-world-patterns.ts`)

- Rate limiting & throttling
- Event sourcing & audit logging
- Dependency injection container
- Graph data structures & algorithms
- Task queue & job scheduler

```bash
npx tsx examples/real-world-patterns.ts
```

### Performance Benchmarks (`benchmarks/performance.ts`)

- Collection creation performance
- Operation benchmarks
- Memory optimization tests
- Lazy vs eager evaluation
- Batch operations comparison

```bash
npx tsx benchmarks/performance.ts
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run benchmarks
npm run bench

# Type checking
npm run type-check
```

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please read our [contributing guide](CONTRIBUTING.md).

## 🔗 Links

- [GitHub](https://github.com/orchlab/collection)
- [npm](https://www.npmjs.com/package/@orchlab/collection)
- [Documentation](https://orchlab.github.io/collection)
