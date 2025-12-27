/**
 * Deep operations mixin for collections
 * Provides methods for deep merging, updating, and accessing nested values
 * Following SOLID principle - Single Responsibility
 */

import type { ReadableCollection } from '../types/interfaces';
import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';
import { deepClone, deepMerge, isPlainObject } from '../utils/helpers';

/**
 * Interface for deep operations
 */
export interface DeepOps<K, V> {
  // Deep access operations
  getIn<T = unknown>(path: ReadonlyArray<K | string | number>): T | undefined;
  hasIn(path: ReadonlyArray<K | string | number>): boolean;

  // Deep update operations (for immutable collections)
  setIn<T = unknown>(path: ReadonlyArray<K | string | number>, value: T): this;
  updateIn<T = unknown>(
    path: ReadonlyArray<K | string | number>,
    updater: (value: T | undefined) => T,
  ): this;
  deleteIn(path: ReadonlyArray<K | string | number>): this;

  // Deep merge operations
  mergeDeep(...collections: Array<Map<K, V> | Iterable<[K, V]>>): this;
  mergeDeepWith(
    merger: (existing: unknown, incoming: unknown, key: unknown) => unknown,
    ...collections: Array<Map<K, V> | Iterable<[K, V]>>
  ): this;
}

/**
 * Implementation of deep operations
 */
export class DeepOpsMixin<K, V> {
  constructor(
    private readonly data: Map<K, V>,
    private readonly createNew: (
      entries: Iterable<[K, V]>,
    ) => ReadableCollection<K, V>,
    private readonly isImmutable: boolean = false,
    private readonly options: { compactArrays?: boolean } = {},
  ) {}

  /**
   * Get value at nested path
   */
  getIn<T = unknown>(path: ReadonlyArray<K | string | number>): T | undefined {
    if (path.length === 0) {
      return undefined;
    }

    let current: unknown = this.data.get(path[0] as K);

    for (let i = 1; i < path.length; i++) {
      if (current == null) {
        return undefined;
      }

      const key = path[i];
      if (current instanceof Map) {
        current = (current as Map<unknown, unknown>).get(key as unknown);
      } else if (typeof current === 'object') {
        current = (current as Record<string | number, unknown>)[
          key as string | number
        ];
      } else {
        return undefined;
      }
    }

    return current as T | undefined;
  }

  /**
   * Check if value exists at nested path
   */
  hasIn(path: Array<K | string | number>): boolean {
    return this.getIn(path) !== undefined;
  }

  /**
   * Set value at nested path (immutable operation)
   */
  setIn<T = unknown>(
    path: ReadonlyArray<K | string | number>,
    value: T,
  ): ReadableCollection<K, V> {
    if (path.length === 0) {
      return this.createNew(this.data);
    }

    const entries = new Map(this.data);

    if (path.length === 1) {
      entries.set(path[0] as K, value as unknown as V);
      return this.createNew(entries);
    }

    const key = path[0] as K;
    const restPath = path.slice(1);
    const currentValue = entries.get(key);

    const newValue = this.setInRecursive(currentValue, restPath, value);
    entries.set(key, newValue as unknown as V);

    return this.createNew(entries);
  }

  /**
   * Update value at nested path with updater function
   */
  updateIn<T = unknown>(
    path: ReadonlyArray<K | string | number>,
    updater: (value: T | undefined) => T,
  ): ReadableCollection<K, V> {
    const currentValue = this.getIn<T>(path);
    const newValue = updater(currentValue);
    return this.setIn<T>(path, newValue);
  }

  /**
   * Delete value at nested path
   */
  deleteIn(path: ReadonlyArray<K | string | number>): ReadableCollection<K, V> {
    if (path.length === 0) {
      return this.createNew(this.data);
    }

    const entries = new Map(this.data);

    if (path.length === 1) {
      entries.delete(path[0] as K);
      return this.createNew(entries);
    }

    const key = path[0] as K;
    const restPath = path.slice(1);
    const currentValue = entries.get(key);

    const newValue = this.deleteInRecursive(currentValue, restPath);
    if (newValue !== undefined) {
      entries.set(key, newValue as unknown as V);
    } else {
      entries.delete(key);
    }

    return this.createNew(entries);
  }

