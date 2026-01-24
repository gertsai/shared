import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CacheStore } from './cache-store';
import { MemoryCacheDriver } from './memory-driver';

describe('CacheStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', async () => {
    const driver = new MemoryCacheDriver();
    const store = new CacheStore({ driver, prefix: 't:' });

    await store.set('key', { value: 1 });
    const value = await store.get<{ value: number }>('key');

    expect(value).toEqual({ value: 1 });
  });

  it('expires values after ttl', async () => {
    const driver = new MemoryCacheDriver();
    const store = new CacheStore({ driver, prefix: 't:' });

    await store.set('expiring', 'value', { ttlSeconds: 1 });
    expect(await store.get('expiring')).toBe('value');

    vi.advanceTimersByTime(1000);
    expect(await store.get('expiring')).toBeNull();
  });

  it('wrap caches loader results', async () => {
    const driver = new MemoryCacheDriver();
    const store = new CacheStore({ driver, prefix: 't:' });
    const loader = vi.fn(async () => 'result');

    const first = await store.wrap('wrapped', loader, { ttlSeconds: 60 });
    const second = await store.wrap('wrapped', loader, { ttlSeconds: 60 });

    expect(first).toBe('result');
    expect(second).toBe('result');
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
