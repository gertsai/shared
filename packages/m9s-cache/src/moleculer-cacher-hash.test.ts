import { describe, expect, it, vi } from 'vitest';
import { M9sCacheCacher } from './moleculer-cacher';
import { MemoryCacheDriver } from './memory-driver';

describe('M9sCacheCacher hash operations', () => {
  it('stores tagged envelope in hash', async () => {
    const metrics = {
      register: vi.fn(),
      increment: vi.fn(),
      timer: vi.fn(() => vi.fn()),
    };
    const broker = {
      metrics,
      namespace: 'test',
      getLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
      Promise,
    };

    const cacher = new M9sCacheCacher({ driver: new MemoryCacheDriver() });
    cacher.init(broker as any);

    await cacher.hSetWithTags('user:1', { id: 1 }, 30, { 'user:1': 123 });
    const data = await cacher.hGetAll('user:1');

    expect(data?.data).toEqual({ id: 1 });
    expect(data?.tags).toEqual({ 'user:1': 123 });
    expect(typeof data?.created_at).toBe('number');
  });

  it('returns ttl with getWithTTL', async () => {
    const metrics = {
      register: vi.fn(),
      increment: vi.fn(),
      timer: vi.fn(() => vi.fn()),
    };
    const broker = {
      metrics,
      namespace: 'test',
      getLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
      Promise,
    };

    const cacher = new M9sCacheCacher({ driver: new MemoryCacheDriver() });
    cacher.init(broker as any);

    await cacher.set('ttl-key', 'value', 60);
    const result = await cacher.getWithTTL('ttl-key');

    expect(result.data).toBe('value');
    expect(result.ttl).toBeGreaterThan(0);
  });
});
