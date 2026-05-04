/**
 * Batch operations mixin for collections
 * Provides methods for efficient batch mutations and transformations
 * Following SOLID principle - Single Responsibility
 */

import { ImmutableCollection } from '../core/ImmutableCollection';
import { MutableCollection } from '../core/MutableCollection';
import { Seq } from '../Seq';
import type {
  ReadableCollection,
  WritableCollection,
} from '../types/interfaces';
import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';

// Type guard to check if collection is mutable
function isMutableCollection<K, V>(
  collection: ReadableCollection<K, V>,
): collection is ReadableCollection<K, V> & WritableCollection<K, V> {
  return 'set' in collection && 'delete' in collection && 'clear' in collection;
}

/**
 * Interface for batch operations
 */
export interface BatchOps<K, V> {
  // Batch mutation operations
  withMutations(
    mutator: (
      mutable: ReadableCollection<K, V> & WritableCollection<K, V>,
    ) => void,
  ): ReadableCollection<K, V>;
  asMutable(): ReadableCollection<K, V> &
    WritableCollection<K, V> &
    BatchOps<K, V>;
  asImmutable(): ReadableCollection<K, V> & BatchOps<K, V>;

  // Conversion operations
  toSeq(): Seq<K, V>;
  toKeyedSeq(): Seq<K, V>;
  toIndexedSeq(): Seq<K, V>;
  toSetSeq(): Seq<K, V>;

  // Advanced transformations
  flip(): ReadableCollection<V, K>;
  skipWhile(predicate: (value: V, key: K) => boolean): ReadableCollection<K, V>;
  takeWhile(predicate: (value: V, key: K) => boolean): ReadableCollection<K, V>;

  // Grouping operations
  groupBy<G>(
    grouper: (value: V, key: K) => G,
  ): Map<G, ReadableCollection<K, V>>;
  countBy<G>(grouper: (value: V, key: K) => G): Map<G, number>;

  // Unique operations
  unique(): ReadableCollection<K, V>;
  uniqueBy<U>(selector: (value: V, key: K) => U): ReadableCollection<K, V>;
}

/**
 * Implementation of batch operations
 */
export class BatchOpsMixin<K, V> {
  private isMutable: boolean = false;
  private mutations: Array<() => void> = [];

  constructor(
    private readonly data: Map<K, V>,
    private readonly createNew: (
      entries: Iterable<[K, V]>,
    ) => ReadableCollection<K, V>,
    private readonly isImmutable: boolean = false,
  ) {}

  /**
   * Perform multiple mutations in a batch
   * For mutable collections, applies mutations directly and returns the same instance
   * For immutable collections, creates a temporary mutable copy and returns a new immutable
   */
  withMutations(
    _mutator: (
      mutable: ReadableCollection<K, V> & WritableCollection<K, V>,
    ) => void,
  ): ReadableCollection<K, V> {
    // This method will be overridden in withBatchOps to properly handle the target
    throw new Error(
      'withMutations must be properly bound through withBatchOps',
    );
  }

  /**
   * Convert to mutable version
   */
  asMutable(): ReadableCollection<K, V> &
    WritableCollection<K, V> &
    BatchOps<K, V> {
    // This method will be overridden in withBatchOps to properly handle the target
    throw new Error('asMutable must be properly bound through withBatchOps');
  }

  /**
   * Convert to immutable version
   */
  asImmutable(): ReadableCollection<K, V> & BatchOps<K, V> {
    // This method will be overridden in withBatchOps to properly handle the target
    throw new Error('asImmutable must be properly bound through withBatchOps');
  }

  /**
   * Convert to lazy sequence
   */
  toSeq(): Seq<K, V> {
    const adapter = new MutableCollection<K, V>(this.data);
    return Seq.fromCollection(adapter);
  }

  /**
   * Convert to keyed sequence
   */
  toKeyedSeq(): Seq<K, V> {
    return this.toSeq();
  }

  /**
   * Convert to indexed sequence
   */
  toIndexedSeq(): Seq<K, V> {
    return this.toSeq();
  }

  /**
   * Convert to set sequence
   */
  toSetSeq(): Seq<K, V> {
    return this.toSeq();
  }

  /**
   * Flip keys and values
   */
  flip(): ReadableCollection<unknown, unknown> {
    const entries: Array<[V, K]> = [];
    for (const [key, value] of this.data) {
      entries.push([value, key]);
    }
    return this.createNew(entries as unknown as Iterable<[any, any]>);
  }

  /**
   * Skip elements while predicate is true
   */
  skipWhile(
    predicate: (value: V, key: K) => boolean,
  ): ReadableCollection<K, V> {
    const entries: Array<[K, V]> = [];
    let skip = true;

    for (const [key, value] of this.data) {
      if (skip && !predicate(value, key)) {
        skip = false;
      }
      if (!skip) {
        entries.push([key, value]);
      }
    }

    return this.createNew(entries);
  }

  /**
   * Take elements while predicate is true
   */
  takeWhile(
    predicate: (value: V, key: K) => boolean,
  ): ReadableCollection<K, V> {
    const entries: Array<[K, V]> = [];

    for (const [key, value] of this.data) {
      if (!predicate(value, key)) {
        break;
      }
      entries.push([key, value]);
    }

    return this.createNew(entries);
  }

