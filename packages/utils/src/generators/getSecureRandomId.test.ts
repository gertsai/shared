import { describe, expect, it } from 'vitest';
import { getSecureRandomId } from './getSecureRandomId';

const BASE62_RE = /^[A-Za-z0-9]+$/;

describe('getSecureRandomId', () => {
  it('returns a 16-char base62 string by default', () => {
    const id = getSecureRandomId();
    expect(id).toBeTypeOf('string');
    expect(id.length).toBe(16);
    expect(id).toMatch(BASE62_RE);
  });

  it('returns a string of the requested length', () => {
    const id = getSecureRandomId(32);
    expect(id.length).toBe(32);
    expect(id).toMatch(BASE62_RE);
  });

  it('throws RangeError for length < 1', () => {
    expect(() => getSecureRandomId(0)).toThrow(RangeError);
    expect(() => getSecureRandomId(-5)).toThrow(RangeError);
  });

  it('handles large lengths', () => {
    const id = getSecureRandomId(100);
    expect(id.length).toBe(100);
    expect(id).toMatch(BASE62_RE);

    const big = getSecureRandomId(1024);
    expect(big.length).toBe(1024);
    expect(big).toMatch(BASE62_RE);
  });

  it('produces different results across consecutive calls', () => {
    const a = getSecureRandomId(32);
    const b = getSecureRandomId(32);
    const c = getSecureRandomId(32);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('only emits base62 characters even for many samples', () => {
    for (let i = 0; i < 50; i++) {
      expect(getSecureRandomId(64)).toMatch(BASE62_RE);
    }
  });
});
