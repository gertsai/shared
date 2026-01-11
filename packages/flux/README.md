# @gerts/flux

High-performance library for managing data streams, event-driven collections, and reactive data flows in TypeScript.

## Features

- **FluxilisCollection** - Event-driven collection with TTL support, set operations, and functional programming methods
- **DataStream** - Backpressure-aware data streams with transformation pipelines
- **FluxilisEventEmitter** - Priority-based event handling with async listener support
- **ComponentFactory** - Dependency injection container for adapters
- **Utilities** - debounce, throttle, deepClone, and async helpers
- **Adapters** - Pluggable backends (MapBackend) and serializers (JsonSerializer)

## Installation

```bash
pnpm add @gerts/flux
```

## Quick Start

```typescript
import { FluxilisCollection, DataStream, FluxilisEventEmitter } from '@gerts/flux';

// Create an event-driven collection
const users = new FluxilisCollection<string, User>();

// Listen to changes
users.on('add', (key, user) => {
  console.log(`User added: ${user.name}`);
});

// Add with automatic expiry
users.setWithTTL('session-123', { name: 'Alice' }, 3600000); // 1 hour TTL

// Create a data stream with backpressure
const stream = new DataStream<number>({ highWaterMark: 100 });

stream
  .pipe((n) => n * 2)
  .pipe((n) => n.toString())
  .on('data', (data) => console.log(data));

stream.write(5); // Outputs: "10"
```

## API Reference

### FluxilisCollection

An extended Map-like collection with event emissions, TTL support, and functional programming methods.

#### Constructor

```typescript
const collection = new FluxilisCollection<K, V>(entries?, options?);
```

| Parameter             | Type                                      | Description                                  |
| --------------------- | ----------------------------------------- | -------------------------------------------- |
| `entries`             | `[K, V][]` or `IFluxilisCollection<K, V>` | Initial key-value pairs                      |
| `options.cloneValues` | `boolean`                                 | Clone values on retrieval (default: `false`) |

#### Core Methods

```typescript
// Get and set
collection.set(key, value); // Add or update
collection.get(key); // Get value
collection.get(key, defaultValue); // Get with default
collection.has(key); // Check existence
collection.delete(key); // Delete single
collection.delete([key1, key2]); // Delete multiple
collection.clear(); // Clear all

// Batch operations
collection.setMany([
  [k1, v1],
  [k2, v2],
]);
collection.getMany([key1, key2]);

// Conditional operations
collection.setIfAbsent(key, value); // Set only if key doesn't exist
collection.update(key, value); // Update only if key exists
collection.ensure(key, () => defaultValue); // Get or create
```

#### TTL Support

```typescript
// Auto-expire after 5 seconds
collection.setWithTTL('temp-key', value, 5000);

// Listen for expiration
collection.on('delete', (key, value) => {
  console.log(`${key} expired`);
});
```

#### Event System

```typescript
// Available events: 'add', 'update', 'delete', 'clear'
collection.on('add', (key, value) => {
  /* ... */
});
collection.on('update', (key, value) => {
  /* ... */
});
collection.on('delete', (key, value) => {
  /* ... */
});
collection.on('clear', () => {
  /* ... */
});

// One-time listener
collection.once('add', handler);

// Remove listener
collection.off('add', handler);
```

#### Functional Methods

```typescript
// Transform
const doubled = collection.map((v, k) => v * 2);
const filtered = collection.filter((v, k) => v > 10);
const sum = collection.reduce((acc, v) => acc + v, 0);

// Search
const found = collection.find((v, k) => v.name === 'Alice');
const key = collection.findKey((v, k) => v.active);
const exists = collection.some((v, k) => v.premium);
const allValid = collection.every((v, k) => v.verified);

// Iteration
collection.forEach((v, k) => console.log(k, v));
collection.each((v, k) => process(v)); // Returns this for chaining
```

#### Set Operations

