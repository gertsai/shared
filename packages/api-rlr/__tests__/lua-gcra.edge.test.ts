import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import path from 'node:path';
import fs from 'node:fs/promises';

const RUN = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';

describe.skipIf(!RUN)('Lua GCRA edge-cases', () => {
  let redis: RedisClient;
  let sha: string;

  const timeFrame = 1000;
  const limit = 1;

  beforeAll(async () => {
    redis = new RedisClient();
    const scriptPath = path.resolve(__dirname, '../src/scripts/limitGcra.lua');
    const script = await fs.readFile(scriptPath, 'utf8');
    sha = (await redis.script('LOAD', script)) as string;
  });

  afterAll(() => redis.disconnect());

  const call = async (key: string, burst: number, ts: number) => {
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

  it('remaining decreases with each request until blocked', async () => {
    const key = 'lua:edge:gcra:remaining';
    await redis.del(key);
    const burst = 2;
    const now = Date.now();

    // First request: remaining = burst - 1 = 1 (one slot used)
    const r1 = await call(key, burst, now);
    expect(r1[0]).toBe(1); // allowed
    expect(r1[1]).toBe(1); // remaining after first request

    // Second request (almost immediately): remaining = 0
    const r2 = await call(key, burst, now + 1);
    expect(r2[0]).toBe(1); // still allowed (within burst)
    expect(r2[1]).toBe(0); // no remaining burst capacity

    // Third request: still allowed but at the edge
    const r3 = await call(key, burst, now + 2);
    expect(r3[0]).toBe(1); // allowed (on the edge)
    expect(r3[1]).toBe(0); // no remaining

    // Fourth request: blocked (exceeded burst)
    const r4 = await call(key, burst, now + 30);
    expect(r4[0]).toBe(0); // blocked
    expect(r4[1]).toBe(0); // no remaining when blocked
    expect(r4[2]).toBeGreaterThan(0); // retryAfter > 0
  });

  it('reset to allow after timeFrame passes', async () => {
    const key = 'lua:edge:gcra:reset';
    await redis.del(key);
    const burst = 0;
    const base = Date.now();

    await call(key, burst, base);
    const blocked = await call(key, burst, base + 10);
    expect(blocked[0]).toBe(0);

    const afterWindow = await call(key, burst, base + timeFrame + 50);
    expect(afterWindow[0]).toBe(1);
  });
});
