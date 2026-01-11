import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RedisClient from 'ioredis';
import path from 'node:path';
import fs from 'node:fs/promises';

const RUN = process.env.HAS_REDIS === '1' || process.env.HAS_REDIS === 'true';

describe.skipIf(!RUN)('Lua sliding window edge-cases', () => {
  let redis: RedisClient;
  let sha: string;

  const timeFrame = 1000;
  const limit = 2;

  beforeAll(async () => {
    redis = new RedisClient();
    const scriptPath = path.resolve(__dirname, '../src/scripts/limitSlightWindowMain.lua');
    const script = await fs.readFile(scriptPath, 'utf8');
    sha = (await redis.script('LOAD', script)) as string;
  });

  afterAll(() => redis.disconnect());

  const evalCall = async (key: string, ts: number) => {
    return (await redis.evalsha(
      sha,
      1,
      key,
      timeFrame.toString(),
      limit.toString(),
      ts.toString(),
    )) as [number, number, number, number];
  };

  it('allows request with remaining=0 then blocks next', async () => {
    const key = 'lua:edge:slw:rem0';
    await redis.del(key);
    const now = Date.now();

    const r1 = await evalCall(key, now);
    expect(r1).toEqual([1, 1, 1, expect.any(Number)]);

    const r2 = await evalCall(key, now + 1);
    // after second hit remaining=0 but allow=1
    expect(r2[0]).toBe(1);
    expect(r2[2]).toBe(0);

    const r3 = await evalCall(key, now + 2);
    expect(r3[0]).toBe(0);
    expect(r3[2]).toBe(0);
    expect(r3[3]).toBeGreaterThan(0);
  });

  it('reset does not exceed timeFrame when blocked', async () => {
    const key = 'lua:edge:slw:reset';
    await redis.del(key);
    const base = Date.now();

    await evalCall(key, base); // 1
    await evalCall(key, base + 10); // 2
    const blk = await evalCall(key, base + 20); // blocked

    expect(blk[0]).toBe(0);
    expect(blk[3]).toBeGreaterThan(0);
    expect(blk[3]).toBeLessThanOrEqual(timeFrame);
  });
});