```typescript
const a = new FluxilisCollection([
  ['x', 1],
  ['y', 2],
]);
const b = new FluxilisCollection([
  ['y', 3],
  ['z', 4],
]);

a.union(b); // All keys, b's values override
a.intersection(b); // Keys in both: ['y']
a.difference(b); // Keys only in a: ['x']
a.symmetricDifference(b); // Keys in one but not both: ['x', 'z']
a.merge(b); // Mutates a, adds all from b
```

#### Positional Access

```typescript
collection.first(); // First value
collection.first(3); // First 3 values
collection.last(); // Last value
collection.last(-2); // First 2 values (negative = from start)
collection.at(0); // Value at index 0
collection.at(-1); // Last value
collection.keyAt(2); // Key at index 2
collection.random(); // Random value
collection.random(5); // 5 unique random values
collection.randomKey(); // Random key
```

#### Grouping and Partitioning

```typescript
// Group by category
const grouped = collection.groupBy((v, k) => v.category);
// Returns: Map<Category, FluxilisCollection<K, V>>

// Split into two collections
const [active, inactive] = collection.partition((v) => v.active);
```

#### Utility Methods

```typescript
collection.clone(); // Deep clone
collection.toArray(); // Values as array
collection.keysArray(); // Keys as array
collection.entriesArray(); // [key, value] pairs as array
collection.toObject(); // Convert to plain object
collection.equals(other); // Deep equality check
collection.toString(); // "FluxilisCollection(5)"

// Key checking
collection.hasAll('a', 'b', 'c'); // All keys present?
collection.hasAny('a', 'b', 'c'); // Any key present?

// Bulk removal
collection.sweep((v, k) => v.expired); // Remove matching, returns count
```

---

### DataStream

Backpressure-aware data stream with transformation pipelines.

#### Constructor

```typescript
const stream = new DataStream<T>(options?);
```

| Option          | Type                            | Default  | Description                             |
| --------------- | ------------------------------- | -------- | --------------------------------------- |
| `highWaterMark` | `number`                        | `1000`   | Buffer size before backpressure         |
| `errorMode`     | `'throw' \| 'emit' \| 'ignore'` | `'emit'` | Error handling strategy                 |
| `autoEnd`       | `boolean`                       | `false`  | Auto-end piped streams when source ends |

#### Writing Data

```typescript
const canContinue = stream.write(data);

if (!canContinue) {
  // Backpressure: wait for drain
  stream.once('drain', () => {
    stream.write(moreData);
  });
}
```

#### Transformation Pipelines

```typescript
// Chain transformations
const output = stream
  .pipe((chunk) => chunk.trim()) // Sync transform
  .pipe(async (chunk) => await parse(chunk)) // Async transform
  .pipe((chunk) => chunk.toUpperCase());

// Each pipe returns a new stream
output.on('data', (result) => console.log(result));
```

#### Stream Control

```typescript
stream.pause(); // Pause processing
stream.resume(); // Resume processing
stream.end(); // Signal end of data
stream.close(); // End and cleanup

stream.isPaused(); // Check if paused
stream.isEnded(); // Check if ended
```

#### Events

```typescript
stream.on('data', (chunk) => {
  /* Process data */
});
stream.on('end', () => {
  /* Stream ended */
});
stream.on('error', (err) => {
  /* Handle error */
});
stream.on('drain', () => {
  /* Buffer drained, can write more */
});
stream.on('pause', () => {
  /* Stream paused */
});
stream.on('resume', () => {
  /* Stream resumed */
});
stream.on('close', () => {
  /* Stream closed */
});
```

---

### FluxilisEventEmitter

Priority-based event emitter with async listener support.

#### Constructor

```typescript
const emitter = new FluxilisEventEmitter(options?);
```

| Option           | Type      | Default | Description                                 |
| ---------------- | --------- | ------- | ------------------------------------------- |
| `maxListeners`   | `number`  | `10`    | Max listeners per event (warns if exceeded) |
| `asyncListeners` | `boolean` | `false` | Enable async listener error handling        |

#### Basic Usage

```typescript
// Add listener
emitter.on('event', (arg1, arg2) => {
  console.log(arg1, arg2);
});

// One-time listener
emitter.once('event', handler);

// Remove listener
emitter.off('event', handler);

// Emit event
emitter.emit('event', 'hello', 'world'); // Returns true if had listeners
```

