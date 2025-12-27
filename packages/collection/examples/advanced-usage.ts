/**
 * @orchlab/collection - Advanced Usage Examples
 * Complex real-world scenarios and patterns
 */

import {
  MutableCollection,
  ImmutableCollection,
  Seq,
  cachedSeq,
  memoize,
  memoizeCollectionOp,
  memoizeReducer,
  createMutableCollection,
  createImmutableCollection,
  LRUCache,
  type ReadableCollection,
  type WritableCollection,
} from '../src';

// ============================================
// 1. REAL-WORLD DATA PROCESSING PIPELINE
// ============================================

console.log('\n=== Real-World Data Pipeline ===\n');

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  category: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

// Simulate large dataset
const generateTransactions = (count: number): Transaction[] => {
  const categories = [
    'food',
    'transport',
    'utilities',
    'entertainment',
    'shopping',
  ];
  const statuses: Array<'pending' | 'completed' | 'failed'> = [
    'pending',
    'completed',
    'failed',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `tx_${i}`,
    userId: `user_${Math.floor(i / 100)}`,
    amount: Math.random() * 1000,
    category: categories[Math.floor(Math.random() * categories.length)],
    timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    status: statuses[Math.floor(Math.random() * statuses.length)],
    metadata: i % 10 === 0 ? { flagged: true } : undefined,
  }));
};

const transactions = new MutableCollection(
  generateTransactions(10000).map((tx) => [tx.id, tx] as [string, Transaction]),
);

// Complex analysis pipeline with memoization
const analyzeUserSpending = memoizeCollectionOp(
  (txs: ReadableCollection<string, Transaction>) => {
    const userSpending = new Map<string, Map<string, number>>();

    for (const [, tx] of txs.entries()) {
      if (tx.status !== 'completed') continue;

      if (!userSpending.has(tx.userId)) {
        userSpending.set(tx.userId, new Map());
      }

      const categories = userSpending.get(tx.userId)!;
      categories.set(
        tx.category,
        (categories.get(tx.category) || 0) + tx.amount,
      );
    }

    return userSpending;
  },
);

// Lazy evaluation for large datasets
const flaggedTransactions = new Seq(transactions)
  .filter((tx) => tx.metadata?.flagged === true)
  .filter((tx) => tx.status === 'completed')
  .map((tx) => ({
    ...tx,
    risk_score: tx.amount > 500 ? 'high' : 'medium',
  }))
  .take(10)
  .toArray();

console.log(`Flagged transactions found: ${flaggedTransactions.length}`);

// Batch processing with progress tracking
const processInBatches = <K, V, R>(
  collection: ReadableCollection<K, V>,
  batchSize: number,
  processor: (batch: Map<K, V>) => R[],
): R[] => {
  const results: R[] = [];
  const entries = Array.from(collection.entries());

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = new Map(entries.slice(i, i + batchSize));
    results.push(...processor(batch));

    if (i % (batchSize * 10) === 0) {
      console.log(`Processed ${i}/${entries.length} items...`);
    }
  }

  return results;
};

// ============================================
// 2. STATE MANAGEMENT PATTERN
// ============================================

console.log('\n=== State Management Pattern ===\n');

interface AppState {
  user: {
    id: string;
    name: string;
    preferences: Record<string, any>;
  } | null;
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
    activeModal: string | null;
  };
  data: {
    items: Map<string, any>;
    loading: boolean;
    error: string | null;
  };
}

class StateManager {
  private state: ImmutableCollection<keyof AppState, AppState[keyof AppState]>;
  private listeners: Set<
    (
      state: ImmutableCollection<keyof AppState, AppState[keyof AppState]>,
    ) => void
  >;
  private history: ImmutableCollection<
    keyof AppState,
    AppState[keyof AppState]
  >[];
  private historyIndex: number;

  constructor(initialState: AppState) {
    this.state = new ImmutableCollection(
      Object.entries(initialState) as Array<
        [keyof AppState, AppState[keyof AppState]]
      >,
    );
    this.listeners = new Set();
    this.history = [this.state];
    this.historyIndex = 0;
  }

  getState() {
    return this.state;
  }

