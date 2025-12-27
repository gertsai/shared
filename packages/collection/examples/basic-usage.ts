/**
 * @orchlab/collection - Basic Usage Examples
 * Demonstrates core functionality and best practices
 */

import {
  ImmutableCollection,
  MutableCollection,
  Seq,
  cachedSeq,
  memoized,
} from '../src';

// ============================================
// 1. MUTABLE COLLECTIONS
// ============================================

console.log('\n=== Mutable Collections ===\n');

// Create and manipulate mutable collection
const users = new MutableCollection<string, { name: string; age: number }>([
  ['u1', { name: 'Alice', age: 30 }],
  ['u2', { name: 'Bob', age: 25 }],
  ['u3', { name: 'Charlie', age: 35 }],
]);

// Basic operations - modifies in place
users.set('u4', { name: 'Diana', age: 28 });
users.delete('u2');
console.log('Users after mutations:', users.size); // 3

// Transform operations - returns new collection
const adults = users.filter((user) => user.age >= 30);
console.log('Adults:', Array.from(adults.values()));

// Set operations
const managers = new MutableCollection([
  ['u1', { name: 'Alice', age: 30 }],
  ['u5', { name: 'Eve', age: 40 }],
]);

const allStaff = users.union(managers);
const bothLists = users.intersection(managers);
console.log('Union size:', allStaff.size); // 5
console.log('Intersection size:', bothLists.size); // 1

// ============================================
// 2. IMMUTABLE COLLECTIONS
// ============================================

console.log('\n=== Immutable Collections ===\n');

// Create immutable collection
const config = new ImmutableCollection([
  ['api_url', 'https://api.example.com'],
  ['timeout', '5000'],
  ['retries', '3'],
]);

// All operations return new instances
const newConfig = config.set('debug', 'true');
console.log('Original has debug?', config.has('debug')); // false
console.log('New has debug?', newConfig.has('debug')); // true

// Optimization: returns same instance if no changes
const sameConfig = config.set('timeout', '5000'); // Same value
console.log('Same instance?', sameConfig === config); // true

// Batch mutations efficiently
const batchUpdate = config.withMutations((mutable) => {
  mutable.set('api_url', 'https://api-v2.example.com');
  mutable.set('version', '2.0');
  mutable.delete('retries');
});
console.log('Batch updated:', batchUpdate.size);

// ============================================
// 3. LAZY SEQUENCES
// ============================================

console.log('\n=== Lazy Sequences ===\n');

// Create large dataset
const numbers = Array.from(
  { length: 10000 },
  (_, i) => [i, i] as [number, number],
);
const largeCollection = new MutableCollection(numbers);

// Lazy evaluation - operations don't execute until needed
let filterCalls = 0;
let mapCalls = 0;

const result = new Seq(largeCollection)
  .filter((value) => {
    filterCalls++;
    return value % 2 === 0;
  })
  .map((value) => {
    mapCalls++;
    return value * 2;
  })
  .take(5)
  .toArray();

console.log('Result:', result); // [0, 4, 8, 12, 16]
console.log('Filter called:', filterCalls); // ~10 times, not 10000!
console.log('Map called:', mapCalls); // 5 times only

// Cached sequences for repeated iteration
const cached = cachedSeq(largeCollection)
  .filter((v) => v < 100)
  .map((v) => v * 2);

const first = Array.from(cached); // Computes and caches
const second = Array.from(cached); // Uses cache
console.log('Cached results equal?', first.length === second.length); // true

// ============================================
// 4. MEMOIZED OPERATIONS
// ============================================

console.log('\n=== Memoized Operations ===\n');

// Expensive computation
const expensiveSum = (collection: Map<string, number>) => {
  console.log('Computing sum...');
  let total = 0;
  for (const [, value] of collection) {
    // Simulate expensive operation
    total += value * value;
  }
  return total;
};

// Memoize it
const memoizedSum = memoized.withMemoization(expensiveSum);

const data = new Map([
  ['a', 1],
  ['b', 2],
  ['c', 3],
]);

console.log('First call:', memoizedSum(data)); // Computes
console.log('Second call:', memoizedSum(data)); // From cache (no "Computing..." log)

// ============================================
// 5. GROUPING AND AGGREGATION
// ============================================

console.log('\n=== Grouping and Aggregation ===\n');

const employees = [
  { name: 'Alice', department: 'Engineering', salary: 100000 },
  { name: 'Bob', department: 'Marketing', salary: 80000 },
  { name: 'Charlie', department: 'Engineering', salary: 120000 },
  { name: 'Diana', department: 'HR', salary: 90000 },
  { name: 'Eve', department: 'Engineering', salary: 110000 },
];

// Group by department
const byDept = MutableCollection.groupBy(employees, (emp) => emp.department);

console.log('Departments:', Array.from(byDept.keys()));

// Calculate average salary per department
const avgSalaries = byDept.mapValues((emps) => {
  const total = emps.reduce((sum, emp) => sum + emp.salary, 0);
  return total / emps.length;
});

console.log('Average salaries:');
for (const [dept, avg] of avgSalaries) {
  console.log(`  ${dept}: $${avg.toLocaleString()}`);
}

// ============================================
// 6. PERFORMANCE PATTERNS
// ============================================

console.log('\n=== Performance Patterns ===\n');

// Use immutable for shared state
const sharedState = new ImmutableCollection<string, any>([
  ['counter', 0],
  ['users', []],
]);

// Safe concurrent updates
const state1 = sharedState.set('counter', 1);
const state2 = sharedState.set('counter', 2);
console.log('States are independent:', state1 !== state2); // true

// Use mutable for local transformations
const processData = (data: Array<[string, number]>) => {
  const collection = new MutableCollection(data);

  // Multiple in-place operations
  collection.filter((v) => v > 0);
  collection.mapValues((v) => v * 2);
  collection.sort();

  return collection;
};

// Example of using processData
const sampleData: Array<[string, number]> = [
  ['a', -5],
  ['b', 10],
  ['c', 3],
];
const processed = processData(sampleData);
console.log('Processed data size:', processed.size);

// Use Seq for large data pipelines
const pipeline = (data: Iterable<[string, number]>) => {
  return new Seq(data)
    .filter((v) => v > 100)
    .map((v) => Math.sqrt(v))
    .take(1000)
    .toArray();
};

// Example of using pipeline
const bigNumbers = new Map([
  ['a', 144],
  ['b', 256],
  ['c', 50],
]);
const pipelineResult = pipeline(bigNumbers);
console.log('Pipeline results:', pipelineResult.length);

console.log('\n✅ All examples completed successfully!');