#### Priority-Based Listeners

```typescript
// Higher priority = called first
emitter.on('event', lowPriorityHandler, { priority: 0 });
emitter.on('event', highPriorityHandler, { priority: 10 });
emitter.on('event', mediumPriorityHandler, { priority: 5 });

emitter.emit('event');
// Order: highPriorityHandler -> mediumPriorityHandler -> lowPriorityHandler
```

#### Async Event Emission

```typescript
// Wait for all async listeners to complete
await emitter.emitAsync('event', data);
```

#### Utility Methods

```typescript
emitter.listenerCount('event'); // Number of listeners
emitter.listeners('event'); // Array of listener functions
emitter.eventNames(); // Array of registered event names
emitter.removeAllListeners(); // Remove all listeners
emitter.removeAllListeners('event'); // Remove listeners for specific event
emitter.setMaxListeners(20); // Set max listeners
emitter.getMaxListeners(); // Get max listeners
```

---

### ComponentFactory

Dependency injection container for registering and retrieving adapters.

#### Usage

```typescript
import { ComponentFactory, componentFactory } from '@gerts/flux';

// Use singleton instance
const backend = componentFactory.getBackend('map');
const serializer = componentFactory.getSerializer('json');

// Or create custom factory
const factory = new ComponentFactory();
```

#### Registering Custom Adapters

```typescript
// Register custom backend
factory.registerBackend('redis', RedisBackend);

// Register custom serializer
factory.registerSerializer('msgpack', MsgPackSerializer);

// Register custom event emitter
factory.registerEventEmitter('node', NodeEventEmitter);
```

#### Retrieving Adapters

```typescript
// By name (creates new instance)
const backend = factory.getBackend('map', options);

// Pass existing instance (returned as-is)
const backend = factory.getBackend(existingBackend);

// Default if undefined
const backend = factory.getBackend(undefined); // Uses 'map'
```

---

### Adapters

#### MapBackend

In-memory backend using JavaScript `Map`.

```typescript
import { MapBackend } from '@gerts/flux';

const backend = new MapBackend<string, User>();
await backend.init(collection);

await backend.set('user-1', { name: 'Alice' });
const user = await backend.get('user-1');
await backend.delete('user-1');
await backend.clear();

// Iteration
for await (const [key, value] of backend.entries()) {
  console.log(key, value);
}
```

#### JsonSerializer

JSON serialization adapter.

```typescript
import { JsonSerializer } from '@gerts/flux';

const serializer = new JsonSerializer<User>();

const json = await serializer.serialize({ name: 'Alice', age: 30 });
// '{"name":"Alice","age":30}'

const user = await serializer.deserialize(json);
// { name: 'Alice', age: 30 }
```

---

### Utilities

#### debounce

Delays function execution until after a period of inactivity.

```typescript
import { debounce } from '@gerts/flux';

const search = debounce((query: string) => {
  fetchResults(query);
}, 300);

// Only executes after 300ms of no calls
search('h');
search('he');
search('hel');
search('hello'); // Only this triggers fetchResults
```

#### throttle

Limits function execution to at most once per interval.

```typescript
import { throttle } from '@gerts/flux';

const handleScroll = throttle(() => {
  updatePosition();
}, 100);

// Executes at most every 100ms
window.addEventListener('scroll', handleScroll);
```

#### deepClone

Creates a deep copy of an object.

```typescript
import { deepClone } from '@gerts/flux';

const original = { nested: { value: 1 }, date: new Date() };
const copy = deepClone(original);

copy.nested.value = 2;
console.log(original.nested.value); // Still 1
```

#### createDeferred

Creates a Promise with external resolve/reject controls.

```typescript
import { createDeferred } from '@gerts/flux';

const { promise, resolve, reject } = createDeferred<string>();

// Later...
resolve('done');
// or
reject(new Error('failed'));

const result = await promise;
```

#### safeAsync

Wraps async functions for safe error handling.

```typescript
import { safeAsync } from '@gerts/flux';

const { data, error } = await safeAsync(
  () => fetchData(),
  (err) => console.error('Failed:', err),
);

if (data) {
  processData(data);
}
```

