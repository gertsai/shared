import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import fs from 'node:fs/promises';

const RUN = process.env.HAS_REDIS === '1';

describe.skipIf(!RUN)('Lua GCRA script', () => {
  let redis: RedisClient;
  let script: string;
  let sha: string;

  beforeAll(async () => {
    redis = new RedisClient({
      host: process.env.RLR_HOST || '127.0.0.1',
      port: Number(process.env.RLR_PORT || 6379),
    });
    script = await fs.readFile('./src/scripts/limitGcra.lua', 'utf8');
    sha = (await redis.script('LOAD', script)) as string;
  });

  afterAll(() => redis.disconnect());

  it('allows first N requests and blocks next within window', async () => {
    const key = 'lua:gcra:test';
    await redis.del(key);

    const timeFrame = 1000;
    const limit = 2;
    const burst = 0;

    const now = Date.now();

    const evalArgs: [number, string, string, string, string, string] = [
      1,
      key,
      timeFrame.toString(),
      limit.toString(),
      burst.toString(),
      now.toString(),
    ];

    const first = (await redis.evalsha(sha, ...evalArgs)) as any[];
    expect(first[0]).toBe(1); // allowed

    // Advance time by inter-arrival to allow next request
    const later = now + Math.floor(timeFrame / limit);
    const second = (await redis.evalsha(
      sha,
      1,
      key,
      timeFrame.toString(),
      limit.toString(),
      burst.toString(),
      later.toString(),
    )) as any[];
    expect(second[0]).toBe(1); // allowed second time with spacing

    const third = (await redis.evalsha(sha, ...evalArgs)) as any[];
    expect(third[0]).toBe(0); // blocked
    expect(Number(third[2])).toBeGreaterThan(0); // retryAfter > 0
  });
});