  dispatch(action: { type: string; payload?: any }) {
    const newState = this.reducer(this.state, action);

    if (newState !== this.state) {
      this.state = newState;

      // Manage history
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(newState);
      this.historyIndex++;

      // Keep history size limited
      if (this.history.length > 50) {
        this.history.shift();
        this.historyIndex--;
      }

      // Notify listeners
      this.listeners.forEach((listener) => listener(this.state));
    }
  }

  private reducer(
    state: ImmutableCollection<keyof AppState, AppState[keyof AppState]>,
    action: { type: string; payload?: any },
  ): ImmutableCollection<keyof AppState, AppState[keyof AppState]> {
    switch (action.type) {
      case 'SET_USER':
        return state.set('user', action.payload);

      case 'UPDATE_UI':
        const currentUI = state.get('ui') as AppState['ui'];
        return state.set('ui', { ...currentUI, ...action.payload });

      case 'SET_LOADING':
        const currentData = state.get('data') as AppState['data'];
        return state.set('data', { ...currentData, loading: action.payload });

      default:
        return state;
    }
  }

  subscribe(
    listener: (
      state: ImmutableCollection<keyof AppState, AppState[keyof AppState]>,
    ) => void,
  ) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.state = this.history[this.historyIndex];
      this.listeners.forEach((listener) => listener(this.state));
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.state = this.history[this.historyIndex];
      this.listeners.forEach((listener) => listener(this.state));
    }
  }
}

const store = new StateManager({
  user: null,
  ui: { theme: 'light', sidebarOpen: true, activeModal: null },
  data: { items: new Map(), loading: false, error: null },
});

store.subscribe((state) => {
  console.log('State updated:', {
    user: state.get('user'),
    theme: (state.get('ui') as AppState['ui'])?.theme,
  });
});

store.dispatch({
  type: 'SET_USER',
  payload: { id: '1', name: 'Alice', preferences: {} },
});
store.dispatch({ type: 'UPDATE_UI', payload: { theme: 'dark' } });

// ============================================
// 3. ADVANCED MEMOIZATION & CACHING
// ============================================

console.log('\n=== Advanced Memoization ===\n');

// Multi-level cache with different strategies
class DataCache {
  private l1Cache: LRUCache<string, any>; // Fast, small
  private l2Cache: Map<string, { value: any; expires: number }>; // Larger, TTL-based
  private computeCount = 0;

  constructor() {
    this.l1Cache = new LRUCache(10);
    this.l2Cache = new Map();
  }

  async get<T>(
    key: string,
    compute: () => Promise<T>,
    ttl: number = 60000,
  ): Promise<T> {
    // Check L1
    if (this.l1Cache.has(key)) {
      console.log(`L1 hit: ${key}`);
      return this.l1Cache.get(key)!;
    }

    // Check L2
    const l2Entry = this.l2Cache.get(key);
    if (l2Entry && l2Entry.expires > Date.now()) {
      console.log(`L2 hit: ${key}`);
      this.l1Cache.set(key, l2Entry.value);
      return l2Entry.value;
    }

    // Compute
    console.log(`Cache miss: ${key}, computing...`);
    this.computeCount++;
    const value = await compute();

    // Store in both caches
    this.l1Cache.set(key, value);
    this.l2Cache.set(key, { value, expires: Date.now() + ttl });

    return value;
  }

  invalidate(pattern?: string) {
    if (!pattern) {
      this.l1Cache = new LRUCache(10);
      this.l2Cache.clear();
    } else {
      // Pattern-based invalidation
      for (const key of this.l2Cache.keys()) {
        if (key.includes(pattern)) {
          this.l2Cache.delete(key);
        }
      }
    }
  }

  getStats() {
    return {
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      computeCount: this.computeCount,
    };
  }
}

const cache = new DataCache();

// Simulate API calls
const fetchUserData = async (userId: string) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { id: userId, name: `User ${userId}`, score: Math.random() * 100 };
};

// Use cache
(async () => {
  await cache.get('user:1', () => fetchUserData('1'));
  await cache.get('user:1', () => fetchUserData('1')); // L1 hit
  await cache.get('user:2', () => fetchUserData('2'));

  console.log('Cache stats:', cache.getStats());
})();