#### isPromise

Type guard for Promise detection.

```typescript
import { isPromise } from '@gerts/flux';

const result = maybeAsync();

if (isPromise(result)) {
  result.then(handle);
} else {
  handle(result);
}
```

#### generateId

Generates unique identifiers.

```typescript
import { generateId } from '@gerts/flux';

const id = generateId(); // "m1a2b3c4d_xyz789"
const userId = generateId('user-'); // "user-m1a2b3c4d_xyz789"
```

---

## Examples

### Real-Time Cache with Auto-Expiry

```typescript
import { FluxilisCollection } from '@gerts/flux';

interface CacheEntry<T> {
  value: T;
  hits: number;
}

class Cache<T> {
  private store = new FluxilisCollection<string, CacheEntry<T>>();

  constructor() {
    this.store.on('delete', (key) => {
      console.log(`Cache entry expired: ${key}`);
    });
  }

  set(key: string, value: T, ttlMs: number = 60000): void {
    this.store.setWithTTL(key, { value, hits: 0 }, ttlMs);
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry) {
      entry.hits++;
      return entry.value;
    }
    return undefined;
  }

  getStats(): { size: number; totalHits: number } {
    return {
      size: this.store.size,
      totalHits: this.store.reduce((sum, e) => sum + e.hits, 0),
    };
  }
}
```

### Data Processing Pipeline with Backpressure

```typescript
import { DataStream } from '@gerts/flux';

interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
}

async function processLogs(entries: LogEntry[]) {
  const stream = new DataStream<LogEntry>({
    highWaterMark: 50,
    errorMode: 'emit',
  });

  // Build transformation pipeline
  const output = stream
    .pipe((entry) => ({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    }))
    .pipe(async (entry) => {
      // Simulate async processing
      await new Promise((r) => setTimeout(r, 10));
      return JSON.stringify(entry);
    });

  // Collect results
  const results: string[] = [];
  output.on('data', (data) => results.push(data as string));

  // Handle backpressure
  for (const entry of entries) {
    const canContinue = stream.write(entry);
    if (!canContinue) {
      await new Promise<void>((resolve) => {
        stream.once('drain', resolve);
      });
    }
  }

  stream.end();

  // Wait for completion
  await new Promise<void>((resolve) => {
    output.on('end', resolve);
  });

  return results;
}
```

### Event-Driven State Management

```typescript
import { FluxilisCollection, FluxilisEventEmitter } from '@gerts/flux';

interface AppState {
  user: User | null;
  settings: Settings;
  notifications: Notification[];
}

class StateManager {
  private state = new FluxilisCollection<keyof AppState, AppState[keyof AppState]>();
  private events = new FluxilisEventEmitter({ asyncListeners: true });

  constructor(initialState: AppState) {
    for (const [key, value] of Object.entries(initialState)) {
      this.state.set(key as keyof AppState, value);
    }

    // Forward collection events to global events
    this.state.on('update', (key, value) => {
      this.events.emit('stateChange', { key, value });
    });
  }

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state.get(key) as AppState[K];
  }

  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state.set(key, value);
  }

  subscribe(listener: (change: { key: string; value: unknown }) => void): () => void {
    this.events.on('stateChange', listener);
    return () => this.events.off('stateChange', listener);
  }
}
```

### Priority Event Handling

```typescript
import { FluxilisEventEmitter } from '@gerts/flux';

const bus = new FluxilisEventEmitter({ maxListeners: 100 });

// Security checks run first (high priority)
bus.on(
  'request',
  async (req) => {
    if (!req.authenticated) {
      throw new Error('Unauthorized');
    }
  },
  { priority: 100 },
);

// Logging runs second
bus.on(
  'request',
  (req) => {
    console.log(`Request: ${req.path}`);
  },
  { priority: 50 },
);

// Business logic runs last
bus.on(
  'request',
  async (req) => {
    return await handleRequest(req);
  },
  { priority: 0 },
);

// Emit and wait for all handlers
await bus.emitAsync('request', { path: '/api/users', authenticated: true });
```

---

