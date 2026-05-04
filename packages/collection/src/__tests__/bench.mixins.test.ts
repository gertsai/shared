import { describe, expect, it } from 'vitest';
import { createMutableCollection } from '../core/createCollection';

const BENCH_ENABLED = process.env.BENCH === '1';

function setProtoFlag(value: boolean) {
  (
    globalThis as unknown as Record<string, unknown>
  ).__ORCH_COLLECTION_USE_PROTO_MIXINS__ = value;
}

function makeEntries(n: number): Array<[number, number]> {
  const arr: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    arr.push([i, i]);
  }
  return arr;
}

if (!BENCH_ENABLED) {
  describe.skip('mixins benchmarks (skipped by default)', () => {
    it('skipped', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('mixins benchmarks', () => {
    it('create 2000 mutable collections: instance vs prototype', () => {
      const loops = 2000;

      setProtoFlag(false);
      const t1 = performance.now();
      for (let i = 0; i < loops; i++) {
        createMutableCollection<number, number>(makeEntries(10));
      }
      const t2 = performance.now();

      setProtoFlag(true);
      // warmup once for proto augmentation
      createMutableCollection<number, number>(makeEntries(10));
      const t3 = performance.now();
      for (let i = 0; i < loops; i++) {
        createMutableCollection<number, number>(makeEntries(10));
      }
      const t4 = performance.now();

      const instanceMs = t2 - t1;
      const protoMs = t4 - t3;
      // eslint-disable-next-line no-console
      console.log(
        `[bench] create x${loops}: instance=${instanceMs.toFixed(2)}ms, proto=${protoMs.toFixed(2)}ms, delta=${(protoMs - instanceMs).toFixed(2)}ms`,
      );
      expect(instanceMs).toBeGreaterThanOrEqual(0);
      expect(protoMs).toBeGreaterThanOrEqual(0);
    });

    it('hot calls at()/firstKey() 100k: instance vs prototype', () => {
      const iters = 100_000;

      setProtoFlag(false);
      const c1 = createMutableCollection<number, number>(makeEntries(100));
      let s1 = 0;
      const a1 = performance.now();
      for (let i = 0; i < iters; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        s1 += (c1 as any).at(5) ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        s1 += ((c1 as any).firstKey() as number) ?? 0;
      }
      const b1 = performance.now();

      setProtoFlag(true);
      const c2 = createMutableCollection<number, number>(makeEntries(100));
      let s2 = 0;
      const a2 = performance.now();
      for (let i = 0; i < iters; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        s2 += (c2 as any).at(5) ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        s2 += ((c2 as any).firstKey() as number) ?? 0;
      }
      const b2 = performance.now();

      const instMs = b1 - a1;
      const protoMs = b2 - a2;
      // eslint-disable-next-line no-console
      console.log(
        `[bench] hot calls x${iters}: instance=${instMs.toFixed(2)}ms, proto=${protoMs.toFixed(2)}ms, delta=${(protoMs - instMs).toFixed(2)}ms, sums=${s1 + s2}`,
      );
      expect(typeof s1).toBe('number');
      expect(typeof s2).toBe('number');
    });
  });
}
