import { describe, expect, it } from 'vitest';
import type { NoUndefinedFieldShallow } from './nonNullable';
import { nonNullable } from './nonNullable';

describe('nonNullable', () => {
  it('should return true for non-null and non-undefined values', () => {
    expect(nonNullable(0)).toBe(true);
    expect(nonNullable('')).toBe(true);
    expect(nonNullable(false)).toBe(true);
    expect(nonNullable([])).toBe(true);
    expect(nonNullable({})).toBe(true);
  });

  it('should return false for null and undefined values', () => {
    expect(nonNullable(null)).toBe(false);
    expect(nonNullable(undefined)).toBe(false);
  });

  it('should filter out null and undefined values from an array', () => {
    const array = [1, null, 2, undefined, 3];
    const result = array.filter(nonNullable);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe('NoUndefinedFieldShallow', () => {
  it('should remove undefined from field types', () => {
    type MyType = {
      a: string;
      b?: number;
      c: string | undefined;
    };

    const obj: NoUndefinedFieldShallow<MyType> = {
      a: 'hello',
      b: 123,
      c: 'world',
    };

    expect(obj.a).toBe('hello');
    expect(obj.b).toBe(123);
    expect(obj.c).toBe('world');
  });

  it('should not affect nested objects', () => {
    type NestedType = {
      a: {
        b?: number;
      };
    };

    type MyType = {
      nested: NestedType;
    };

    const obj: NoUndefinedFieldShallow<MyType> = {
      nested: {
        a: {},
      },
    };

    const nestedObj: { b?: number } = { b: undefined };
    obj.nested.a = nestedObj;

    expect(obj.nested.a.b).toBeUndefined();
  });
});