  /**
   * Deep merge multiple collections
   */
  mergeDeep(
    ...collections: Array<Map<K, V> | Iterable<[K, V]>>
  ): ReadableCollection<K, V> {
    const result = new Map(this.data);

    for (const collection of collections) {
      const entries =
        collection instanceof Map ? collection : new Map(collection);

      for (const [key, incoming] of entries) {
        const existing = result.get(key);

        if (isPlainObject(existing) && isPlainObject(incoming)) {
          result.set(
            key,
            deepMerge(
              existing as Record<string, unknown>,
              incoming as Record<string, unknown>,
            ) as unknown as V,
          );
        } else if (existing instanceof Map && incoming instanceof Map) {
          const merged = new Map(existing);
          for (const [k, v] of incoming) {
            merged.set(k, v);
          }
          result.set(key, merged as unknown as V);
        } else {
          result.set(key, deepClone(incoming));
        }
      }
    }

    return this.createNew(result);
  }

  /**
   * Deep merge with custom merger function
   */
  mergeDeepWith(
    merger: (existing: unknown, incoming: unknown, key: unknown) => unknown,
    ...collections: Array<Map<K, V> | Iterable<[K, V]>>
  ): ReadableCollection<K, V> {
    const result = new Map(this.data);

    for (const collection of collections) {
      const entries =
        collection instanceof Map ? collection : new Map(collection);

      for (const [key, incoming] of entries) {
        if (result.has(key)) {
          const existing = result.get(key);
          // Deep merge with custom merger
          const merged = this.deepMergeWithMerger(
            existing as unknown,
            incoming as unknown,
            merger,
            key as unknown,
          );
          if (merged !== undefined) {
            result.set(key, merged as unknown as V);
          }
        } else {
          result.set(key, deepClone(incoming));
        }
      }
    }

    return this.createNew(result);
  }

  /**
   * Helper function for deep merging with a custom merger
   */
  private deepMergeWithMerger(
    existing: unknown,
    incoming: unknown,
    merger: (existing: unknown, incoming: unknown, key: unknown) => unknown,
    key: unknown,
  ): unknown {
    // Both are plain objects - recursively merge
    if (isPlainObject(existing) && isPlainObject(incoming)) {
      const result: Record<string, unknown> = {
        ...(existing as Record<string, unknown>),
      };

      for (const prop in incoming as Record<string, unknown>) {
        const incomingValue = (incoming as Record<string, unknown>)[prop];
        const existingValue = (existing as Record<string, unknown>)[prop];

        if (prop in (existing as Record<string, unknown>)) {
          // Property exists in both - merge recursively
          result[prop] = this.deepMergeWithMerger(
            existingValue,
            incomingValue,
            merger,
            prop,
          );
        } else {
          // Property only in incoming - add it
          result[prop] = deepClone(incomingValue);
        }
      }

      return result;
    }

    // Let merger decide for non-object values
    return merger(existing, incoming, key);
  }

  /**
   * Recursive helper for setIn
   */
  private setInRecursive(
    current: unknown,
    path: Array<unknown>,
    value: unknown,
  ): unknown {
    if (path.length === 0) {
      return value;
    }

    const key = path[0] as string | number | K;
    const restPath = path.slice(1);

    if (current instanceof Map) {
      const newMap = new Map(current as Map<unknown, unknown>);
      const next = this.setInRecursive(
        newMap.get(key as unknown),
        restPath,
        value,
      );
      newMap.set(key as unknown, next);
      return newMap;
    }

    if (isPlainObject(current)) {
      return {
        ...(current as Record<string | number, unknown>),
        [key as string | number]: this.setInRecursive(
          (current as Record<string | number, unknown>)[key as string | number],
          restPath,
          value,
        ),
      };
    }

    // Create new container if current is not a container
    if (typeof key === 'number') {
      const arr = Array.isArray(current)
        ? ([...current] as unknown[])
        : ([] as unknown[]);
      arr[key] = this.setInRecursive(arr[key], restPath, value);
      return arr;
    } else {
      return {
        [key as string]: this.setInRecursive(undefined, restPath, value),
      };
    }
  }