  /**
   * Group values by a grouping function
   */
  groupBy<G>(
    grouper: (value: V, key: K) => G,
  ): Map<G, ReadableCollection<K, V>> {
    const groups = new Map<G, Array<[K, V]>>();

    for (const [key, value] of this.data) {
      const group = grouper(value, key);
      let bucket = groups.get(group);
      if (!bucket) {
        bucket = [];
        groups.set(group, bucket);
      }
      bucket.push([key, value]);
    }

    const result = new Map<G, ReadableCollection<K, V>>();
    for (const [group, entries] of groups) {
      result.set(group, this.createNew(entries));
    }

    return result;
  }

  /**
   * Count values by a grouping function
   */
  countBy<G>(grouper: (value: V, key: K) => G): Map<G, number> {
    const counts = new Map<G, number>();

    for (const [key, value] of this.data) {
      const group = grouper(value, key);
      counts.set(group, (counts.get(group) || 0) + 1);
    }

    return counts;
  }

  /**
   * Get unique values
   */
  unique(): ReadableCollection<K, V> {
    const seen = new Set<V>();
    const entries: Array<[K, V]> = [];

    for (const [key, value] of this.data) {
      if (!seen.has(value)) {
        seen.add(value);
        entries.push([key, value]);
      }
    }

    return this.createNew(entries);
  }

  /**
   * Get unique values by selector
   */
  uniqueBy<U>(selector: (value: V, key: K) => U): ReadableCollection<K, V> {
    const seen = new Set<U>();
    const entries: Array<[K, V]> = [];

    for (const [key, value] of this.data) {
      const selected = selector(value, key);
      if (!seen.has(selected)) {
        seen.add(selected);
        entries.push([key, value]);
      }
    }

    return this.createNew(entries);
  }
}

/**
 * Apply batch operations mixin to a collection
 */
export function withBatchOps<
  K,
  V,
  T extends ReadableCollection<K, V> &
    (Partial<{ data: Map<K, V> }> | HasInternalData<K, V>),
>(
  target: T,
  createNew: (entries: Iterable<[K, V]>) => T,
  isImmutable: boolean = false,
): T & BatchOps<K, V> {
  const mapAccessor = ((): Map<K, V> => {
    const anyTarget = target as unknown as {
      data?: Map<K, V>;
    } & HasInternalData<K, V>;
    if (
      typeof (anyTarget as HasInternalData<K, V>)[INTERNAL_DATA] === 'function'
    ) {
      return (anyTarget as HasInternalData<K, V>)[INTERNAL_DATA]();
    }
    if (anyTarget.data instanceof Map) {
      return anyTarget.data as Map<K, V>;
    }
    // Fallback: materialize
    return new Map<K, V>(target.entries());
  })();

  const mixin = new BatchOpsMixin<K, V>(
    mapAccessor,
    createNew as (entries: Iterable<[K, V]>) => ReadableCollection<K, V>,
    isImmutable,
  );

  // Bind methods explicitly to avoid unsafe any calls

  Object.defineProperty(target, 'withMutations', {
    value: function (
      mutator: (
        mutable: ReadableCollection<K, V> & WritableCollection<K, V>,
      ) => void,
    ): ReadableCollection<K, V> {
      if (!isImmutable && isMutableCollection(target)) {
        // For mutable collections, apply mutations directly
        mutator(target);
        return target;
      }

      // For immutable collections, create a mutable copy, apply mutations, and return new immutable
      const builder = new MutableCollection<K, V>(mapAccessor);
      mutator(builder);
      return createNew(builder.entries());
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'asMutable', {
    value: function (): ReadableCollection<K, V> {
      if (!isImmutable) {
        // Already mutable, return self
        return target;
      }
      // Convert immutable to mutable with BatchOps
      // Important: create a copy of the data so mutations don't affect the original
      const mutable = new MutableCollection<K, V>(new Map(mapAccessor));
      const mutableCreateNew = (es: Iterable<[K, V]>) =>
        new MutableCollection<K, V>(es);
      // Add BatchOps to the mutable collection
      return withBatchOps(mutable, mutableCreateNew, false);
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'asImmutable', {
    value: function (): ReadableCollection<K, V> {
      if (isImmutable) {
        // Already immutable, return self
        return target;
      }
      // Convert mutable to immutable - create proper ImmutableCollection
      const immutable = new ImmutableCollection<K, V>(mapAccessor);
      const immutableCreateNew = (es: Iterable<[K, V]>) =>
        new ImmutableCollection<K, V>(es);
      // Add BatchOps to the immutable collection
      return withBatchOps(immutable, immutableCreateNew, true);
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'toSeq', {
    value: mixin.toSeq.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'toKeyedSeq', {
    value: mixin.toKeyedSeq.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'toIndexedSeq', {
    value: mixin.toIndexedSeq.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'toSetSeq', {
    value: mixin.toSetSeq.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'flip', {
    value: mixin.flip.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'skipWhile', {
    value: mixin.skipWhile.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'takeWhile', {
    value: mixin.takeWhile.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'groupBy', {
    value: mixin.groupBy.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'countBy', {
    value: mixin.countBy.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'unique', {
    value: mixin.unique.bind(mixin),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, 'uniqueBy', {
    value: mixin.uniqueBy.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  return target as T & BatchOps<K, V>;
}
