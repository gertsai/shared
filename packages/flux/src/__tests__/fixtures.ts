/**
 * Test fixtures and builders for @gerts/flux tests.
 *
 * Implements FixtureBuilder pattern from TYPESCRIPT-BEST-PRACTICES-REVIEW.md
 * for type-safe, reusable test data creation.
 */

/**
 * Generic test fixture builder.
 * Creates type-safe test objects with default values and optional overrides.
 *
 * @example
 * ```typescript
 * const userBuilder = new FixtureBuilder<User>({
 *   id: 1,
 *   name: 'Test User',
 *   email: 'test@example.com',
 * });
 *
 * const user = userBuilder.build({ name: 'Custom Name' });
 * const users = userBuilder.buildMany(10);
 * ```
 */
export class FixtureBuilder<T extends object> {
  private defaults: Partial<T>;
  private sequence = 0;

  constructor(defaults: Partial<T>) {
    this.defaults = defaults;
  }

  /**
   * Build a single fixture with optional overrides.
   */
  build(overrides?: Partial<T>): T {
    this.sequence++;
    return {
      ...this.defaults,
      ...overrides,
    } as T;
  }

  /**
   * Build multiple fixtures.
   *
   * @param count - Number of fixtures to create
   * @param overrides - Optional overrides applied to all fixtures
   */
  buildMany(count: number, overrides?: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  /**
   * Build multiple fixtures with a factory function.
   * Factory receives the index for creating unique values.
   *
   * @param count - Number of fixtures to create
   * @param factory - Function that returns overrides for each index
   */
  buildManyWith(count: number, factory: (index: number) => Partial<T>): T[] {
    return Array.from({ length: count }, (_, i) => this.build(factory(i)));
  }

  /**
   * Reset the sequence counter.
   */
  reset(): void {
    this.sequence = 0;
  }

  /**
   * Get current sequence number.
   */
  getSequence(): number {
    return this.sequence;
  }
}

// ============================================================================
// Common Fixture Types
// ============================================================================

/**
 * Simple object with id and value.
 */
export interface SimpleObject {
  id: number;
  value: string;
}

/**
 * Complex object with nested data.
 */
export interface ComplexObject {
  id: number;
  name: string;
  data: string;
  nested: {
    value: number;
    tags: string[];
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * User-like object for collection tests.
 */
export interface UserFixture {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  active: boolean;
}

/**
 * Animal hierarchy for type guard tests.
 */
export interface Animal {
  type: string;
  name: string;
}

export interface Dog extends Animal {
  type: 'dog';
  breed: string;
  bark: () => void;
}

export interface Cat extends Animal {
  type: 'cat';
  color: string;
  meow: () => void;
}

// ============================================================================
// Pre-configured Builders
// ============================================================================

/**
 * Builder for simple objects.
 */
export const simpleObjectBuilder = new FixtureBuilder<SimpleObject>({
  id: 1,
  value: 'test',
});

/**
 * Builder for complex objects.
 */
export const complexObjectBuilder = new FixtureBuilder<ComplexObject>({
  id: 1,
  name: 'Test Object',
  data: 'test data',
  nested: {
    value: 100,
    tags: ['tag1', 'tag2'],
  },
  createdAt: new Date('2024-01-01'),
});

/**
 * Builder for user fixtures.
 */
export const userBuilder = new FixtureBuilder<UserFixture>({
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  active: true,
});

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a dog fixture with mock bark function.
 */
export function createDog(overrides?: Partial<Omit<Dog, 'type' | 'bark'>>): Dog {
  return {
    type: 'dog',
    name: overrides?.name ?? 'Rex',
    breed: overrides?.breed ?? 'German Shepherd',
    bark: () => {},
  };
}

/**
 * Create a cat fixture with mock meow function.
 */
export function createCat(overrides?: Partial<Omit<Cat, 'type' | 'meow'>>): Cat {
  return {
    type: 'cat',
    name: overrides?.name ?? 'Whiskers',
    color: overrides?.color ?? 'orange',
    meow: () => {},
  };
}

/**
 * Create entries for collection initialization.
 */
export function createEntries<K, V>(count: number, factory: (index: number) => [K, V]): [K, V][] {
  return Array.from({ length: count }, (_, i) => factory(i));
}

/**
 * Create numbered entries with string keys.
 */
export function createNumberedEntries(count: number): [string, number][] {
  return createEntries(count, (i) => [`key-${i}`, i]);
}

/**
 * Create object entries with string keys.
 */
export function createObjectEntries(count: number): [string, SimpleObject][] {
  return createEntries(count, (i) => [
    `obj-${i}`,
    simpleObjectBuilder.build({ id: i, value: `value-${i}` }),
  ]);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for Dog.
 */
export function isDog(animal: Animal): animal is Dog {
  return animal.type === 'dog';
}

/**
 * Type guard for Cat.
 */
export function isCat(animal: Animal): animal is Cat {
  return animal.type === 'cat';
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a deferred promise for async tests.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Wait for a specified number of milliseconds.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a function N times and collect results.
 */
export function times<T>(n: number, fn: (index: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}