// ============================================
// 4. FUNCTIONAL COMPOSITION PATTERNS
// ============================================

console.log('\n=== Functional Composition ===\n');

// Compose operations
const compose =
  <T>(...fns: Array<(arg: T) => T>) =>
  (initial: T): T =>
    fns.reduceRight((acc, fn) => fn(acc), initial);

const pipe =
  <T>(...fns: Array<(arg: T) => T>) =>
  (initial: T): T =>
    fns.reduce((acc, fn) => fn(acc), initial);

// Collection transformers
type CollectionTransformer<K, V> = (
  coll: MutableCollection<K, V>,
) => MutableCollection<K, V>;

const filterNegative: CollectionTransformer<string, number> = (coll) =>
  coll.filter((v) => v >= 0);

const doubleValues: CollectionTransformer<string, number> = (coll) =>
  coll.mapValues((v) => v * 2);

const sortByValue: CollectionTransformer<string, number> = (coll) => {
  coll.sortByValue();
  return coll;
};

// Compose transformations
const processNumbers = pipe(filterNegative, doubleValues, sortByValue);

const numbers = new MutableCollection([
  ['a', -5],
  ['b', 10],
  ['c', -2],
  ['d', 7],
]);

const processed = processNumbers(
  numbers.clone() as MutableCollection<string, number>,
);
console.log('Processed:', Array.from(processed.entries()));

// ============================================
// 5. REACTIVE COLLECTIONS
// ============================================

console.log('\n=== Reactive Collections ===\n');

class ReactiveCollection<K, V> extends MutableCollection<K, V> {
  private watchers: Map<K | '*', Set<(value: V | undefined, key: K) => void>>;

  constructor(entries?: Iterable<[K, V]>) {
    super(entries);
    this.watchers = new Map();
  }

  watch(key: K | '*', callback: (value: V | undefined, key: K) => void) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());
    }
    this.watchers.get(key)!.add(callback);

    // Return unwatch function
    return () => {
      const callbacks = this.watchers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.watchers.delete(key);
        }
      }
    };
  }

  override set(key: K, value: V): this {
    const oldValue = this.get(key);
    super.set(key, value);

    // Notify specific watchers
    this.watchers.get(key)?.forEach((cb) => cb(value, key));

    // Notify wildcard watchers
    this.watchers.get('*')?.forEach((cb) => cb(value, key));

    return this;
  }

  override delete(key: K): boolean {
    const hadKey = this.has(key);
    const result = super.delete(key);

    if (hadKey) {
      // Notify with undefined for deletions
      this.watchers.get(key)?.forEach((cb) => cb(undefined, key));
      this.watchers.get('*')?.forEach((cb) => cb(undefined, key));
    }

    return result;
  }

  // Computed values
  computed<R>(
    deps: K[],
    compute: (values: Array<V | undefined>) => R,
  ): () => R {
    const cache = { value: null as R | null, valid: false };

    const recompute = () => {
      const values = deps.map((k) => this.get(k));
      cache.value = compute(values);
      cache.valid = true;
    };

    // Watch all dependencies
    deps.forEach((dep) => {
      this.watch(dep, () => {
        cache.valid = false;
      });
    });

    return () => {
      if (!cache.valid) {
        recompute();
      }
      return cache.value!;
    };
  }
}

const reactive = new ReactiveCollection<string, number>([
  ['x', 10],
  ['y', 20],
]);

// Watch specific key
const unwatch = reactive.watch('x', (value, key) => {
  console.log(`Key ${key} changed to ${value}`);
});

// Watch all changes
reactive.watch('*', (value, key) => {
  console.log(`Any key changed: ${key} = ${value}`);
});

// Computed value
const sum = reactive.computed(['x', 'y'], ([x, y]) => (x || 0) + (y || 0));

reactive.set('x', 15); // Triggers watchers
console.log('Computed sum:', sum()); // 35

unwatch(); // Stop watching 'x'

// ============================================
// 6. ADVANCED DEEP OPERATIONS
// ============================================

console.log('\n=== Advanced Deep Operations ===\n');

