import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Extended behavioural tests for limitSlightWindowMain.lua
 * Requires a running local Redis instance. Enable with HAS_REDIS=1
 */

const RUN = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';

describe.skipIf(!RUN)('Lua sliding window behaviour', () => {
  let redis: RedisClient;
  let sha: string;

  const timeFrame = 1000; // 1s window
  const limit = 4;

  beforeAll(async () => {
    redis = new RedisClient({
      host: process.env.RLR_HOST || '127.0.0.1',
      port: Number(process.env.RLR_PORT || 6379),
    });

    const scriptPath = path.resolve(__dirname, '../src/scripts/limitSlightWindowMain.lua');
    const script = await fs.readFile(scriptPath, 'utf8');
    sha = (await redis.script('LOAD', script)) as string;
  });

  afterAll(() => {
    redis.disconnect();
  });

  const call = async (key: string, ts: number) => {
    /*
     * Returns tuple [allow,total,remaining,reset]
     */
    return (await redis.evalsha(
      sha,
      1,
      key,
      timeFrame.toString(),
      limit.toString(),
      ts.toString(),
    )) as [number, number, number, number];
  };

  it('allows up to limit within timeframe then blocks', async () => {
    const key = 'lua:slw:behaviour:1';
    await redis.del(key);
    const start = Date.now();

    // First 4 requests allowed
    for (let i = 0; i < limit; i++) {
      const res = await call(key, start + i);
      expect(res[0]).toBe(1);
      expect(res[2]).toBe(limit - i - 1);
    }

    // 5-я должна быть заблокирована
    const blocked = await call(key, start + 10);
    expect(blocked[0]).toBe(0);
    expect(blocked[2]).toBe(0);
    expect(blocked[3]).toBeGreaterThan(0); // reset > 0
  });

  it('resets after timeframe passes', async () => {
    const key = 'lua:slw:behaviour:2';
    await redis.del(key);
    const base = Date.now();

    // consume limit
    for (let i = 0; i < limit; i++) {
      const r = await call(key, base + i);
      expect(r[0]).toBe(1);
    }

    // blocked
    const b1 = await call(key, base + 100);
    expect(b1[0]).toBe(0);

    // after timeframe + small delta → allowed again
    const allowedAfter = await call(key, base + timeFrame + 50);
    expect(allowedAfter[0]).toBe(1);
    expect(allowedAfter[2]).toBeLessThan(limit); // remaining < limit after first hit
  });
});
