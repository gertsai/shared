// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 14.1 (PRD-044 / EVID-057) — unit tests for {@link LruMap}.
 *
 * Goals:
 *  - basic CRUD parity with `Map<K, V>`.
 *  - insertion-order recency touch on `get`.
 *  - eviction on `set` of NEW key when at capacity.
 *  - legacy positional constructor signature (back-compat with
 *    `@gertsai/collection` `LRUCache(maxSize)`).
 *  - `maxSize: 0` disables caching entirely.
 *  - `has` does NOT touch recency (legacy semantics).
 */
import { describe, it, expect } from 'vitest';
import { LruMap } from '../lru-map';

describe('LruMap — construction', () => {
  it('defaults to maxSize=100 with no args', () => {
    const m = new LruMap<string, number>();
    for (let i = 0; i < 100; i++) m.set(`k${i}`, i);
    expect(m.size).toBe(100);
    m.set('overflow', 999);
    expect(m.size).toBe(100);
    expect(m.has('k0')).toBe(false); // evicted
  });

  it('accepts positional number signature (legacy LRUCache(n))', () => {
    const m = new LruMap<string, number>(3);
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.set('d', 4);
    expect(m.size).toBe(3);
    expect(m.has('a')).toBe(false);
  });

  it('accepts options object signature', () => {
    const m = new LruMap<string, number>({ maxSize: 2 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect(m.size).toBe(2);
    expect(m.has('a')).toBe(false);
  });

  it('clamps negative maxSize to 0 (no caching)', () => {
    const m = new LruMap<string, number>(-5);
    m.set('a', 1);
    expect(m.size).toBe(0);
  });
});

describe('LruMap — set / get / has / delete / clear', () => {
  it('get returns undefined for missing keys', () => {
    const m = new LruMap<string, number>();
    expect(m.get('missing')).toBeUndefined();
  });

  it('has returns true for live entries, false for missing', () => {
    const m = new LruMap<string, number>();
    m.set('a', 1);
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(false);
  });

  it('delete returns true on hit, false on miss; size updates', () => {
    const m = new LruMap<string, number>();
    m.set('a', 1);
    expect(m.delete('a')).toBe(true);
    expect(m.size).toBe(0);
    expect(m.delete('a')).toBe(false);
  });

  it('clear resets size to 0', () => {
    const m = new LruMap<string, number>();
    m.set('a', 1);
    m.set('b', 2);
    expect(m.size).toBe(2);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.get('a')).toBeUndefined();
  });

  it('set on existing key updates value without growing size', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('a', 2);
    expect(m.size).toBe(1);
    expect(m.get('a')).toBe(2);
  });

  it('maxSize=0 disables caching entirely', () => {
    const m = new LruMap<string, number>(0);
    m.set('a', 1);
    m.set('b', 2);
    expect(m.size).toBe(0);
    expect(m.get('a')).toBeUndefined();
    expect(m.has('a')).toBe(false);
  });

  it('stores undefined values without confusing get with miss', () => {
    const m = new LruMap<string, undefined>(2);
    m.set('a', undefined);
    expect(m.has('a')).toBe(true);
    expect(m.get('a')).toBeUndefined();
    expect(m.has('b')).toBe(false);
  });
});

describe('LruMap — LRU eviction order', () => {
  it('evicts oldest when adding N+1 with maxSize=N', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.set('d', 4); // pushes out 'a'
    expect(m.has('a')).toBe(false);
    expect(m.has('b')).toBe(true);
    expect(m.has('c')).toBe(true);
    expect(m.has('d')).toBe(true);
    expect(m.size).toBe(3);
  });

  it('get touches LRU: oldest-accessed evicted, not first-inserted', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect(m.get('a')).toBe(1); // touch
    m.set('d', 4); // should evict 'b' now
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(false);
    expect(m.has('c')).toBe(true);
    expect(m.has('d')).toBe(true);
  });

  it('peek does NOT touch LRU (observability accessor)', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect(m.peek('a')).toBe(1);
    m.set('d', 4); // 'a' still oldest → evicted
    expect(m.has('a')).toBe(false);
    expect(m.has('b')).toBe(true);
  });

  it('peek returns undefined for misses without touching', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    expect(m.peek('missing')).toBeUndefined();
    expect(m.size).toBe(1);
  });

  it('has does NOT touch LRU (legacy LRUCache semantics)', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.has('a'); // does NOT touch
    m.set('d', 4); // evicts 'a' (the still-oldest)
    expect(m.has('a')).toBe(false);
    expect(m.has('b')).toBe(true);
    expect(m.has('c')).toBe(true);
    expect(m.has('d')).toBe(true);
  });

  it('re-setting an existing key moves it to MRU', () => {
    const m = new LruMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.set('a', 11); // refresh 'a' → MRU
    m.set('d', 4); // evicts oldest, which is now 'b'
    expect(m.has('b')).toBe(false);
    expect(m.get('a')).toBe(11);
    expect(m.has('c')).toBe(true);
    expect(m.has('d')).toBe(true);
  });
});

describe('LruMap — iteration', () => {
  it('iterates in insertion (LRU → MRU) order', () => {
    const m = new LruMap<string, number>({ maxSize: 5 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect([...m.keys()]).toEqual(['a', 'b', 'c']);
    expect([...m.values()]).toEqual([1, 2, 3]);
    expect([...m.entries()]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('default iterator yields [key, value] pairs', () => {
    const m = new LruMap<string, number>(3);
    m.set('a', 1);
    m.set('b', 2);
    expect([...m]).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('get reorders subsequent iteration', () => {
    const m = new LruMap<string, number>(3);
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.get('a'); // touch → MRU
    expect([...m.keys()]).toEqual(['b', 'c', 'a']);
  });
});
