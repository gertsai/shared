import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Behaviour tests for GCRA limiter script.
 */

const RUN = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';

describe.skipIf(!RUN)('Lua GCRA behaviour', () => {
  let redis: RedisClient;
  let sha: string;

  const timeFrame = 2000; // 2s
  const limit = 1;

  beforeAll(async () => {
    redis = new RedisClient({
      host: process.env.RLR_HOST || '127.0.0.1',
      port: Number(process.env.RLR_PORT || 6379),
    });

    const scriptPath = path.resolve(__dirname, '../src/scripts/limitGcra.lua');
    const script = await fs.readFile(scriptPath, 'utf8');
    sha = (await redis.script('LOAD', script)) as string;
  });

  afterAll(() => {
    redis.disconnect();
  });

  const call = async (key: string, burst: number, ts: number) => {
    /* returns [allow, remaining, retryAfter] */
    return (await redis.evalsha(
      sha,
      1,
      key,
      timeFrame.toString(),
      limit.toString(),
      burst.toString(),
      ts.toString(),
    )) as [number, number, number];
  };

  it('blocks immediately when burst=0 and limit exceeded', async () => {
    const key = 'lua:gcra:behaviour:1';
    await redis.del(key);
    const now = Date.now();

    const first = await call(key, 0, now);
    expect(first[0]).toBe(1);

    const second = await call(key, 0, now + 10);
    expect(second[0]).toBe(0);
    expect(second[2]).toBeGreaterThan(0);
  });

  it('respects burst capacity', async () => {
    const key = 'lua:gcra:behaviour:2';
    await redis.del(key);
    const now = Date.now();

    const burstCap = 2;

    // first request
    const r1 = await call(key, burstCap, now);
    expect(r1[0]).toBe(1);

    // within burst -> still allowed (2nd)
    const r2 = await call(key, burstCap, now + 10);
    expect(r2[0]).toBe(1);

    // third within burst (burstCap==2) -> still allowed
    const r3 = await call(key, burstCap, now + 20);
    expect(r3[0]).toBe(1);

    // fourth exceeds burst -> blocked
    const r4 = await call(key, burstCap, now + 30);
    expect(r4[0]).toBe(0);
  });
});
