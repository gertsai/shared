import { describe, expect, it } from 'vitest';
import { hGetFirst, hGetLast } from './hGet';

describe('hGetFirst', () => {
  it('should return the first element of a non-empty array', () => {
    const array = [1, 2, 3];
    expect(hGetFirst(array)).toBe(1);
  });

  it('should return the first element for single-element array', () => {
    const array = ['single'];
    expect(hGetFirst(array)).toBe('single');
  });

  it('should return undefined for empty array', () => {
    const array: number[] = [];
    expect(hGetFirst(array)).toBeUndefined();
  });

  it('should return undefined for null array', () => {
    expect(hGetFirst(null as any)).toBeUndefined();
  });

  it('should return undefined for undefined array', () => {
    expect(hGetFirst(undefined as any)).toBeUndefined();
  });

  it('should work with different data types', () => {
    expect(hGetFirst(['string', 'array'])).toBe('string');
    expect(hGetFirst([true, false])).toBe(true);
    expect(hGetFirst([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
  });

  it('should handle arrays with undefined values', () => {
    const array = [undefined, 2, 3];
    expect(hGetFirst(array)).toBeUndefined();
  });

  it('should handle arrays with null values', () => {
    const array = [null, 2, 3];
    expect(hGetFirst(array)).toBeNull();
  });
});

describe('hGetLast', () => {
  it('should return the last element of a non-empty array', () => {
    const array = [1, 2, 3];
    expect(hGetLast(array)).toBe(3);
  });

  it('should return the last element for single-element array', () => {
    const array = ['single'];
    expect(hGetLast(array)).toBe('single');
  });

  it('should return undefined for empty array', () => {
    const array: number[] = [];
    expect(hGetLast(array)).toBeUndefined();
  });

  it('should return undefined for null array', () => {
    expect(hGetLast(null as any)).toBeUndefined();
  });

  it('should return undefined for undefined array', () => {
    expect(hGetLast(undefined as any)).toBeUndefined();
  });

  it('should work with different data types', () => {
    expect(hGetLast(['first', 'last'])).toBe('last');
    expect(hGetLast([true, false])).toBe(false);
    expect(hGetLast([{ id: 1 }, { id: 2 }])).toEqual({ id: 2 });
  });

  it('should handle arrays with undefined values', () => {
    const array = [1, 2, undefined];
    expect(hGetLast(array)).toBeUndefined();
  });

  it('should handle arrays with null values', () => {
    const array = [1, 2, null];
    expect(hGetLast(array)).toBeNull();
  });

  it('should work consistently with hGetFirst for single element arrays', () => {
    const array = [42];
    expect(hGetFirst(array)).toBe(hGetLast(array));
  });
});
