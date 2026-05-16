/**
 * Tests for resolveBody — uniform body-size enforcement across all branches.
 *
 * @module __tests__/resolveBody.test
 * @description Wave 12.B-fix-2 — close HIGH DoS finding (CWE-770).
 * Previously, only sync/async iterable paths enforced `maxBodySize`. Blob,
 * ArrayBuffer, string, Buffer, Uint8Array, DataView, URLSearchParams now all
 * enforce the limit uniformly via {@link BodyTooLargeError}.
 */

import { describe, it, expect } from 'vitest';

import { BodyTooLargeError, resolveBody } from '../fetchers/undiciFetcher';

const MB = 1024 * 1024;

describe('resolveBody — body-size enforcement (CWE-770)', () => {
  describe('null/undefined', () => {
    it('returns null for undefined body', async () => {
      expect(await resolveBody(undefined, 100)).toBeNull();
    });
    it('returns null for null body', async () => {
      expect(await resolveBody(null, 100)).toBeNull();
    });
  });

  describe('string branch', () => {
    it('throws BodyTooLargeError when string exceeds limit', async () => {
      const big = 'x'.repeat(100 * MB);
      await expect(resolveBody(big, 50 * MB)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('returns string unchanged when within limit', async () => {
      const small = 'small body';
      expect(await resolveBody(small, 100)).toBe(small);
    });

    it('correctly measures UTF-8 byte length (not char length)', async () => {
      // Each emoji here is 4 UTF-8 bytes; 30 chars × 4 bytes = 120 bytes > 100
      const s = '😀'.repeat(30);
      await expect(resolveBody(s, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe('Buffer branch', () => {
    it('throws when Buffer exceeds limit', async () => {
      const buf = Buffer.alloc(60 * MB);
      await expect(resolveBody(buf, 50 * MB)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('returns Buffer unchanged when within limit', async () => {
      const buf = Buffer.from('hello');
      const out = await resolveBody(buf, 100);
      expect(out).toBe(buf);
    });
  });

  describe('Uint8Array branch', () => {
    it('throws when Uint8Array exceeds limit', async () => {
      const arr = new Uint8Array(60 * MB);
      await expect(resolveBody(arr, 50 * MB)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('returns Uint8Array unchanged when within limit', async () => {
      const arr = new Uint8Array([1, 2, 3]);
      const out = await resolveBody(arr, 100);
      expect(out).toBe(arr);
    });
  });

  describe('ArrayBuffer branch', () => {
    it('throws when ArrayBuffer exceeds limit', async () => {
      const ab = new ArrayBuffer(60 * MB);
      await expect(resolveBody(ab, 50 * MB)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('converts small ArrayBuffer to Uint8Array', async () => {
      const ab = new ArrayBuffer(4);
      const out = await resolveBody(ab, 100);
      expect(out).toBeInstanceOf(Uint8Array);
      expect((out as Uint8Array).byteLength).toBe(4);
    });
  });

  describe('DataView branch', () => {
    it('throws when DataView exceeds limit', async () => {
      const ab = new ArrayBuffer(60 * MB);
      const dv = new DataView(ab);
      await expect(resolveBody(dv, 50 * MB)).rejects.toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe('Blob branch', () => {
    it('throws when Blob exceeds limit', async () => {
      const blob = new Blob(['x'.repeat(60 * MB)]);
      await expect(resolveBody(blob, 50 * MB)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('converts small Blob to Uint8Array when within limit', async () => {
      const blob = new Blob(['hello']);
      const out = await resolveBody(blob, 100);
      expect(out).toBeInstanceOf(Uint8Array);
      expect((out as Uint8Array).byteLength).toBe(5);
    });
  });

  describe('URLSearchParams branch', () => {
    it('throws when serialised params exceed limit', async () => {
      const params = new URLSearchParams();
      params.set('big', 'x'.repeat(200));
      await expect(resolveBody(params, 50)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('returns string form when within limit', async () => {
      const params = new URLSearchParams({ a: '1' });
      expect(await resolveBody(params, 100)).toBe('a=1');
    });
  });

  describe('iterable branch (regression — existing guard preserved)', () => {
    it('throws BodyTooLargeError when sync iterable exceeds limit', async () => {
      function* gen(): Generator<Uint8Array> {
        for (let i = 0; i < 10; i++) yield new Uint8Array(20);
      }
      await expect(resolveBody(gen(), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('throws BodyTooLargeError when async iterable exceeds limit', async () => {
      async function* gen(): AsyncGenerator<Uint8Array> {
        for (let i = 0; i < 10; i++) yield new Uint8Array(20);
      }
      await expect(resolveBody(gen(), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
    });

    it('returns concatenated Buffer when iterable within limit', async () => {
      function* gen(): Generator<Uint8Array> {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3, 4]);
      }
      const out = await resolveBody(gen(), 100);
      expect(Buffer.isBuffer(out)).toBe(true);
      expect((out as Buffer).length).toBe(4);
    });
  });

  describe('BodyTooLargeError shape', () => {
    it('carries size and limit fields', async () => {
      try {
        await resolveBody('x'.repeat(200), 100);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BodyTooLargeError);
        const e = err as BodyTooLargeError;
        expect(e.name).toBe('BodyTooLargeError');
        expect(e.size).toBe(200);
        expect(e.limit).toBe(100);
        expect(e.message).toContain('200');
        expect(e.message).toContain('100');
      }
    });
  });
});
