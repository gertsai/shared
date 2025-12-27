/**
 * Factory functions for creating collections
 * Provides consistent way to create collection instances
 */

import { BaseCollection } from '../core/BaseCollection';
import { ImmutableCollection } from '../core/ImmutableCollection';
import { MutableCollection } from '../core/MutableCollection';
import type { ReadableCollection } from '../types/interfaces';

/**
 * Creates a collection instance based on the source type
 * Preserves the mutability characteristic of the source
 */
export function createCollectionFrom<K, V>(
  source: ReadableCollection<K, V> | Map<K, V>,
  entries: Iterable<[K, V]>,
): ReadableCollection<K, V> {
  // Check if source is immutable
  if (ImmutableCollection.isImmutable(source)) {
    return new ImmutableCollection(entries);
  }

  // Check if source is mutable collection
  if (source instanceof MutableCollection) {
    return new MutableCollection(entries);
  }

  // Check if source is base collection
  if (source instanceof BaseCollection) {
    return new BaseCollection(entries);
  }

  // Default to mutable for Map and unknown types
  return new MutableCollection(entries);
}

/**
 * Creates a collection with entries filtered by predicate
 */
export function createFilteredCollection<K, V>(
  source: ReadableCollection<K, V>,
  predicate: (value: V, key: K, index: number) => boolean,
): ReadableCollection<K, V> {
  const filtered: Array<[K, V]> = [];
  let index = 0;

  for (const [key, value] of source.entries()) {
    if (predicate(value, key, index++)) {
      filtered.push([key, value]);
    }
  }

  return createCollectionFrom(source, filtered);
}

/**
 * Creates a collection with mapped values
 */
export function createMappedValuesCollection<K, V, R>(
  source: ReadableCollection<K, V>,
  mapper: (value: V, key: K) => R,
): ReadableCollection<K, R> {
  const mapped = new Map<K, R>();

  for (const [key, value] of source.entries()) {
    mapped.set(key, mapper(value, key));
  }

  // Create new collection of same type but with new value type
  if (ImmutableCollection.isImmutable(source)) {
    return new ImmutableCollection(mapped);
  }

  if (source instanceof MutableCollection) {
    return new MutableCollection(mapped);
  }

  return new BaseCollection(mapped);
}

/**
 * Creates a collection with mapped keys
 */
export function createMappedKeysCollection<K, V, NK>(
  source: ReadableCollection<K, V>,
  mapper: (key: K, value: V) => NK,
): ReadableCollection<NK, V> {
  const mapped = new Map<NK, V>();

  for (const [key, value] of source.entries()) {
    const newKey = mapper(key, value);
    mapped.set(newKey, value);
  }

  // Create new collection of same type but with new key type
  if (ImmutableCollection.isImmutable(source)) {
    return new ImmutableCollection(mapped);
  }

  if (source instanceof MutableCollection) {
    return new MutableCollection(mapped);
  }

  return new BaseCollection(mapped);
}

/**
 * Creates an empty collection of the same type as source
 */
export function createEmptyLike<K, V>(
  source: ReadableCollection<K, V>,
): ReadableCollection<K, V> {
  if (ImmutableCollection.isImmutable(source)) {
    return new ImmutableCollection<K, V>();
  }

  if (source instanceof MutableCollection) {
    return new MutableCollection<K, V>();
  }

  return new BaseCollection<K, V>();
}

/**
 * Ensures the input is a collection
 */
export function ensureCollection<K, V>(
  input: ReadableCollection<K, V> | Map<K, V> | Iterable<[K, V]>,
): ReadableCollection<K, V> {
  if ('get' in input && 'has' in input && 'size' in input) {
    return input as ReadableCollection<K, V>;
  }

  if (input instanceof Map) {
    return new MutableCollection(input);
  }

  // Iterable case
  return new MutableCollection(input);
}