  /**
   * Recursive helper for deleteIn
   */
  private deleteInRecursive(current: unknown, path: Array<unknown>): unknown {
    if (path.length === 0) {
      return undefined;
    }

    const key = path[0] as string | number | K;

    if (path.length === 1) {
      if (current instanceof Map) {
        const newMap = new Map(current as Map<unknown, unknown>);
        newMap.delete(key as unknown);
        return newMap.size > 0 ? newMap : undefined;
      }

      if (isPlainObject(current)) {
        const obj = current as Record<string | number, unknown>;
        const result: Record<string | number, unknown> = {};
        for (const k in obj) {
          if (k !== String(key)) {
            result[k] = obj[k];
          }
        }
        return Object.keys(result).length > 0 ? result : undefined;
      }

      if (Array.isArray(current)) {
        const arr = [...(current as unknown[])];
        arr[key as number] = undefined as unknown;
        if (this.options.compactArrays) {
          const compacted = arr.filter((v) => v !== undefined);
          return compacted.length > 0 ? compacted : undefined;
        }
        return arr.some((v) => v !== undefined) ? arr : undefined;
      }

      return current;
    }

    const restPath = path.slice(1);

    if (current instanceof Map) {
      const newMap = new Map(current as Map<unknown, unknown>);
      const newValue = this.deleteInRecursive(
        newMap.get(key as unknown),
        restPath,
      );
      if (newValue !== undefined) {
        newMap.set(key as unknown, newValue);
      } else {
        newMap.delete(key as unknown);
      }
      return newMap.size > 0 ? newMap : undefined;
    }

    if (isPlainObject(current)) {
      const newValue = this.deleteInRecursive(
        (current as Record<string | number, unknown>)[key as string | number],
        restPath,
      );
      if (newValue !== undefined) {
        return {
          ...(current as Record<string | number, unknown>),
          [key as string | number]: newValue,
        };
      } else {
        const obj = current as Record<string | number, unknown>;
        const result: Record<string | number, unknown> = {};
        for (const k in obj) {
          if (k !== String(key)) {
            result[k] = obj[k];
          }
        }
        return Object.keys(result).length > 0 ? result : undefined;
      }
    }

    if (Array.isArray(current)) {
      const index = key as number;
      const arr = [...(current as unknown[])];
      const newVal = this.deleteInRecursive(arr[index], restPath);
      if (newVal !== undefined) {
        arr[index] = newVal;
      } else {
        arr[index] = undefined as unknown;
      }
      if (this.options.compactArrays) {
        const compacted = arr.filter((v) => v !== undefined);
        return compacted.length > 0 ? compacted : undefined;
      }
      return arr.some((v) => v !== undefined) ? arr : undefined;
    }

    return current;
  }
}

/**
 * Apply deep operations mixin to a collection
 */
export function withDeepOps<
  T extends ReadableCollection<any, any> &
    (Partial<{ data: Map<any, any> }> | HasInternalData<any, any>),
>(
  target: T,
  createNew: (entries: Iterable<[any, any]>) => T,
  isImmutable: boolean = false,
  options: { compactArrays?: boolean } = {},
): T & DeepOps<any, any> {
  const mapAccessor = ((): Map<any, any> => {
    const anyTarget = target as unknown as {
      data?: Map<any, any>;
    } & HasInternalData<any, any>;
    if (
      typeof (anyTarget as HasInternalData<any, any>)[INTERNAL_DATA] ===
      'function'
    ) {
      return (anyTarget as HasInternalData<any, any>)[INTERNAL_DATA]();
    }
    if (anyTarget.data instanceof Map) {
      return anyTarget.data as Map<any, any>;
    }
    return new Map<any, any>(target.entries());
  })();

  const mixin = new DeepOpsMixin(mapAccessor, createNew, isImmutable, options);

  const methods = [
    'getIn',
    'hasIn',
    'setIn',
    'updateIn',
    'deleteIn',
    'mergeDeep',
    'mergeDeepWith',
  ] as const satisfies ReadonlyArray<keyof DeepOps<any, any>>;

  for (const method of methods) {
    const fn = (mixin as unknown as Record<string, unknown>)[
      method as string
    ] as unknown as (...args: unknown[]) => unknown;
    Object.defineProperty(target, method, {
      value: fn.bind(mixin),
      enumerable: false,
      configurable: true,
    });
  }

  return target as T & DeepOps<any, any>;
}
