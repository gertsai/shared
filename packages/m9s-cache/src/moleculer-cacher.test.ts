import { describe, expect, it, vi } from 'vitest';
import { M9sCacheCacher } from './moleculer-cacher';
import { MemoryCacheDriver } from './memory-driver';

describe('M9sCacheCacher', () => {
  it('caches action results and respects tag invalidation', async () => {
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

    const driver = new MemoryCacheDriver();
    const cacher = new M9sCacheCacher({ driver, prefix: 'TEST' });
    cacher.init(broker as any);

    const handler = vi.fn(async () => [{ id: 1, updatedAt: 10 }]);
    const action = {
      name: 'users.get',
      cache: {
        enabled: true,
        keys: ['id'],
        tags: [
          {
            name: 'user',
            path: ['*'],
            idField: 'id',
            timestampField: 'updatedAt',
          },
        ],
      },
    };

    const ctx: any = {
      params: { id: 1 },
      meta: {},
      service: {},
    };

    const mw = cacher.middleware();
    const wrapped = mw(handler, action as any);

    const first = await wrapped(ctx);
    expect(first).toEqual([{ id: 1, updatedAt: 10 }]);
    expect(handler).toHaveBeenCalledTimes(1);

    const second = await wrapped({ ...ctx, cachedResult: false });
    expect(second).toEqual([{ id: 1, updatedAt: 10 }]);
    expect(handler).toHaveBeenCalledTimes(1);

    await cacher.setTags({ 'user:1': 999 });

    const third = await wrapped({ ...ctx, cachedResult: false });
    expect(third).toEqual([{ id: 1, updatedAt: 10 }]);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
