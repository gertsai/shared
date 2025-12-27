/**
 * Factory functions for creating collections with mixins
 * Following SOLID principle - Open/Closed Principle
 */

import type { BatchOps } from '../mixins/BatchOps';
import { withBatchOps } from '../mixins/BatchOps';
import type { DeepOps } from '../mixins/DeepOps';
import { withDeepOps } from '../mixins/DeepOps';
import type { ExtendedOps } from '../mixins/ExtendedOps';
import type { PositionalAccessOps } from '../mixins/PositionalAccess';
import { withPositionalAccess } from '../mixins/PositionalAccess';

import { ImmutableCollection } from './ImmutableCollection';
import { MutableCollection } from './MutableCollection';
import { PersistentCollection } from './PersistentCollection';

/**
 * Options for creating a collection
 */
export interface CollectionOptions {
  /** Whether the collection should be immutable */
  immutable?: boolean;
  /** Engine for immutable collections */
  immutableEngine?: 'map' | 'hamt';
  /**
   * Enable extended operations (random, sweep, tap, etc.).
   * Note: ExtendedOps are already available for mutable collections.
   * Note: This flag has no effect for immutable collections (both 'map' and 'hamt').
   */
  withExtended?: boolean;
  /** Enable batch operations (withMutations, groupBy, etc.) */
  withBatch?: boolean;
  /** Enable deep operations (getIn, setIn, mergeDeep, etc.) */
  withDeep?: boolean;
  /** Enable positional access operations (first, last, at, etc.) */
  withPositional?: boolean;
  /** Enable all mixins */
  withAll?: boolean;
}

// Type to build the collection type based on options
type CollectionWithMixins<
  K,
  V,
  Options extends CollectionOptions,
> = (Options['immutable'] extends true
  ? Options['immutableEngine'] extends 'hamt'
    ? PersistentCollection<K, V>
    : ImmutableCollection<K, V>
  : MutableCollection<K, V>) &
  // Mixins disabled for HAMT engine
  // ExtendedOps are available ONLY for mutable collections
  (Options['withExtended'] extends true
    ? Options['immutable'] extends true
      ? Record<never, never>
      : ExtendedOps<K, V>
    : Record<never, never>) &
  (Options['withBatch'] extends true
    ? Options['immutable'] extends true
      ? Options['immutableEngine'] extends 'hamt'
        ? Record<never, never>
        : BatchOps<K, V>
      : BatchOps<K, V>
    : Record<never, never>) &
  (Options['withDeep'] extends true
    ? Options['immutable'] extends true
      ? Options['immutableEngine'] extends 'hamt'
        ? Record<never, never>
        : DeepOps<K, V>
      : DeepOps<K, V>
    : Record<never, never>) &
  (Options['withPositional'] extends true
    ? Options['immutable'] extends true
      ? Options['immutableEngine'] extends 'hamt'
        ? Record<never, never>
        : PositionalAccessOps<K, V>
      : PositionalAccessOps<K, V>
    : Record<never, never>) &
  // withAll: for immutable("map") includes batch/deep/positional; ExtendedOps excluded
  (Options['withAll'] extends true
    ? Options['immutable'] extends true
      ? Options['immutableEngine'] extends 'hamt'
        ? Record<never, never>
        : BatchOps<K, V> & DeepOps<K, V> & PositionalAccessOps<K, V>
      : ExtendedOps<K, V> &
          BatchOps<K, V> &
          DeepOps<K, V> &
          PositionalAccessOps<K, V>
    : Record<never, never>);

/**
 * Create a collection with specified mixins
 */
export function createCollection<
  K,
  V,
  O extends CollectionOptions = CollectionOptions,
>(
  entries?: Iterable<[K, V]> | Map<K, V>,
  options?: O,
): CollectionWithMixins<K, V, O> {
  const {
    immutable = false,
    immutableEngine = 'hamt',
    withExtended: _withExtended = false,
    withBatch = false,
    withDeep = false,
    withPositional = false,
    withAll = false,
  } = options || ({} as O);

  // Dev warning: withExtended has no effect for immutable collections
  if (
    _withExtended &&
    immutable &&
    (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production')
  ) {
    console.warn(
      '[collection] withExtended option has no effect for immutable collections (map/hamt).',
    );
  }

  // Mutable branch
  if (!immutable) {
    let c = new MutableCollection<K, V>(entries);
    const createNew = (es: Iterable<[K, V]>) => new MutableCollection<K, V>(es);

    // ExtendedOps in MutableCollection are implemented as class methods (random, sweep, ensure, etc.)
    // Therefore, we do not apply the mixin to avoid duplication and conflicts.
    if (withAll || withBatch) {
      c = withBatchOps<K, V, MutableCollection<K, V>>(c, createNew, false);
    }
    if (withAll || withDeep) {
      c = withDeepOps(c, createNew, false);
    }
    if (withAll || withPositional) {
      c = withPositionalAccess(c, createNew);
    }
    return c as unknown as CollectionWithMixins<K, V, O>;
  }

  // Immutable HAMT branch (mixins disabled)
  if (immutableEngine === 'hamt') {
    const c = new PersistentCollection<K, V>(entries);
    return c as unknown as CollectionWithMixins<K, V, O>;
  }

  // Immutable Map branch
  let c = new ImmutableCollection<K, V>(entries);
  const createNew = (es: Iterable<[K, V]>) => new ImmutableCollection<K, V>(es);

  // ExtendedOps intentionally disabled for immutable
  if (withAll || withBatch) {
    c = withBatchOps<K, V, ImmutableCollection<K, V>>(c, createNew, true);
  }
  if (withAll || withDeep) {
    c = withDeepOps(c, createNew, true);
  }
  if (withAll || withPositional) {
    c = withPositionalAccess(c, createNew);
  }

  return c as unknown as CollectionWithMixins<K, V, O>;
}

/**
 * Create a mutable collection with all mixins
 */
export function createMutableCollection<K, V>(
  entries?: Iterable<[K, V]> | Map<K, V>,
): MutableCollection<K, V> &
  ExtendedOps<K, V> &
  BatchOps<K, V> &
  DeepOps<K, V> &
  PositionalAccessOps<K, V> {
  return createCollection(entries, {
    immutable: false,
    withAll: true,
  });
}

/**
 * Create an immutable collection with all mixins
 */
export function createImmutableCollection<K, V>(
  entries?: Iterable<[K, V]> | Map<K, V>,
): ImmutableCollection<K, V> &
  BatchOps<K, V> &
  DeepOps<K, V> &
  PositionalAccessOps<K, V> {
  return createCollection(entries, {
    immutable: true,
    immutableEngine: 'map', // Use 'map' engine to enable mixins
    withAll: true,
  });
}

/**
 * Create a lightweight mutable collection without mixins
 */
export function createLightweightCollection<K, V>(
  entries?: Iterable<[K, V]> | Map<K, V>,
): MutableCollection<K, V> {
  return new MutableCollection(entries);
}

/**
 * Create a lightweight immutable collection without mixins
 */
export function createLightweightImmutableCollection<K, V>(
  entries?: Iterable<[K, V]> | Map<K, V>,
): ImmutableCollection<K, V> {
  return new ImmutableCollection(entries);
}
