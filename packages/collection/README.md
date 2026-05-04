# @gerts/collection

A modern, high-performance TypeScript collection library providing mutable, immutable, and persistent data structures with lazy evaluation support.

## Features

- **Multiple Collection Types**: Mutable, Immutable, and Persistent collections
- **Specialized Collections**: BiMap, MultiMap, OrderedMap, WeakCollection
- **Lazy Evaluation**: Seq for efficient chained operations
- **Structural Sharing**: Persistent data structures with HAMT (Hash Array Mapped Trie)
- **Composable Operations**: Functional operations (map, filter, reduce, etc.)
- **Mixin-Based Extensibility**: Add capabilities via mixins
- **TypeScript First**: Full type safety with generics
- **Zero Dependencies**: Lightweight with no external dependencies

## Installation

```bash
npm install @gerts/collection
# or
pnpm add @gerts/collection
# or
yarn add @gerts/collection
```

## Quick Start

```typescript
import {
  MutableCollection,
  ImmutableCollection,
  PersistentCollection,
  seq,
  filter,
  map,
} from '@gerts/collection';

// Create a mutable collection
const users = new MutableCollection<string, { name: string; age: number }>([
  ['u1', { name: 'Alice', age: 30 }],
  ['u2', { name: 'Bob', age: 25 }],
]);

// Chainable operations
users
  .set('u3', { name: 'Charlie', age: 35 })
  .delete('u1')
  .filter((user) => user.age >= 30);

// Immutable operations return new instances
const immutable = new ImmutableCollection([
  ['a', 1],
  ['b', 2],
]);
const updated = immutable.set('c', 3); // Returns new instance
console.log(immutable.has('c')); // false
console.log(updated.has('c')); // true

// Lazy evaluation for large datasets
const result = seq(users.entries())
  .filter(([, user]) => user.age >= 18)
  .map(([, user]) => user.name)
  .take(10)
  .toArray();
```

## Table of Contents

