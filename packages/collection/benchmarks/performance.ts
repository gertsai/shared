/**
 * @orchlab/collection - Performance Benchmarks
 * Measures performance of core operations
 */

import { ImmutableCollection, MutableCollection, Seq, cachedSeq } from '../src';

// Helper to measure execution time
function benchmark(name: string, fn: () => void, iterations = 1000): void {
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = performance.now();
  const timePerOp = (end - start) / iterations;

  console.log(`${name}: ${timePerOp.toFixed(3)}ms per operation`);
}

// Generate test data
function generateData(size: number): Array<[string, number]> {
  return Array.from({ length: size }, (_, i) => [`key${i}`, i]);
}

console.log('🚀 Performance Benchmarks\n');
console.log('='.repeat(50));

// ============================================
// 1. Collection Creation
// ============================================
console.log('\n📊 Collection Creation (1000 items)\n');

const testData = generateData(1000);

benchmark('MutableCollection.from()', () => {
  MutableCollection.from(testData);
});

benchmark('ImmutableCollection.from()', () => {
  ImmutableCollection.from(testData);
});

benchmark('Native Map', () => {
  new Map(testData);
});

// ============================================
// 2. Basic Operations
// ============================================
console.log('\n📊 Basic Operations\n');

const mutable = new MutableCollection(testData);
const immutable = new ImmutableCollection(testData);
const nativeMap = new Map(testData);

benchmark('MutableCollection.set()', () => {
  mutable.set('test', 999);
});

benchmark('ImmutableCollection.set()', () => {
  immutable.set('test', 999);
});

benchmark('Map.set()', () => {
  nativeMap.set('test', 999);
});

benchmark('MutableCollection.get()', () => {
  mutable.get('key500');
});

benchmark('ImmutableCollection.get()', () => {
  immutable.get('key500');
});

benchmark('Map.get()', () => {
  nativeMap.get('key500');
});

// ============================================
// 3. Iteration Performance
// ============================================
console.log('\n📊 Iteration Performance\n');

benchmark(
  'MutableCollection iteration',
  () => {
    let sum = 0;
    for (const [, value] of mutable) {
      sum += value;
    }
  },
  100,
);

benchmark(
  'ImmutableCollection iteration',
  () => {
    let sum = 0;
    for (const [, value] of immutable) {
      sum += value;
    }
  },
  100,
);

benchmark(
  'Map iteration',
  () => {
    let sum = 0;
    for (const [, value] of nativeMap) {
      sum += value;
    }
  },
  100,
);

// ============================================
// 4. Transformation Operations
// ============================================
console.log('\n📊 Transformation Operations\n');

benchmark(
  'MutableCollection.filter()',
  () => {
    mutable.filter((v) => v % 2 === 0);
  },
  100,
);

benchmark(
  'ImmutableCollection.filter()',
  () => {
    immutable.filter((v) => v % 2 === 0);
  },
  100,
);

benchmark(
  'Array.filter() on Map',
  () => {
    new Map(Array.from(nativeMap).filter(([, v]) => v % 2 === 0));
  },
  100,
);

benchmark(
  'MutableCollection.mapValues()',
  () => {
    mutable.mapValues((v) => v * 2);
  },
  100,
);

benchmark(
  'ImmutableCollection.mapValues()',
  () => {
    immutable.mapValues((v) => v * 2);
  },
  100,
);

// ============================================
// 5. Lazy Evaluation Performance
// ============================================
console.log('\n📊 Lazy Evaluation (10000 items, take 10)\n');

const largeData = generateData(10000);
const largeMutable = new MutableCollection(largeData);

benchmark(
  'Eager filter + map',
  () => {
    const filtered = largeMutable.filter((v) => v % 2 === 0);
    const mapped = filtered.mapValues((v) => v * 2);
    const result = Array.from(mapped.values()).slice(0, 10);
  },
  10,
);

benchmark(
  'Lazy Seq filter + map',
  () => {
    const result = new Seq(largeMutable)
      .filter((v) => v % 2 === 0)
      .map((v) => v * 2)
      .take(10)
      .toArray();
  },
  10,
);

benchmark(
  'Cached Seq (second iteration)',
  () => {
    const cached = cachedSeq(largeMutable)
      .filter((v) => v % 2 === 0)
      .map((v) => v * 2)
      .take(10);

    // First iteration (caches)
    Array.from(cached);
    // Second iteration (from cache)
    Array.from(cached);
  },
  10,
);

// ============================================
// 6. Set Operations Performance
// ============================================
console.log('\n📊 Set Operations (500 items each)\n');

const set1 = new MutableCollection(generateData(500));
const set2 = new MutableCollection(
  generateData(500).map(([k, v]) => [`key${v + 250}`, v + 250]),
);

benchmark(
  'Union',
  () => {
    set1.union(set2);
  },
  100,
);

benchmark(
  'Intersection',
  () => {
    set1.intersection(set2);
  },
  100,
);

benchmark(
  'Difference',
  () => {
    set1.difference(set2);
  },
  100,
);

// ============================================
// 7. Memory Optimization Test
// ============================================
console.log('\n📊 Memory Optimization\n');

const original = new ImmutableCollection(generateData(1000));

// Test structural sharing
let modified = original;
let changeCount = 0;

benchmark(
  'ImmutableCollection updates with no change',
  () => {
    // Should return same instance
    const newColl = modified.set('key500', 500); // Same value
    if (newColl !== modified) {
      changeCount++;
    }
    modified = newColl;
  },
  1000,
);

console.log(`Unnecessary copies created: ${changeCount} (should be 0)`);

// ============================================
// 8. Batch Operations
// ============================================
console.log('\n📊 Batch Operations\n');

const batchData = new ImmutableCollection(generateData(100));

benchmark(
  'Individual updates',
  () => {
    let result = batchData;
    for (let i = 0; i < 10; i++) {
      result = result.set(`new${i}`, i);
    }
  },
  100,
);

benchmark(
  'withMutations batch',
  () => {
    batchData.withMutations((mutable) => {
      for (let i = 0; i < 10; i++) {
        mutable.set(`new${i}`, i);
      }
    });
  },
  100,
);

console.log('\n' + '='.repeat(50));
console.log('✅ Benchmarks completed!\n');
