/**
 * Mixin for positional access operations
 * Provides methods for accessing collection elements by index
 * Following SOLID principle - Single Responsibility
 */

import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';

import { defineProtoMethod } from './prototype';

/**
 * Interface for positional access operations
 */
export interface PositionalAccessOps<K, V> {
  at(index: number): V | undefined;
  keyAt(index: number): K | undefined;
  firstKey(): K | undefined;
  lastKey(): K | undefined;
  firstEntry(): [K, V] | undefined;
  lastEntry(): [K, V] | undefined;
}

/**
 * Implementation of positional access operations
 */
export class PositionalAccessMixin<K, V> implements PositionalAccessOps<K, V> {
  constructor(private readonly data: Map<K, V>) {}

  /**
   * Get value at specific index
   */
  at(index: number): V | undefined {
    if (!Number.isFinite(index)) {
      return undefined;
    }
    const size = this.data.size;
    let i = Math.trunc(index);
    if (i < 0) {
      i = size + i;
    }
    if (i < 0 || i >= size) {
      return undefined;
    }
    let c = 0;
    for (const v of this.data.values()) {
      if (c === i) {
        return v;
      }
      c++;
    }
    return undefined;
  }

  /**
   * Get key at specific index
   */
  keyAt(index: number): K | undefined {
    if (!Number.isFinite(index)) {
      return undefined;
    }
    const size = this.data.size;
    let i = Math.trunc(index);
    if (i < 0) {
      i = size + i;
    }
    if (i < 0 || i >= size) {
      return undefined;
    }
    let c = 0;
    for (const k of this.data.keys()) {
      if (c === i) {
        return k;
      }
      c++;
    }
    return undefined;
  }

  /**
   * Get first key
   */
  firstKey(): K | undefined {
    return this.data.keys().next().value;
  }

  /**
   * Get last key
   */
  lastKey(): K | undefined {
    let last: K | undefined = undefined;
    for (const k of this.data.keys()) {
      last = k;
    }
    return last;
  }

  /**
   * Get first entry
   */
  firstEntry(): [K, V] | undefined {
    const first = this.data.entries().next();
    return first.done ? undefined : first.value;
  }

  /**
   * Get last entry
   */
  lastEntry(): [K, V] | undefined {
    let last: [K, V] | undefined = undefined;
    for (const e of this.data.entries()) {
      last = e;
    }
    return last;
  }
}

/**
 * Apply positional access mixin to a collection
 */

export function withPositionalAccess<
  K,
  V,
  T extends Partial<{ data: Map<K, V> }> | HasInternalData<K, V>,
>(
  target: T,
  _createNew?: (entries: Iterable<[K, V]>) => T,
): T & PositionalAccessOps<K, V> {
  void _createNew; // Currently unused but kept for API compatibility
  // Feature flag: enable prototype-based augmentation (opt-in, off by default)
  const useProtoMixins =
    (typeof process !== 'undefined' &&
      (process.env?.ORCH_COLLECTION_USE_PROTO_MIXINS === '1' ||
        process.env?.ORCH_COLLECTION_USE_PROTO_MIXINS === 'true')) ||
    (globalThis as unknown as Record<string, unknown>)
      .__ORCH_COLLECTION_USE_PROTO_MIXINS__ === true;

  if (useProtoMixins) {
    const ctor = (
      target as unknown as { constructor?: new (...args: any[]) => any }
    ).constructor;
    if (typeof ctor === 'function') {
      augmentPositionalAccessPrototype(ctor);
    }
    return target as T & PositionalAccessOps<K, V>;
  }

  const data: Map<K, V> = (() => {
    const anyTarget = target as unknown as {
      data?: Map<K, V>;
    } & HasInternalData<K, V>;
    if (typeof anyTarget[INTERNAL_DATA] === 'function') {
      return anyTarget[INTERNAL_DATA]();
    }
    return anyTarget.data ?? new Map<K, V>();
  })();
  const mixin = new PositionalAccessMixin<K, V>(data);

  Object.defineProperty(target, 'at', {
    value: mixin.at.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'keyAt', {
    value: mixin.keyAt.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'firstKey', {
    value: mixin.firstKey.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'lastKey', {
    value: mixin.lastKey.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'firstEntry', {
    value: mixin.firstEntry.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'lastEntry', {
    value: mixin.lastEntry.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  return target as T & PositionalAccessOps<K, V>;
}

/**
 * Prototype-based augmentation: Adds PositionalAccessOps methods to a class prototype.
 * Does not modify existing instances directly; safe to call multiple times.
 */
export function augmentPositionalAccessPrototype<
  T extends new (...args: any[]) => any,
>(ctor: T): void {
  const getData = function <K, V>(
    this: HasInternalData<K, V> & { data?: Map<K, V> },
  ): Map<K, V> {
    if (typeof this[INTERNAL_DATA] === 'function') {
      return this[INTERNAL_DATA]();
    }
    return (this.data as Map<K, V>) ?? new Map<K, V>();
  };

  defineProtoMethod(ctor, 'at', function (this: any, index: number) {
    const data = getData.call(this);
    if (!Number.isFinite(index)) {
      return undefined;
    }
    const size = data.size;
    let i = Math.trunc(index);
    if (i < 0) {
      i = size + i;
    }
    if (i < 0 || i >= size) {
      return undefined;
    }
    let c = 0;
    for (const v of data.values()) {
      if (c === i) {
        return v;
      }
      c++;
    }
    return undefined;
  });

  defineProtoMethod(ctor, 'keyAt', function (this: any, index: number) {
    const data = getData.call(this);
    if (!Number.isFinite(index)) {
      return undefined;
    }
    const size = data.size;
    let i = Math.trunc(index);
    if (i < 0) {
      i = size + i;
    }
    if (i < 0 || i >= size) {
      return undefined;
    }
    let c = 0;
    for (const k of data.keys()) {
      if (c === i) {
        return k;
      }
      c++;
    }
    return undefined;
  });

  defineProtoMethod(ctor, 'firstKey', function (this: any) {
    const data = getData.call(this);
    return data.keys().next().value;
  });

  defineProtoMethod(ctor, 'lastKey', function (this: any) {
    const data = getData.call(this);
    let last: unknown = undefined;
    for (const k of data.keys()) {
      last = k;
    }
    return last as unknown;
  });

  defineProtoMethod(ctor, 'firstEntry', function (this: any) {
    const data = getData.call(this);
    const first = data.entries().next();
    return first.done ? undefined : first.value;
  });

  defineProtoMethod(ctor, 'lastEntry', function (this: any) {
    const data = getData.call(this);
    let last: unknown = undefined;
    for (const e of data.entries()) {
      last = e;
    }
    return last as unknown;
  });
}