interface NestedData {
  users: {
    [id: string]: {
      profile: {
        name: string;
        settings: {
          theme: string;
          notifications: {
            email: boolean;
            push: boolean;
          };
        };
      };
      stats: {
        posts: number;
        likes: number;
      };
    };
  };
  metadata: {
    version: string;
    lastUpdate: Date;
  };
}

const nestedData = createMutableCollection<string, any>(
  [
    [
      'app',
      {
        users: {
          user1: {
            profile: {
              name: 'Alice',
              settings: {
                theme: 'dark',
                notifications: {
                  email: true,
                  push: false,
                },
              },
            },
            stats: {
              posts: 42,
              likes: 100,
            },
          },
        },
        metadata: {
          version: '1.0.0',
          lastUpdate: new Date(),
        },
      },
    ],
  ],
  { withDeep: true },
);

// Deep get with path
const emailNotif = nestedData.getIn([
  'app',
  'users',
  'user1',
  'profile',
  'settings',
  'notifications',
  'email',
]);
console.log('Email notifications:', emailNotif);

// Deep update
nestedData.updateIn(
  ['app', 'users', 'user1', 'stats', 'posts'],
  (posts: number) => posts + 1,
);

// Deep merge - manually merge users
const existingUsers = nestedData.getIn(['app', 'users']) || {};
nestedData.setIn(['app', 'users'], {
  ...existingUsers,
  user2: {
    profile: {
      name: 'Bob',
      settings: {
        theme: 'light',
        notifications: {
          email: false,
          push: true,
        },
      },
    },
    stats: {
      posts: 10,
      likes: 20,
    },
  },
});

console.log(
  'Users count:',
  Object.keys(nestedData.getIn(['app', 'users'])).length,
);

// ============================================
// 7. STREAM PROCESSING
// ============================================

console.log('\n=== Stream Processing ===\n');

class DataStream<T> {
  private buffer: T[] = [];
  private processors: Array<(item: T) => T | null> = [];
  private batchSize: number;
  private flushCallback?: (batch: T[]) => void;

  constructor(batchSize: number = 100) {
    this.batchSize = batchSize;
  }

  pipe(processor: (item: T) => T | null): this {
    this.processors.push(processor);
    return this;
  }

  onFlush(callback: (batch: T[]) => void): this {
    this.flushCallback = callback;
    return this;
  }

  push(item: T) {
    let current: T | null = item;

    // Apply processors
    for (const processor of this.processors) {
      current = processor(current!);
      if (current === null) {
        break; // Filtered out
      }
    }

    if (current !== null) {
      this.buffer.push(current);

      // Auto-flush if buffer is full
      if (this.buffer.length >= this.batchSize) {
        this.flush();
      }
    }
  }

  flush() {
    if (this.buffer.length > 0 && this.flushCallback) {
      this.flushCallback([...this.buffer]);
      this.buffer = [];
    }
  }

  static fromCollection<K, V>(
    collection: ReadableCollection<K, V>,
  ): DataStream<[K, V]> {
    const stream = new DataStream<[K, V]>();

    // Process collection in chunks
    const entries = Array.from(collection.entries());
    const chunkSize = 100;

    setTimeout(() => {
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        chunk.forEach((entry) => stream.push(entry));

        if (i + chunkSize < entries.length) {
          // Simulate async processing
          setTimeout(() => {}, 0);
        }
      }
      stream.flush(); // Final flush
    }, 0);

    return stream;
  }
}

// Create stream pipeline
const stream = new DataStream<number>(5)
  .pipe((n) => (n > 0 ? n : null)) // Filter negative
  .pipe((n) => n * 2) // Double
  .pipe((n) => (n > 100 ? null : n)) // Filter too large
  .onFlush((batch) => {
    console.log(`Processing batch of ${batch.length}:`, batch);
  });

// Feed data
[1, -5, 10, 20, -3, 8, 60].forEach((n) => stream.push(n));
stream.flush();

// ============================================
// 8. ERROR HANDLING & RECOVERY
// ============================================

console.log('\n=== Error Handling ===\n');

class SafeCollection<K, V> extends MutableCollection<K, V> {
  private errorLog: Array<{
    operation: string;
    key: K;
    error: Error;
    timestamp: Date;
  }> = [];
  private fallbackValue?: V;