- [Core Collections](#core-collections)
  - [MutableCollection](#mutablecollection)
  - [ImmutableCollection](#immutablecollection)
  - [PersistentCollection](#persistentcollection)
  - [PersistentMap](#persistentmap)
- [Specialized Collections](#specialized-collections)
  - [BiMap](#bimap)
  - [MultiMap](#multimap)
  - [OrderedMap](#orderedmap)
  - [WeakCollection](#weakcollection)
- [Lazy Evaluation](#lazy-evaluation)
  - [Seq](#seq)
- [Operations](#operations)
  - [Search Operations](#search-operations)
  - [Transform Operations](#transform-operations)
  - [Aggregate Operations](#aggregate-operations)
  - [Set Operations](#set-operations)
- [Mixins](#mixins)
  - [withExtendedOps](#withextendedops)
  - [withBatchOps](#withbatchops)
  - [withDeepOps](#withdeepops)
  - [withPositionalAccess](#withpositionalaccess)
- [Utilities](#utilities)
  - [Memoization](#memoization)
  - [LRUCache](#lrucache)
- [Type Safety](#type-safety)
  - [Type Guards](#type-guards)
  - [Assertion Functions](#assertion-functions)
  - [Branded Types](#branded-types)
  - [Template Literal Types](#template-literal-types)
  - [Utility Types](#utility-types)
  - [Error Classes](#error-classes)
- [Performance](#performance)
- [Comparison with Native Collections](#comparison-with-native-collections)

---

## Core Collections

### MutableCollection

A mutable key-value collection that allows in-place modifications. Provides chainable operations for fluent API usage.

```typescript
import { MutableCollection } from '@gerts/collection';

const collection = new MutableCollection<string, number>();

// Basic operations
collection.set('a', 1);
collection.set('b', 2);
collection.get('a'); // 1
collection.has('a'); // true
collection.delete('a'); // true
collection.size; // 1
collection.clear();

// Chainable operations
collection.set('x', 10).set('y', 20).set('z', 30);

// From entries
const fromEntries = MutableCollection.from([
  ['a', 1],
  ['b', 2],
]);
const fromArgs = MutableCollection.of(['a', 1], ['b', 2]);
const empty = MutableCollection.empty<string, number>();

// Batch operations
collection.setMany([
  ['a', 1],
  ['b', 2],
  ['c', 3],
]);
collection.deleteMany(['a', 'b']);

// Update with function
collection.update('counter', (val) => (val ?? 0) + 1);

// Iteration
for (const [key, value] of collection) {
  console.log(key, value);
}

// Set operations
const other = new MutableCollection([
  ['b', 2],
  ['c', 3],
]);
collection.union(other);
collection.intersection(other);
collection.difference(other);
collection.symmetricDifference(other);

// Sorting (in-place)
collection.sort((a, b) => a[1] - b[1]);
collection.sortByValue((a, b) => a - b);
collection.reverse();

// Filtering and mapping
const filtered = collection.filter((v) => v > 10);
const mapped = collection.mapValues((v) => v * 2);
const keysMapped = collection.mapKeys((k) => k.toUpperCase());

// Grouping
const grouped = MutableCollection.groupBy(users, (u) => u.department);
const combined = MutableCollection.combineEntries(entries, (a, b) => a + b);
```

**Key Methods:**

| Method              | Description         | Complexity |
| ------------------- | ------------------- | ---------- |
| `get(key)`          | Get value by key    | O(1)       |
| `set(key, value)`   | Set key-value pair  | O(1)       |
| `has(key)`          | Check if key exists | O(1)       |
| `delete(key)`       | Remove key          | O(1)       |
| `clear()`           | Remove all entries  | O(1)       |
| `filter(predicate)` | Filter entries      | O(n)       |
| `mapValues(fn)`     | Transform values    | O(n)       |
| `union(other)`      | Combine collections | O(n+m)     |
| `sort(compareFn)`   | Sort entries        | O(n log n) |

### ImmutableCollection

An immutable collection where all modification operations return new instances. Optimized to return the same instance when operations result in no changes.

```typescript
import { ImmutableCollection, IS_IMMUTABLE } from '@gerts/collection';

const original = new ImmutableCollection([
  ['a', 1],
  ['b', 2],
]);

// All modifications return new instances
const updated = original.set('c', 3);
const deleted = updated.delete('a');
const cleared = deleted.clear();

// Original unchanged
console.log(original.has('c')); // false
console.log(updated.has('c')); // true

// Returns same instance if no change (structural sharing)
const same = original.set('a', 1); // Same value
console.log(same === original); // true

// Check if immutable
ImmutableCollection.isImmutable(original); // true
original[IS_IMMUTABLE]; // true
original.isImmutable; // true

// Merge multiple collections
const defaults = ImmutableCollection.from([['theme', 'light']]);
const userPrefs = ImmutableCollection.from([['theme', 'dark']]);
const merged = defaults.merge(userPrefs);

// Batch mutations for efficiency
const result = original.withMutations((mutable) => {
  mutable.set('x', 10);
  mutable.set('y', 20);
  mutable.delete('a');
});

// Clone returns same instance (immutable!)
original.clone() === original; // true
```

**Structural Sharing:**

When possible, ImmutableCollection returns the same instance to avoid unnecessary allocations:

```typescript
const coll = new ImmutableCollection([['a', 1]]);

// These return the same instance:
coll.set('a', 1); // Same value
coll.delete('nonexistent'); // Key doesn't exist
coll.filter(() => true); // All pass
coll.clear().clear(); // Already empty
```

### PersistentCollection

A collection backed by a Hash Array Mapped Trie (HAMT) for efficient structural sharing. Best for scenarios with frequent updates where you need to retain previous versions.

```typescript
import { PersistentCollection } from '@gerts/collection';

const v1 = PersistentCollection.from([
  ['a', 1],
  ['b', 2],
]);
const v2 = v1.set('c', 3); // Shares structure with v1
const v3 = v2.delete('a'); // Shares structure with v2

// All versions remain valid and independent
console.log(v1.size); // 2
console.log(v2.size); // 3
console.log(v3.size); // 2

// Clone is free (returns same instance)
const clone = v1.clone();
console.log(clone === v1); // true
```

**When to Use:**

- Version history / undo-redo functionality
- Concurrent access without locks
- Functional programming patterns
- Large collections with frequent small updates

### PersistentMap

The underlying HAMT implementation used by PersistentCollection. Provides structural sharing for efficient immutable updates.

```typescript
import { PersistentMap } from '@gerts/collection';

const map = new PersistentMap<string, number>();
const map2 = map.set('a', 1);
const map3 = map2.set('b', 2);

// O(log32 n) operations
map3.get('a'); // 1
map3.has('b'); // true
map3.size; // 2

// Lazy iteration
for (const [key, value] of map3.entries()) {
  console.log(key, value);
}

// Create from regular Map
const fromMap = PersistentMap.fromMap(new Map([['x', 10]]));

// Convert to mutable for batch operations
const mutable = map3.asMutable();
```

---

## Specialized Collections

### BiMap

Bidirectional map maintaining one-to-one correspondence between keys and values. Supports O(1) lookup in both directions.

```typescript
import { BiMap } from '@gerts/collection';

const bimap = new BiMap<string, number>();

// Forward and reverse mapping
bimap.set('one', 1);
bimap.set('two', 2);
bimap.set('three', 3);

// Forward lookup (key -> value)
bimap.get('one'); // 1

// Reverse lookup (value -> key)
bimap.getKey(1); // 'one'

// Both keys and values must be unique
bimap.set('uno', 1); // Removes 'one' -> 1 mapping
bimap.getKey(1); // 'uno'
bimap.has('one'); // false

// Check value existence
bimap.hasValue(2); // true

// Invert the map
const inverted = bimap.invert();
inverted.get(2); // 'two'
inverted.getKey('two'); // 2

// Delete by value
bimap.deleteValue(2);

// Get unique values as Set
const values = bimap.uniqueValues(); // Set<number>

// Consistency check (for debugging)
bimap.isConsistent(); // true

// Batch operations preserve bidirectional invariants
bimap.update('one', () => 10);
bimap.deleteMany(['two']);
bimap.mergeInPlace(new BiMap([['four', 4]]));
```

**Use Cases:**

- Two-way lookups (e.g., user ID <-> username)
- Encoding/decoding mappings
- Database primary key <-> natural key relationships
- Bijective mappings

### MultiMap

Map allowing multiple values per key. Values can be stored in arrays (allowing duplicates) or sets (unique only).

```typescript
import { MultiMap } from '@gerts/collection';

// Default: allows duplicate values
const mm = new MultiMap<string, number>();
mm.add('colors', 1);
mm.add('colors', 2);
mm.add('colors', 1); // Duplicate allowed
mm.getAll('colors'); // [1, 2, 1]

// Unique values only
const uniqueMM = new MultiMap<string, number>(undefined, {
  allowDuplicates: false,
});
uniqueMM.add('tags', 'js');
uniqueMM.add('tags', 'ts');
uniqueMM.add('tags', 'js'); // Ignored (duplicate)
uniqueMM.getAll('tags'); // ['js', 'ts']

// Check specific value
mm.hasValue('colors', 1); // true

// Get first value
mm.getFirst('colors'); // 1

// Remove specific value
mm.removeValue('colors', 1); // Removes first occurrence

// Count values
mm.countValues('colors'); // 2
mm.totalValues; // Total across all keys

// Iterate flattened
for (const [key, value] of mm.entriesFlat()) {
  console.log(key, value);
}

// Iterate all values
for (const value of mm.valuesFlat()) {
  console.log(value);
}

// Group by classifier
const grouped = mm.groupValuesByClassifier((v) => (v % 2 === 0 ? 'even' : 'odd'));

// Batch operations normalize values and keep totalValues accurate
mm.setMany([
  ['colors', [1, 2, 2]],
  ['sizes', 3],
]);
mm.mergeInPlace(new MultiMap([['colors', [4, 5]]]));
```

**Use Cases:**

- One-to-many relationships
- Tag systems
- Event listeners by event type
- Indexing by multiple attributes

### OrderedMap

Map maintaining insertion order with O(1) access. Supports positional operations and reordering.

```typescript
import { OrderedMap } from '@gerts/collection';

const map = new OrderedMap<string, number>();
map.set('first', 1);
map.set('second', 2);
map.set('third', 3);

// Iteration preserves insertion order
for (const [key, value] of map) {
  console.log(key, value); // first 1, second 2, third 3
}

// Positional access
map.entryAt(0); // ['first', 1]
map.entryAt(-1); // ['third', 3] (negative index)
map.indexOf('second'); // 1

// Get first/last
map.getFirstKey(); // 'first'
map.getLastKey(); // 'third'
map.getFirstValue(); // 1
map.getLastValue(); // 3

// Stack/queue operations
map.shift(); // Remove and return first: ['first', 1]
map.pop(); // Remove and return last: ['third', 3]
map.unshift('zero', 0); // Add to beginning

// Reordering (O(1))
map.moveToFront('second');
map.moveToBack('first');
map.moveBefore('third', 'second');
map.moveAfter('first', 'second');

// Insert at position
map.insertBefore('second', 'newKey', 100);
map.insertAfter('second', 'anotherKey', 200);

// Remove at index
map.removeAt(0);

// Reverse iteration
for (const [key, value] of map.entriesReverse()) {
  console.log(key, value);
}

// Reorder by comparator
map.reorder(([, a], [, b]) => a - b);

// Trim to size (keeps first n entries)
map.trimTo(5);

// Consistency check
map.isConsistent(); // true

// Batch operations preserve ordering invariants
map.setMany([['fourth', 4]]);
map.mergeInPlace(new OrderedMap([['second', 20]]));
map.deleteMany(['first']);
```

**Use Cases:**

- LRU cache implementation
- Ordered configuration
- History/undo stacks
- Priority queues with ordering

### WeakCollection

Collection using weak references allowing garbage collection of keys. Includes WeakBiMap and WeakValueMap variants.

```typescript
import { WeakCollection, WeakBiMap, WeakValueMap } from '@gerts/collection';

// WeakCollection: weak keys, strong values
const cache = new WeakCollection<object, string>();
const key = { id: 1 };
cache.set(key, 'cached data');
cache.get(key); // 'cached data'

// Compute if absent
cache.getOrCompute({ id: 2 }, (k) => `computed for ${k.id}`);

// Metadata support
cache.setMetadata(key, { expires: Date.now() + 60000 });
cache.getMetadata(key);

// Set with cleanup callback (best-effort)
// Callback runs only if the key is still observable via WeakRef at GC time.
cache.setWithCallback(key, 'value', (k) => {
  console.log('Key was garbage collected');
});

// Best-effort iteration (requires WeakRef support)
for (const k of cache.keys()) {
  console.log(cache.get(k));
}

// WeakBiMap: both keys and values are weak references
const biCache = new WeakBiMap<object, object>();
const objA = { name: 'A' };
const objB = { name: 'B' };
biCache.set(objA, objB);
biCache.get(objA); // objB
biCache.getKey(objB); // objA

// WeakValueMap: strong keys, weak values
const weakValues = new WeakValueMap<string, object>();
weakValues.set('user', { name: 'Alice' });
weakValues.get('user'); // { name: 'Alice' } or undefined if GC'd
weakValues.size; // Count of live values
```

**Use Cases:**

- Caches without memory leaks
- DOM element to data associations
- Object metadata storage
- Temporary associations

---

## Lazy Evaluation

### Seq

Lazy sequence for efficient chained operations. Operations are not executed until a terminal operation is called.

```typescript
import { seq, cachedSeq, Seq } from '@gerts/collection';

// Create from any iterable
const s = seq([
  ['a', 1],
  ['b', 2],
  ['c', 3],
  ['d', 4],
  ['e', 5],
]);

// Create from collection
const fromColl = Seq.fromCollection(myCollection);

// Chain operations (lazy - not executed yet)
const result = s
  .filter(([, v]) => v > 2)
  .map(([k, v]) => [k, v * 10])
  .skip(1)
  .take(2);

// Terminal operations (triggers execution)
result.toArray(); // [40, 50]
result.toCollection(); // MutableCollection
result.count(); // 2
result.first(); // 40
result.reduce((acc, v) => acc + v, 0); // 90

// Short-circuit operations
result.some(([, v]) => v > 35); // true (stops at first match)
result.every(([, v]) => v > 25); // true
result.find(([, v]) => v === 40); // 40

// Caching for repeated iteration
const cached = cachedSeq(expensiveIterator);
cached.toArray(); // Computes and caches
cached.toArray(); // Returns cached result

// With cache options
const seqWithCache = seq(data, {
  cacheResults: true,
  maxCacheSize: 100,
  shareCache: true,
});

// Enable caching on existing Seq
const withCache = seq(data).withCache(50);

// Force cache population
seqWithCache.cacheResult();

// Invalidate cache when source changes
seqWithCache.invalidateCache();

// Clear global cache
Seq.clearGlobalCache();
```

**Performance Benefits:**

```typescript
// Without Seq: creates intermediate arrays
const arr = largeArray
  .filter((x) => x > 0) // Creates array
  .map((x) => x * 2) // Creates array
  .slice(0, 10); // Creates array

// With Seq: single pass, no intermediate arrays
const result = seq(largeArray.entries())
  .filter(([, x]) => x > 0)
  .map(([k, x]) => [k, x * 2])
  .take(10)
  .toArray();
// Only iterates until 10 matching elements found
```

---

## Operations

Standalone functions that work with any `Iterable<[K, V]>` or `Map<K, V>`.

### Search Operations

```typescript
import { find, findKey, findLast, filter, some, every, take, skip } from '@gerts/collection';

const map = new Map([
  ['a', 1],
  ['b', 2],
  ['c', 3],
]);

// Find first matching value
find(map, (v) => v > 1); // 2
findKey(map, (v) => v > 1); // 'b'
findLast(map, (v) => v > 1); // 3

// Filter entries (returns array)
filter(map, (v) => v > 1); // [['b', 2], ['c', 3]]

// Boolean checks
some(map, (v) => v > 2); // true
every(map, (v) => v > 0); // true

// Pagination (returns iterators)
take(map, 2); // Iterator of first 2
skip(map, 1); // Iterator skipping first 1
```

### Transform Operations

```typescript
import {
  map,
  mapValues,
  mapKeys,
  flatMap,
  reverse,
  sort,
  sortByKey,
  sortByValue,
  chunk,
  zip,
  zipWithIndex,
} from '@gerts/collection';

const data = new Map([
  ['a', 1],
  ['b', 2],
  ['c', 3],
]);

// Map to array
map(data, (v, k) => `${k}=${v}`); // ['a=1', 'b=2', 'c=3']

// Map values (returns Map)
mapValues(data, (v) => v * 2); // Map { a: 2, b: 4, c: 6 }

// Map keys (returns Map)
mapKeys(data, (k) => k.toUpperCase()); // Map { A: 1, B: 2, C: 3 }

// Flat map
flatMap(data, (v) => [v, v * 2]); // [1, 2, 2, 4, 3, 6]

// Sorting
sort(data, ([, a], [, b]) => b - a); // Descending by value
sortByKey(data); // Ascending by key
sortByValue(data, (a, b) => b - a); // Descending by value

// Reverse
reverse(data); // Iterator in reverse order

// Chunk into groups
chunk(data, 2); // [[['a', 1], ['b', 2]], [['c', 3]]]

// Zip collections
const other = new Map([
  ['a', 'x'],
  ['b', 'y'],
]);
zip(data, other); // [[1, 'x'], [2, 'y']]

// Zip with index
zipWithIndex(data); // [[[a, 1], 0], [[b, 2], 1], ...]
```

### Aggregate Operations

```typescript
import {
  reduce,
  groupBy,
  sum,
  average,
  min,
  max,
  first,
  last,
  isEmpty,
  count,
  partition,
  frequencies,
} from '@gerts/collection';

const data = new Map([
  ['a', 1],
  ['b', 2],
  ['c', 3],
  ['d', 2],
]);

// Reduce
reduce(data, (acc, v) => acc + v, 0); // 8

// Group by
groupBy(data, (v) => (v % 2 === 0 ? 'even' : 'odd'));
// Map { odd: [[a,1], [c,3]], even: [[b,2], [d,2]] }

// Numeric aggregations
sum(data, (v) => v); // 8
average(data, (v) => v); // 2
min(data, (v) => v); // 1
max(data, (v) => v); // 3

// First/last entry
first(data); // ['a', 1]
last(data); // ['d', 2]

// Checks
isEmpty(data); // false
count(data); // 4
count(data, (v) => v > 1); // 3

// Partition (split by predicate)
partition(data, (v) => v > 1);
// [Map { b: 2, c: 3, d: 2 }, Map { a: 1 }]

// Frequency count
frequencies(data, (v) => v);
// Map { 1: 1, 2: 2, 3: 1 }
```

### Set Operations

```typescript
import {
  union,
  intersection,
  difference,
  symmetricDifference,
  merge,
  mergeWith,
  mergeDeep,
  isSubset,
  isSuperset,
  isDisjoint,
  unique,
  duplicates,
} from '@gerts/collection';

const a = new Map([
  ['a', 1],
  ['b', 2],
]);
const b = new Map([
  ['b', 3],
  ['c', 4],
]);

// Set operations (by key)
union(a, b); // Map { a: 1, b: 3, c: 4 }
intersection(a, b); // Map { b: 2 } (keys in both)
difference(a, b); // Map { a: 1 } (keys only in a)
symmetricDifference(a, b); // Map { a: 1, c: 4 }

// Merge with custom strategy
merge(a, b); // Same as union
mergeWith(a, b, (v1, v2) => v1 + v2); // Map { a: 1, b: 5, c: 4 }

// Deep merge for nested objects
const config1 = new Map([['db', { host: 'localhost', port: 5432 }]]);
const config2 = new Map([['db', { port: 5433 }]]);
mergeDeep(config1, config2);
// Map { db: { host: 'localhost', port: 5433 } }

// Set relationships
isSubset(a, union(a, b)); // true
isSuperset(union(a, b), a); // true
isDisjoint(a, new Map([['x', 1]])); // true

// Unique/duplicate detection
const values = [1, 2, 2, 3, 3, 3];
unique(values); // [1, 2, 3]
duplicates(values); // [2, 3]
```

---

## Mixins

Mixins add functionality to existing collections without modifying their prototypes.

### withExtendedOps

Adds utility operations like sweep, ensure, tap, and concat.

```typescript
import { MutableCollection, withExtendedOps } from '@gerts/collection';

const collection = withExtendedOps(
  new MutableCollection([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]),
  (entries) => new MutableCollection(entries),
);

// Sweep: remove entries matching predicate, return count
const removed = collection.sweep((v) => v > 1);
console.log(removed); // 2 (number of removed entries)

// Ensure: get or create value (lazy initialization)
const arr = collection.ensure('items', () => []);
arr.push('item'); // Safe to use immediately

// Tap: side effects in chain (for debugging)
collection
  .tap((c) => console.log('Size:', c.size))
  .tap((c) => console.log('Keys:', Array.from(c.keys())));

// Concat: combine multiple collections
const merged = collection.concat(otherCollection1, otherCollection2);
```

### withBatchOps

Adds batch mutation support, mutability conversion, and advanced transformations.

```typescript
import { ImmutableCollection, withBatchOps } from '@gerts/collection';

const collection = withBatchOps(
  new ImmutableCollection([
    ['a', 1],
    ['b', 2],
  ]),
  (entries) => new ImmutableCollection(entries),
  true, // isImmutable
);

// Batch mutations (efficient for multiple changes)
const result = collection.withMutations((mutable) => {
  mutable.set('c', 3);
  mutable.set('d', 4);
  mutable.delete('a');
});

// Convert between mutable and immutable
const mutableCopy = collection.asMutable();
const immutable = mutableCopy.asImmutable();

// Convert to Seq
const seq = collection.toSeq();

// Flip keys and values
const flipped = collection.flip(); // Collection { 1: 'a', 2: 'b' }

// Skip/take while predicate
collection.skipWhile((v) => v < 5);
collection.takeWhile((v) => v < 10);

// Group by
const grouped = collection.groupBy((v) => v % 2);
// Map { 0: Collection, 1: Collection }

// Count by
const counts = collection.countBy((v) => v % 2);
// Map { 0: 1, 1: 1 }

// Unique values
collection.unique();
collection.uniqueBy((v) => v.category);
```

### withDeepOps

Adds deep get/set/update/delete and deep merge operations for nested data.

```typescript
import { MutableCollection, withDeepOps } from '@gerts/collection';

const collection = withDeepOps(
  new MutableCollection([['user', { profile: { name: 'Alice', settings: { theme: 'dark' } } }]]),
  (entries) => new MutableCollection(entries),
);

// Deep get
collection.getIn(['user', 'profile', 'name']); // 'Alice'
collection.getIn(['user', 'profile', 'settings', 'theme']); // 'dark'

// Deep has
collection.hasIn(['user', 'profile']); // true
collection.hasIn(['user', 'nonexistent']); // false

// Deep set (returns new collection for immutable)
const updated = collection.setIn(['user', 'profile', 'settings', 'language'], 'en');

// Deep update with function
const incremented = collection.updateIn(['user', 'profile', 'age'], (age) => (age ?? 0) + 1);

// Deep delete
const cleaned = collection.deleteIn(['user', 'profile', 'settings', 'theme']);

// Deep merge
const merged = collection.mergeDeep(
  new Map([['user', { profile: { email: 'alice@example.com' } }]]),
);

// Deep merge with custom merger
collection.mergeDeepWith((existing, incoming, key) => {
  if (key === 'scores') return Math.max(existing, incoming);
  return incoming;
}, otherData);
```

### withPositionalAccess

Adds index-based access methods.

```typescript
import { MutableCollection, withPositionalAccess } from '@gerts/collection';

const collection = withPositionalAccess(
  new MutableCollection([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]),
);

// Access by index (supports negative indices)
collection.at(0); // 1
collection.at(1); // 2
collection.at(-1); // 3 (last element)
collection.at(-2); // 2

// Key by index
collection.keyAt(0); // 'a'
collection.keyAt(-1); // 'c'

// First/last key
collection.firstKey(); // 'a'
collection.lastKey(); // 'c'

// First/last entry
collection.firstEntry(); // ['a', 1]
collection.lastEntry(); // ['c', 3]
```

---

## Utilities

### Memoization

Cache expensive operations to avoid redundant computations.

```typescript
import {
  memoize,
  memoizeCollectionOp,
  memoizeReducer,
  memoizeMethod,
  hashCollection,
} from '@gerts/collection';

// Memoize any function
const expensiveCalc = memoize(
  (data: Map<string, number>) => {
    // Expensive computation
    return Array.from(data.values()).reduce((a, b) => a + b, 0);
  },
  {
    maxSize: 50, // Cache 50 results
    ttl: 5000, // 5 second TTL
  },
);

// Usage
expensiveCalc(myMap); // Computed
expensiveCalc(myMap); // Cached
expensiveCalc.clearCache(); // Clear cache
expensiveCalc.getCacheSize(); // Check cache size

// Memoize collection-specific operations (uses WeakMap)
const memoizedFilter = memoizeCollectionOp((collection, minValue) =>
  collection.filter((v) => v > minValue),
);

// Cached per collection instance
memoizedFilter(myCollection, 10);
memoizedFilter(myCollection, 10); // Cache hit

// Memoize reducer functions
const memoizedSum = memoizeReducer(
  (acc, val, idx) => acc + val,
  (acc) => String(acc),
);

// Memoize methods with change detection
const cached = memoizeMethod(
  myMethod,
  () => collection.size.toString(), // Change token
);

// Hash collection for caching keys
const hash = hashCollection(collection);
```

### LRUCache

Least Recently Used cache with automatic eviction.

```typescript
import { LRUCache } from '@gerts/collection';

const cache = new LRUCache<string, object>(100); // Max 100 items

// Basic operations
cache.set('user:1', { name: 'Alice' });
cache.get('user:1'); // Moves to most recently used
cache.has('user:1'); // true
cache.delete('user:1');
cache.clear();
cache.size; // Current size

// Pattern: cache with fallback
function getUser(id: string): User {
  let user = cache.get(id);
  if (!user) {
    user = fetchUserFromDB(id);
    cache.set(id, user);
  }
  return user;
}

// Automatic eviction of least recently used
for (let i = 0; i < 200; i++) {
  cache.set(`key${i}`, { i }); // Older entries evicted when full
}
```

---

## Type Safety

This library provides comprehensive TypeScript type safety features including type guards, assertion functions, branded types, and template literal types.

### Type Guards

Type guards are functions that check if a value matches a specific type at runtime:

```typescript
import {
  isReadableCollection,
  isIterable,
  isMap,
  isSet,
  isArray,
  isPlainObject,
  isFunction,
  isDefined,
  isEntry,
  isAsyncIterable,
} from '@gerts/collection';

// Check if value is a collection
if (isReadableCollection(data)) {
  console.log(data.size); // TypeScript knows data is ReadableCollection
}

// Check if value is iterable
if (isIterable(items)) {
  for (const item of items) {
    // ...
  }
}

// Check for null/undefined
if (isDefined(value)) {
  // value is guaranteed non-null/undefined here
}

// Check entry tuple
if (isEntry(pair)) {
  const [key, value] = pair; // TypeScript knows it's [K, V]
}
```

### Assertion Functions

Assertion functions throw errors if validation fails and narrow types via the `asserts` keyword:

```typescript
import {
  assertReadableCollection,
  assertIterable,
  assertMap,
  assertSet,
  assertArray,
  assertPlainObject,
  assertFunction,
  assertDefined,
  assertEntry,
  assertAsyncIterable,
} from '@gerts/collection';

function processCollection(data: unknown) {
  // Throws InvalidArgumentError if not a collection
  assertReadableCollection(data);

  // After assertion, TypeScript knows data is ReadableCollection
  console.log(data.size);
  data.forEach((v, k) => console.log(k, v));
}

// Custom error messages
assertDefined(config, 'Configuration is required');

// Works with generics
assertArray<string>(items);
items.forEach((s) => s.toUpperCase()); // TypeScript knows it's string[]
```

### Branded Types

Branded types provide compile-time safety for primitive values with semantic meaning:

```typescript
import {
  type CacheKey,
  type CollectionId,
  type SeqOperationIndex,
  type HashCode,
  createCacheKey,
  createCollectionId,
  createSeqOperationIndex,
  createHashCode,
} from '@gerts/collection';

// Create branded cache keys
const key: CacheKey = createCacheKey('user:123');

// Can't accidentally pass regular string where CacheKey is expected
function getCached(key: CacheKey): unknown {
  // ...
}

getCached(key); // OK
getCached('raw-string'); // TypeScript Error!

// Collection IDs for tracking
const id: CollectionId = createCollectionId('coll'); // "coll_1704790123456_abc123"

// Hash codes
const hash: HashCode = createHashCode(12345);
```

### Template Literal Types

Type-safe operation names using template literal types:

```typescript
import type {
  OperationNamespace,
  OperationName,
  SearchOperationName,
  TransformOperationName,
  AggregateOperationName,
  SetOperationName,
  CollectionOperationName,
  ExtractNamespace,
  ExtractOperation,
} from '@gerts/collection';

// Operation namespaces: 'search' | 'transform' | 'aggregate' | 'set'
type Namespace = OperationNamespace;

// Create operation names: "search:find", "transform:map", etc.
type FindOp = OperationName<'search', 'find'>; // "search:find"

// All search operations
type AllSearchOps = SearchOperationName;
// "search:find" | "search:findKey" | "search:filter" | ...

// Extract parts from operation name
type NS = ExtractNamespace<'search:find'>; // "search"
type Op = ExtractOperation<'search:find'>; // "find"
```

### Utility Types

Additional utility types for common patterns:

```typescript
import type {
  KeyOf,
  ValueOf,
  EntryOf,
  DeepPartial,
  DeepReadonly,
  RequireFields,
  OptionalFields,
  UnwrapPromise,
  ArrayElement,
  CollectionMethodReturn,
} from '@gerts/collection';

// Extract collection types
type K = KeyOf<MutableCollection<string, number>>; // string
type V = ValueOf<MutableCollection<string, number>>; // number
type E = EntryOf<MutableCollection<string, number>>; // [string, number]

// Make specific fields required/optional
type User = { name?: string; email?: string; age?: number };
type RequiredUser = RequireFields<User, 'name' | 'email'>;
// { name: string; email: string; age?: number }

type FullUser = { name: string; email: string; age: number };
type PartialUser = OptionalFields<FullUser, 'age'>;
// { name: string; email: string; age?: number }

// Deep transformations
type Config = { server: { host: string; port: number } };
type PartialConfig = DeepPartial<Config>;
type FrozenConfig = DeepReadonly<Config>;

// Promise unwrapping
type Result = UnwrapPromise<Promise<string>>; // string

// Array element extraction
type Item = ArrayElement<string[]>; // string
```

### Error Classes

Typed error classes for better error handling:

```typescript
import {
  CollectionError,
  InvalidArgumentError,
  KeyNotFoundError,
  UnsupportedOperationError,
  InvalidPathError,
  IndexOutOfBoundsError,
} from '@gerts/collection';

// Base error
try {
  // ...
} catch (e) {
  if (e instanceof CollectionError) {
    console.error('Collection error:', e.message);
  }
}

// Specific errors with typed properties
try {
  assertDefined(value);
} catch (e) {
  if (e instanceof InvalidArgumentError) {
    console.error(`Invalid ${e.argument}: ${e.reason}`);
  }
}

// Key not found with typed key
try {
  // ...
} catch (e) {
  if (e instanceof KeyNotFoundError) {
    console.error(`Key not found: ${e.key}`);
  }
}

// Path errors for deep operations
try {
  collection.getIn(['a', 'b', 'c']);
} catch (e) {
  if (e instanceof InvalidPathError) {
    console.error(`Invalid path: ${e.path.join('.')}`);
  }
}

// Index errors
try {
  // ...
} catch (e) {
  if (e instanceof IndexOutOfBoundsError) {
    console.error(`Index ${e.index} out of bounds (size: ${e.size})`);
  }
}
```

---

## Performance

### Big-O Complexity

| Operation | MutableCollection | ImmutableCollection | PersistentCollection |
| --------- | ----------------- | ------------------- | -------------------- |
| get       | O(1)              | O(1)                | O(log32 n)           |
| set       | O(1)              | O(n)\*              | O(log32 n)           |
| delete    | O(1)              | O(n)\*              | O(log32 n)           |
| has       | O(1)              | O(1)                | O(log32 n)           |
| size      | O(1)              | O(1)                | O(1)                 |
| iterate   | O(n)              | O(n)                | O(n)                 |
| filter    | O(n)              | O(n)                | O(n)                 |
| clone     | O(n)              | O(1)\*\*            | O(1)\*\*             |

\*ImmutableCollection creates new Map on modification but returns same instance if unchanged.
\*\*Immutable/Persistent collections share structure.

| Specialized    | get  | set  | delete | getKey (BiMap) | entryAt (OrderedMap) |
| -------------- | ---- | ---- | ------ | -------------- | -------------------- |
| BiMap          | O(1) | O(1) | O(1)   | O(1)           | -                    |
| MultiMap       | O(1) | O(1) | O(1)   | -              | -                    |
| OrderedMap     | O(1) | O(1) | O(1)   | O(n)           | O(n)                 |
| WeakCollection | O(1) | O(1) | O(1)   | -              | -                    |

### Memory Usage

- **MutableCollection**: Single Map, minimal overhead
- **ImmutableCollection**: New Map per modification (GC-friendly)
- **PersistentCollection**: Shares structure, ~32 bytes per modified node
- **Seq**: Constant memory during iteration (lazy evaluation)

### Benchmarks

```
Operation: Create 10,000 entries
  MutableCollection:    ~5ms
  ImmutableCollection:  ~8ms
  PersistentCollection: ~15ms
  Native Map:           ~3ms

Operation: 1,000 random updates
  MutableCollection:    ~2ms
  ImmutableCollection:  ~50ms (full copy each time)
  PersistentCollection: ~8ms (structural sharing)

Operation: Filter 10,000 entries (first 100)
  Array + filter:       ~3ms (processes all)
  Seq (lazy):           ~0.5ms (stops early)
```

---

## Comparison with Native Collections

| Feature               | Map/Set      | @gerts/collection               |
| --------------------- | ------------ | ------------------------------- |
| Immutability          | No           | Yes (ImmutableCollection)       |
| Structural Sharing    | No           | Yes (PersistentCollection)      |
| Lazy Evaluation       | No           | Yes (Seq)                       |
| Bidirectional Lookup  | No           | Yes (BiMap)                     |
| Multi-value per Key   | No           | Yes (MultiMap)                  |
| Order Manipulation    | No           | Yes (OrderedMap)                |
| Weak Values           | WeakMap only | Yes (WeakValueMap)              |
| Chainable API         | Limited      | Yes                             |
| Type Safety           | Basic        | Full generics                   |
| Functional Operations | forEach only | map, filter, reduce, etc.       |
| Set Operations        | No           | union, intersection, difference |
| Deep Operations       | No           | getIn, setIn, mergeDeep         |

---

## Examples

### Basic Usage

```typescript
import { MutableCollection } from '@gerts/collection';

const inventory = new MutableCollection<string, number>();
inventory.set('apples', 50);
inventory.set('oranges', 30);
inventory.set('bananas', 45);

// Query
const lowStock = inventory.filter((qty) => qty < 40);
const totalItems = inventory.reduce((sum, qty) => sum + qty, 0);

// Update
inventory.update('apples', (qty) => (qty ?? 0) - 10);

// Check
if (inventory.some((qty) => qty === 0)) {
  console.log('Some items out of stock!');
}
```

### Immutable State Management

```typescript
import { ImmutableCollection } from '@gerts/collection';

let state = new ImmutableCollection<string, { count: number }>([
  ['counter1', { count: 0 }],
  ['counter2', { count: 0 }],
]);

function increment(state: typeof state, id: string) {
  return state.update(id, (counter) => ({
    count: (counter?.count ?? 0) + 1,
  }));
}

const state1 = increment(state, 'counter1');
const state2 = increment(state1, 'counter1');

console.log(state.get('counter1')?.count); // 0 (original unchanged)
console.log(state2.get('counter1')?.count); // 2
```

### Lazy Processing Large Datasets

```typescript
import { seq } from '@gerts/collection';

function* generateUsers() {
  for (let i = 0; i < 1000000; i++) {
    yield [`user${i}`, { id: i, score: Math.random() * 100 }] as const;
  }
}

// Only processes until 10 matching elements found
const topScorers = seq(generateUsers())
  .filter(([, user]) => user.score > 90)
  .map(([, user]) => user.id)
  .take(10)
  .toArray();
```

### BiMap for Bidirectional Lookups

```typescript
import { BiMap } from '@gerts/collection';

const userMap = new BiMap<number, string>();
userMap.set(1, 'alice');
userMap.set(2, 'bob');
userMap.set(3, 'charlie');

// Lookup both ways
const username = userMap.get(1); // 'alice'
const userId = userMap.getKey('bob'); // 2

// Handles uniqueness constraints
userMap.set(4, 'alice'); // Removes 1 -> 'alice', adds 4 -> 'alice'
userMap.has(1); // false
userMap.getKey('alice'); // 4
```

### MultiMap for One-to-Many Relations

```typescript
import { MultiMap } from '@gerts/collection';

const taggedItems = new MultiMap<string, number>();
taggedItems.add('javascript', 1);
taggedItems.add('javascript', 2);
taggedItems.add('typescript', 2);
taggedItems.add('typescript', 3);

const jsItems = taggedItems.getAll('javascript'); // [1, 2]
const hasTag = taggedItems.hasValue('typescript', 2); // true

console.log(`Total tagged: ${taggedItems.totalValues}`);
console.log(`JS items: ${taggedItems.countValues('javascript')}`);
```

### Memoization Patterns

```typescript
import { memoize, LRUCache } from '@gerts/collection';

const computeAnalytics = memoize(
  (data: Map<string, number>, startDate: Date, endDate: Date) => {
    // Expensive aggregation...
    return { total: 0, average: 0, trends: [] };
  },
  { maxSize: 50, ttl: 60000 },
);

const result1 = computeAnalytics(data, start, end);
const result2 = computeAnalytics(data, start, end); // Cache hit

// Manual LRU cache
const sessionCache = new LRUCache<string, Session>(1000);

function getSession(id: string): Session {
  let session = sessionCache.get(id);
  if (!session) {
    session = loadSessionFromDB(id);
    sessionCache.set(id, session);
  }
  return session;
}
```

---

## API Reference

### Factory Functions

```typescript
import {
  mutable,
  immutable,
  createCollection,
  createMutableCollection,
  createImmutableCollection,
  createLightweightCollection,
  createLightweightImmutableCollection,
} from '@gerts/collection';

// Shorthand constructors
const m = mutable([['a', 1]]);
const i = immutable([['a', 1]]);

// Factory with options
const coll = createCollection([['a', 1]], {
  /* options */
});

// Specific creators
const mut = createMutableCollection([['a', 1]]);
const imm = createImmutableCollection([['a', 1]]);

// Lightweight (no mixins applied)
const light = createLightweightCollection([['a', 1]]);
const lightImm = createLightweightImmutableCollection([['a', 1]]);
```

### Type Definitions

```typescript
import type {
  ReadableCollection,
  WritableCollection,
  ImmutableOps,
  SearchOps,
  TransformOps,
  AggregateOps,
  SetOps,
  SortOps,
  ConversionOps,
  MergeStrategy,
  Comparator,
  Predicate,
  Mapper,
  Reducer,
  Keep,
} from '@gerts/collection';
```

---

## License

MIT
