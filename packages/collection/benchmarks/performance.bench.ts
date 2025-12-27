/**
 * Performance benchmarks for @orchlab/collection
 * Measures and compares performance of key operations
 */

import {
  BiMap,
  ImmutableCollection,
  MutableCollection,
  MultiMap,
  OrderedMap,
  PersistentCollection,
  Seq,
} from '../src';

/**
 * Benchmark suite configuration
 */
interface BenchmarkConfig {
  name: string;
  iterations: number;
  warmup: number;
}

/**
 * Benchmark result
 */
interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  opsPerSecond: number;
  min: number;
  max: number;
}

/**
 * Simple benchmarking utility
 */
class Benchmark {
  private results: BenchmarkResult[] = [];

  /**
   * Run a benchmark
   */
  run(config: BenchmarkConfig, fn: () => void): BenchmarkResult {
    // Warmup
    for (let i = 0; i < config.warmup; i++) {
      fn();
    }

    // Measure
    const times: number[] = [];
    const start = performance.now();

    for (let i = 0; i < config.iterations; i++) {
      const iterStart = performance.now();
      fn();
      times.push(performance.now() - iterStart);
    }

    const totalTime = performance.now() - start;
    const avgTime = totalTime / config.iterations;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const opsPerSecond = 1000 / avgTime;

    const result: BenchmarkResult = {
      name: config.name,
      iterations: config.iterations,
      totalTime,
      avgTime,
      opsPerSecond,
      min,
      max,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Compare benchmarks
   */
  compare(baseline: string, ...names: string[]): void {
    const baselineResult = this.results.find((r) => r.name === baseline);
    if (!baselineResult) {
      throw new Error(`Baseline '${baseline}' not found`);
    }

    console.log('\n📊 Performance Comparison');
    console.log('═'.repeat(60));
    console.log(
      `Baseline: ${baseline} - ${baselineResult.opsPerSecond.toFixed(2)} ops/sec`,
    );
    console.log('─'.repeat(60));

    for (const name of names) {
      const result = this.results.find((r) => r.name === name);
      if (!result) {
        continue;
      }

      const ratio = result.opsPerSecond / baselineResult.opsPerSecond;
      const faster = ratio > 1;
      const percentage = Math.abs((ratio - 1) * 100);
      const symbol = faster ? '🚀' : '🐢';

      console.log(
        `${symbol} ${name}: ${result.opsPerSecond.toFixed(2)} ops/sec ` +
          `(${faster ? '+' : '-'}${percentage.toFixed(1)}%)`,
      );
    }
    console.log('═'.repeat(60));
  }

  /**
   * Print results table
   */
  printTable(): void {
    console.log('\n📈 Benchmark Results');
    console.log('═'.repeat(80));
    console.log(
      'Name'.padEnd(30) +
        'Ops/sec'.padEnd(15) +
        'Avg (ms)'.padEnd(15) +
        'Min (ms)'.padEnd(10) +
        'Max (ms)'.padEnd(10),
    );
    console.log('─'.repeat(80));

    for (const result of this.results) {
      console.log(
        result.name.padEnd(30) +
          result.opsPerSecond.toFixed(2).padEnd(15) +
          result.avgTime.toFixed(4).padEnd(15) +
          result.min.toFixed(4).padEnd(10) +
          result.max.toFixed(4).padEnd(10),
      );
    }
    console.log('═'.repeat(80));
  }
}

// ============================================
// BENCHMARKS
// ============================================

console.log('🔬 Running performance benchmarks...\n');

const bench = new Benchmark();
const size = 10000;
const iterations = 10000;
const warmup = 100;

// Prepare test data
const testData: Array<[string, number]> = Array.from(
  { length: size },
  (_, i) => [`key_${i}`, i],
);

// ============================================
// 1. SET OPERATIONS
// ============================================

console.log('⏱️  Testing SET operations...');

// Native Map
const nativeMap = new Map<string, number>();
bench.run(
  {
    name: 'Native Map - set',
    iterations,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    nativeMap.set(key, Math.random());
  },
);

// MutableCollection
const mutableCol = new MutableCollection<string, number>(testData);
bench.run(
  {
    name: 'MutableCollection - set',
    iterations,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    mutableCol.set(key, Math.random());
  },
);

// ImmutableCollection
let immutableCol = new ImmutableCollection<string, number>(testData);
bench.run(
  {
    name: 'ImmutableCollection - set',
    iterations,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    immutableCol = immutableCol.set(key, Math.random());
  },
);

// PersistentCollection
let persistentCol = new PersistentCollection<string, number>(testData);
bench.run(
  {
    name: 'PersistentCollection - set',
    iterations,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    persistentCol = persistentCol.set(key, Math.random());
  },
);

// OrderedMap
const orderedMap = new OrderedMap<string, number>(testData);
bench.run(
  {
    name: 'OrderedMap - set',
    iterations,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    orderedMap.set(key, Math.random());
  },
);

// ============================================
// 2. GET OPERATIONS
// ============================================

console.log('⏱️  Testing GET operations...');

bench.run(
  {
    name: 'Native Map - get',
    iterations: iterations * 10,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    nativeMap.get(key);
  },
);

bench.run(
  {
    name: 'MutableCollection - get',
    iterations: iterations * 10,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    mutableCol.get(key);
  },
);

bench.run(
  {
    name: 'OrderedMap - get',
    iterations: iterations * 10,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * size)}`;
    orderedMap.get(key);
  },
);

// ============================================
// 3. ITERATION OPERATIONS
// ============================================

console.log('⏱️  Testing ITERATION operations...');

bench.run(
  {
    name: 'Native Map - iteration',
    iterations: 100,
    warmup: 10,
  },
  () => {
    let sum = 0;
    for (const [, value] of nativeMap) {
      sum += value;
    }
  },
);

bench.run(
  {
    name: 'MutableCollection - iteration',
    iterations: 100,
    warmup: 10,
  },
  () => {
    let sum = 0;
    for (const [, value] of mutableCol) {
      sum += value;
    }
  },
);

bench.run(
  {
    name: 'OrderedMap - iteration',
    iterations: 100,
    warmup: 10,
  },
  () => {
    let sum = 0;
    for (const [, value] of orderedMap) {
      sum += value;
    }
  },
);

// Lazy sequence iteration
bench.run(
  {
    name: 'Seq - lazy iteration',
    iterations: 100,
    warmup: 10,
  },
  () => {
    const result = new Seq(mutableCol)
      .filter((v) => v % 2 === 0)
      .map((v) => v * 2)
      .take(100)
      .toArray();
    return result.length;
  },
);

// ============================================
// 4. SPECIALIZED COLLECTIONS
// ============================================

console.log('⏱️  Testing SPECIALIZED collections...');

// BiMap bidirectional lookup
const bimap = new BiMap<string, number>(testData.slice(0, 1000));
bench.run(
  {
    name: 'BiMap - forward lookup',
    iterations: iterations * 10,
    warmup,
  },
  () => {
    const key = `key_${Math.floor(Math.random() * 1000)}`;
    bimap.get(key);
  },
);

bench.run(
  {
    name: 'BiMap - reverse lookup',
    iterations: iterations * 10,
    warmup,
  },
  () => {
    const value = Math.floor(Math.random() * 1000);
    bimap.getKey(value);
  },
);

// MultiMap operations
const multimap = new MultiMap<string, number>();
for (let i = 0; i < 1000; i++) {
  multimap.add(`group_${i % 100}`, i);
}

bench.run(
  {
    name: 'MultiMap - add value',
    iterations,
    warmup,
  },
  () => {
    const key = `group_${Math.floor(Math.random() * 100)}`;
    multimap.add(key, Math.random());
  },
);

bench.run(
  {
    name: 'MultiMap - getAll values',
    iterations: iterations * 10,
    warmup,
  },
  () => {
    const key = `group_${Math.floor(Math.random() * 100)}`;
    multimap.getAll(key);
  },
);

// ============================================
// 5. FUNCTIONAL OPERATIONS
// ============================================

console.log('⏱️  Testing FUNCTIONAL operations...');

const functionalCol = new MutableCollection<string, number>(
  testData.slice(0, 1000),
);

bench.run(
  {
    name: 'filter operation',
    iterations: 1000,
    warmup: 10,
  },
  () => {
    functionalCol.filter((v) => v % 2 === 0);
  },
);

bench.run(
  {
    name: 'map operation',
    iterations: 1000,
    warmup: 10,
  },
  () => {
    functionalCol.map((v) => v * 2);
  },
);

bench.run(
  {
    name: 'reduce operation',
    iterations: 1000,
    warmup: 10,
  },
  () => {
    functionalCol.reduce((sum, v) => sum + v, 0);
  },
);

// ============================================
// RESULTS
// ============================================

// Print detailed results table
bench.printTable();

// Compare collection types for SET operations
bench.compare(
  'Native Map - set',
  'MutableCollection - set',
  'ImmutableCollection - set',
  'PersistentCollection - set',
  'OrderedMap - set',
);

// Compare collection types for GET operations
bench.compare(
  'Native Map - get',
  'MutableCollection - get',
  'OrderedMap - get',
);

// Performance summary
console.log('\n✨ Performance Summary:');
console.log('═'.repeat(60));
console.log('• MutableCollection: Near-native performance');
console.log('• OrderedMap: O(1) access with order preservation');
console.log('• BiMap: Efficient bidirectional lookup');
console.log('• Seq: Lazy evaluation minimizes operations');
console.log('• PersistentCollection: Structural sharing for efficiency');
console.log('═'.repeat(60));

console.log('\n✅ Benchmarks completed successfully!');