  constructor(entries?: Iterable<[K, V]>, fallbackValue?: V) {
    super(entries);
    this.fallbackValue = fallbackValue;
  }

  safeGet(key: K): V | undefined {
    try {
      return this.get(key) ?? this.fallbackValue;
    } catch (error) {
      this.logError('get', key, error as Error);
      return this.fallbackValue;
    }
  }

  safeTransform<R>(operation: (coll: this) => R, fallback: R): R {
    try {
      return operation(this);
    } catch (error) {
      console.error('Transform failed:', error);
      return fallback;
    }
  }

  tryUpdate(key: K, updater: (value: V | undefined) => V): boolean {
    try {
      const current = this.get(key);
      const newValue = updater(current);
      this.set(key, newValue);
      return true;
    } catch (error) {
      this.logError('update', key, error as Error);
      return false;
    }
  }

  private logError(operation: string, key: K, error: Error) {
    this.errorLog.push({
      operation,
      key,
      error,
      timestamp: new Date(),
    });

    // Keep log size limited
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }

  getErrors() {
    return [...this.errorLog];
  }

  clearErrors() {
    this.errorLog = [];
  }
}

const safe = new SafeCollection<string, number>(
  [
    ['a', 1],
    ['b', 2],
  ],
  0, // fallback value
);

// Safe operations
console.log('Safe get missing:', safe.safeGet('missing')); // Returns 0

// Try update with validation
const updated = safe.tryUpdate('a', (val) => {
  if (val === undefined) {
    throw new Error('Value not found');
  }
  if (val < 0) {
    throw new Error('Negative not allowed');
  }
  return val * 2;
});
console.log('Update successful:', updated);

// ============================================
// 9. PERFORMANCE MONITORING
// ============================================

console.log('\n=== Performance Monitoring ===\n');

class MonitoredCollection<K, V> extends MutableCollection<K, V> {
  private metrics: {
    reads: number;
    writes: number;
    deletes: number;
    iterations: number;
    totalTime: number;
  };

  constructor(entries?: Iterable<[K, V]>) {
    super(entries);
    this.metrics = {
      reads: 0,
      writes: 0,
      deletes: 0,
      iterations: 0,
      totalTime: 0,
    };
  }

  override get(key: K): V | undefined {
    const start = performance.now();
    const result = super.get(key);
    this.metrics.totalTime += performance.now() - start;
    this.metrics.reads++;
    return result;
  }

  override set(key: K, value: V): this {
    const start = performance.now();
    const result = super.set(key, value);
    this.metrics.totalTime += performance.now() - start;
    this.metrics.writes++;
    return result;
  }

  override delete(key: K): boolean {
    const start = performance.now();
    const result = super.delete(key);
    this.metrics.totalTime += performance.now() - start;
    this.metrics.deletes++;
    return result;
  }

  override *entries(): IterableIterator<[K, V]> {
    this.metrics.iterations++;
    yield* super.entries();
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgOperationTime:
        this.metrics.totalTime /
        (this.metrics.reads + this.metrics.writes + this.metrics.deletes),
    };
  }

  resetMetrics() {
    this.metrics = {
      reads: 0,
      writes: 0,
      deletes: 0,
      iterations: 0,
      totalTime: 0,
    };
  }
}

const monitored = new MonitoredCollection<string, number>();

// Perform operations
for (let i = 0; i < 100; i++) {
  monitored.set(`key${i}`, i);
  monitored.get(`key${i}`);
  if (i % 10 === 0) {
    monitored.delete(`key${i}`);
  }
}

console.log('Performance metrics:', monitored.getMetrics());

// ============================================
// SUMMARY
// ============================================

console.log('\n' + '='.repeat(50));
console.log('✅ Advanced examples completed successfully!');
console.log('='.repeat(50));

console.log(`
Key Patterns Demonstrated:
- Real-world data processing pipelines
- State management with history
- Multi-level caching strategies
- Functional composition
- Reactive collections with watchers
- Deep nested data operations
- Stream processing
- Error handling and recovery
- Performance monitoring
`);
