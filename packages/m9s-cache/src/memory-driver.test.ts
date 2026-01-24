import { describe, expect, it } from 'vitest';
import { MemoryCacheDriver } from './memory-driver';

describe('MemoryCacheDriver', () => {
  it('supports hash operations', async () => {
    const driver = new MemoryCacheDriver();

    expect(driver.hset).toBeDefined();
    expect(driver.hget).toBeDefined();
    expect(driver.hgetall).toBeDefined();

    await driver.hset!('hash', { a: '1', b: '2' });
    const all = await driver.hgetall!('hash');
    const field = await driver.hget!('hash', 'a');

    expect(all).toEqual({ a: '1', b: '2' });
    expect(field).toBe('1');
  });
});
