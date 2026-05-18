// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 14.1 (PRD-044 / EVID-057) — unit tests for {@link LruTtlMap}.
 *
 * Ported from `@gertsai/auth-openfga/src/internal/lru-ttl-map.test.ts`
 * (Wave 7.4 / RFC-007) to keep parity. The auth-openfga test file now
 * exercises this kernel through its re-export shim and remains green.
 *
 * TTL behaviour is verified via an injected `now` clock function rather
 * than mocking globals — keeps tests deterministic and free of
 * `vi.useFakeTimers` coupling.
 */
import { describe, it, expect } from 'vitest';
import { LruTtlMap } from '../lru-ttl-map';

describe('LruTtlMap — construction & validation', () => {
  it('defaults: maxSize=1000, ttlMs=0 (no expiry), now=Date.now', () => {
    const m = new LruTtlMap<string, number>();
    expect(m.size).toBe(0);
    m.set('a', 1);
    expect(m.get('a')).toBe(1);
    expect(m.size).toBe(1);
  });

  it('accepts custom maxSize / ttlMs / now', () => {
    let t = 1_000;
    const m = new LruTtlMap<string, number>({ maxSize: 2, ttlMs: 100, now: () => t });
    m.set('a', 1);
    expect(m.get('a')).toBe(1);
    t += 50;
    expect(m.get('a')).toBe(1); // still fresh
  });

  it('throws when maxSize < 1', () => {
    expect(() => new LruTtlMap<string, number>({ maxSize: 0 })).toThrow(/maxSize/);
    expect(() => new LruTtlMap<string, number>({ maxSize: -1 })).toThrow(/maxSize/);
  });
});

describe('LruTtlMap — set / get / has / delete / clear', () => {
  it('get returns undefined for missing keys', () => {
    const m = new LruTtlMap<string, number>();
    expect(m.get('missing')).toBeUndefined();
  });

  it('has returns true for live entries, false for missing', () => {
    const m = new LruTtlMap<string, number>();
    m.set('a', 1);
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(false);
  });

  it('delete returns true on hit, false on miss; size updates', () => {
    const m = new LruTtlMap<string, number>();
    m.set('a', 1);
    expect(m.delete('a')).toBe(true);
    expect(m.size).toBe(0);
    expect(m.delete('a')).toBe(false);
  });

  it('clear resets size to 0', () => {
    const m = new LruTtlMap<string, number>();
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect(m.size).toBe(3);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.get('a')).toBeUndefined();
  });

  it('set on existing key updates value without growing size', () => {
    const m = new LruTtlMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('a', 2);
    expect(m.size).toBe(1);
    expect(m.get('a')).toBe(2);
  });
});

describe('LruTtlMap — LRU eviction order', () => {
  it('evicts oldest when adding N+1 with maxSize=N', () => {
    const m = new LruTtlMap<string, number>({ maxSize: 3 });
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
    const m = new LruTtlMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect(m.get('a')).toBe(1);
    m.set('d', 4);
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(false);
    expect(m.has('c')).toBe(true);
    expect(m.has('d')).toBe(true);
  });

  it('has touches LRU just like get (TTL-variant parity)', () => {
    const m = new LruTtlMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.has('a'); // touch
    m.set('d', 4);
    expect(m.has('b')).toBe(false);
    expect(m.has('a')).toBe(true);
  });

  it('re-setting an existing key moves it to MRU', () => {
    const m = new LruTtlMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    m.set('a', 11);
    m.set('d', 4);
    expect(m.has('b')).toBe(false);
    expect(m.get('a')).toBe(11);
    expect(m.has('c')).toBe(true);
    expect(m.has('d')).toBe(true);
  });
});

describe('LruTtlMap — TTL expiry (injected clock)', () => {
  it('expired entries are removed on get', () => {
    let t = 1_000;
    const m = new LruTtlMap<string, number>({ ttlMs: 100, now: () => t });
    m.set('a', 1);
    t += 50;
    expect(m.get('a')).toBe(1);
    t += 60;
    expect(m.get('a')).toBeUndefined();
    expect(m.size).toBe(0);
  });

  it('expired entries are removed on has', () => {
    let t = 1_000;
    const m = new LruTtlMap<string, number>({ ttlMs: 100, now: () => t });
    m.set('a', 1);
    t += 200;
    expect(m.has('a')).toBe(false);
    expect(m.size).toBe(0);
  });

  it('TTL=0 (default) disables expiry — entries live forever', () => {
    let t = 1_000;
    const m = new LruTtlMap<string, number>({ now: () => t });
    m.set('a', 1);
    t += 1_000_000_000;
    expect(m.get('a')).toBe(1);
  });

  it('set refreshes timestamp — entry survives past original TTL', () => {
    let t = 1_000;
    const m = new LruTtlMap<string, number>({ ttlMs: 100, now: () => t });
    m.set('a', 1);
    t += 80;
    m.set('a', 2);
    t += 80;
    expect(m.get('a')).toBe(2);
  });

  it('boundary: now - t === ttlMs is NOT expired (strict >)', () => {
    let t = 1_000;
    const m = new LruTtlMap<string, number>({ ttlMs: 100, now: () => t });
    m.set('a', 1);
    t += 100;
    expect(m.get('a')).toBe(1);
    t += 1;
    expect(m.get('a')).toBeUndefined();
  });
});

describe('LruTtlMap — iteration', () => {
  it('iterates [key, value] pairs in insertion order (LRU → MRU)', () => {
    const m = new LruTtlMap<string, number>({ maxSize: 3 });
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect([...m]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect([...m.entries()]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect([...m.keys()]).toEqual(['a', 'b', 'c']);
    expect([...m.values()]).toEqual([1, 2, 3]);
  });
});
