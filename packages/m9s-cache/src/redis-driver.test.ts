import { describe, expect, it, vi } from 'vitest';
import { RedisCacheDriver } from './redis-driver';

describe('RedisCacheDriver', () => {
  it('uses getBuffer when available', async () => {
    const client = {
      getBuffer: vi.fn().mockResolvedValue(Buffer.from('data')),
      get: vi.fn(),
    };

    const driver = new RedisCacheDriver({ client: client as any });
    const value = await driver.get('key');

    expect(client.getBuffer).toHaveBeenCalledWith('key');
    expect(client.get).not.toHaveBeenCalled();
    expect(value).toEqual(Buffer.from('data'));
  });

  it('sets ttl when provided', async () => {
    const client = {
      set: vi.fn().mockResolvedValue('OK'),
    };

    const driver = new RedisCacheDriver({ client: client as any });
    await driver.set('key', 'value', 10);

    expect(client.set).toHaveBeenCalledWith('key', 'value', 'EX', 10);
  });
});