## Types

### Key Types

```typescript
// Valid key types for collections
type FluxilisKey = string | number;

// Collection event map
type CollectionEventMap<K, V> = {
  add: (key: K, value: V) => void;
  update: (key: K, value: V) => void;
  delete: (key: K, value: V) => void;
  clear: () => void;
};

// Stream events
type DataStreamEvent = 'data' | 'end' | 'error' | 'drain' | 'close' | 'pause' | 'resume';

// Data stream options
interface DataStreamOptions {
  highWaterMark?: number;
  errorMode?: 'throw' | 'emit' | 'ignore';
  autoEnd?: boolean;
}
```

### Interfaces

```typescript
// Collection interface
interface IFluxilisCollection<K extends FluxilisKey, V> extends Iterable<[K, V]> {
  readonly size: number;
  set(key: K, value: V): this;
  get(key: K): V | undefined;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  // ... and many more methods
}

// Backend interface
interface IBackend<K extends FluxilisKey, V> {
  get(key: K): Promise<V | undefined>;
  set(key: K, value: V): Promise<this>;
  delete(key: K): Promise<boolean>;
  has(key: K): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  keys(): AsyncIterableIterator<K>;
  values(): AsyncIterableIterator<V>;
  entries(): AsyncIterableIterator<[K, V]>;
  init(collection: FluxilisCollection<K, V>): Promise<void>;
}

// Serializer interface
interface ISerializer<T> {
  serialize(data: T): Promise<string | Buffer>;
  deserialize(data: string | Buffer): Promise<T>;
}
```

---

## Integration with @gerts Packages

### With @gerts/core

```typescript
import { FluxilisCollection } from '@gerts/flux';
import { createHook } from '@gerts/core';

// Use FluxilisCollection for hook state management
const stateHook = createHook({
  name: 'state',
  execute: (ctx) => {
    ctx.state = new FluxilisCollection();
    ctx.state.on('update', (key, value) => {
      ctx.emit('stateChanged', { key, value });
    });
  },
});
```

### With @gerts/graph

```typescript
import { FluxilisCollection } from '@gerts/flux';
import { GraphStore } from '@gerts/graph';

// Cache graph query results
const queryCache = new FluxilisCollection<string, QueryResult>();

async function cachedQuery(question: string): Promise<QueryResult> {
  return queryCache.ensure(question, async () => {
    return await graphStore.query(question);
  });
}
```

---

## Performance Considerations

1. **TTL Cleanup**: Each `setWithTTL` creates a timer. For many short-lived entries, consider periodic cleanup instead.

2. **Backpressure**: Always check `write()` return value and wait for `drain` to prevent memory issues.

3. **Clone Values**: Enable `cloneValues` only when needed - it adds overhead for each read operation.

4. **Event Listeners**: Remove listeners when done to prevent memory leaks. Use `once()` for one-time handlers.

5. **Batch Operations**: Use `setMany()` and `getMany()` for bulk operations instead of loops.

---

## When to Use Each Component

| Component                | Best For                                         | Avoid When                           |
| ------------------------ | ------------------------------------------------ | ------------------------------------ |
| **FluxilisCollection**   | In-memory caches, session stores, reactive state | Large datasets requiring persistence |
| **DataStream**           | ETL pipelines, real-time processing, sensor data | Simple one-time transformations      |
| **FluxilisEventEmitter** | Event buses, middleware chains, pub/sub          | Simple callbacks, single listeners   |
| **ComponentFactory**     | Plugin systems, testing with mocks               | Simple applications                  |

---

## Comparison with Similar Libraries

| Feature         | @gerts/flux | discord.js Collection | RxJS                |
| --------------- | ----------- | --------------------- | ------------------- |
| TTL Support     | Yes         | No                    | No (native)         |
| Backpressure    | Yes         | No                    | Yes                 |
| Priority Events | Yes         | No                    | No                  |
| Set Operations  | Yes         | Yes                   | Yes (via operators) |
| Async emit      | Yes         | No                    | Yes                 |
| Bundle Size     | ~15KB       | ~5KB                  | ~50KB               |

---

## License

MIT
