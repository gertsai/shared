import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import fs from 'node:fs/promises';
import path from 'node:path';

const RUN = process.env.HAS_REDIS === '1';

describe.skipIf(!RUN)('Lua sliding window script', () => {
  let redis: RedisClient;
  let sha: string;

  beforeAll(async () => {
    redis = new RedisClient({
      host: process.env.RLR_HOST || '127.0.0.1',
      port: Number(process.env.RLR_PORT || 6379),
    });
    const scriptPath = path.resolve(__dirname, '../src/scripts/limitSlightWindowMain.lua');
    const script = await fs.readFile(scriptPath, 'utf8');
    sha = (await redis.script('LOAD', script)) as string;
  });

  afterAll(() => redis.disconnect());

  it('weights previous window correctly', async () => {
    const key = 'lua:sw:test';
    await redis.del(key);
    const timeFrame = 1000;
    const limit = 4;
    const now = Date.now();

    // helper - return tuple type for spread operator
    const evalArgs = (ts: number): [number, string, string, string, string] => [
      1,
      key,
      timeFrame.toString(),
      limit.toString(),
      ts.toString(),
    ];

    // add 2 requests in previous window (simulate by timestamp -1100ms)
    const twoBack = now - 1100;
    await redis.zadd(key, twoBack, String(twoBack));
    await redis.zadd(key, twoBack + 10, String(twoBack + 10));

    // First request in new window should see weight of prev window <= 0.75*2 =1
    const res = (await redis.evalsha(sha, ...evalArgs(now))) as any[];
    expect(res[0]).toBe(1); // allow flag should be 1
    expect(res[2]).toBeGreaterThan(0); // remaining requests (3rd element) should be > 0

    // Make 4 total requests quickly -> last should be blocked
    let remainingRequests = 1;
    for (let i = 0; i < 4 && remainingRequests > 0; i++) {
      const r = (await redis.evalsha(sha, ...evalArgs(now + 10 * (i + 1)))) as any[];
      remainingRequests = r[2]; // remaining requests at index 2
    }
    expect(remainingRequests).toBe(0); // blocked when no remaining requests
  });
});
