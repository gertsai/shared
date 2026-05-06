// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import type { StorageMetadata } from '@gertsai/storage-core';
import {
  endAt,
  endBefore,
  limit,
  limitToLast,
  offset,
  orderBy,
  startAfter,
  startAt,
  whereField,
} from '../constraints';

interface UserRead {
  uid: string;
  name: string;
  age: number;
  tags: string[];
}

type UserMeta = StorageMetadata<UserRead, UserRead, 'uid' | 'name' | 'age' | 'tags'>;

describe('whereField factory', () => {
  it('builds a scalar equality constraint', () => {
    const c = whereField<UserMeta, 'name'>('name', '==', 'alice');
    expect(c).toEqual({
      kind: 'where',
      field: 'name',
      op: '==',
      value: 'alice',
    });
  });

  it('builds an `in` constraint with array value', () => {
    const c = whereField<UserMeta, 'name'>('name', 'in', ['a', 'b', 'c']);
    expect(c.kind).toBe('where');
    expect(c.op).toBe('in');
    expect(c.value).toEqual(['a', 'b', 'c']);
  });

  it('builds an `array-contains` constraint with scalar value', () => {
    const c = whereField<UserMeta, 'tags'>('tags', 'array-contains', 'admin');
    expect(c).toEqual({
      kind: 'where',
      field: 'tags',
      op: 'array-contains',
      value: 'admin',
    });
  });

  it('builds an `array-contains-any` constraint with array value', () => {
    const c = whereField<UserMeta, 'tags'>('tags', 'array-contains-any', [
      'admin',
      'editor',
    ]);
    expect(c.op).toBe('array-contains-any');
    expect(c.value).toEqual(['admin', 'editor']);
  });
});

describe('orderBy factory', () => {
  it('defaults direction to asc', () => {
    const c = orderBy<UserMeta, 'name'>('name');
    expect(c).toEqual({ kind: 'orderBy', field: 'name', direction: 'asc' });
  });

  it('honours an explicit desc direction', () => {
    const c = orderBy<UserMeta, 'age'>('age', 'desc');
    expect(c.direction).toBe('desc');
  });
});

describe('limit factory', () => {
  it('wraps an integer count', () => {
    const c = limit<UserMeta>(25);
    expect(c).toEqual({ kind: 'limit', value: 25 });
  });

  it('rejects a negative value', () => {
    expect(() => limit<UserMeta>(-1)).toThrow(/non-negative integer/);
  });

  it('rejects a non-integer value', () => {
    expect(() => limit<UserMeta>(1.5)).toThrow(/non-negative integer/);
  });
});

describe('limitToLast factory', () => {
  it('wraps an integer count', () => {
    const c = limitToLast<UserMeta>(10);
    expect(c).toEqual({ kind: 'limitToLast', value: 10 });
  });

  it('rejects a negative value', () => {
    expect(() => limitToLast<UserMeta>(-1)).toThrow(/non-negative integer/);
  });

  it('rejects a non-integer value', () => {
    expect(() => limitToLast<UserMeta>(2.5)).toThrow(/non-negative integer/);
  });
});

describe('offset factory', () => {
  it('wraps an integer count', () => {
    const c = offset<UserMeta>(50);
    expect(c).toEqual({ kind: 'offset', value: 50 });
  });

  it('rejects a negative value', () => {
    expect(() => offset<UserMeta>(-5)).toThrow(/non-negative integer/);
  });

  it('rejects a non-integer value', () => {
    expect(() => offset<UserMeta>(0.7)).toThrow(/non-negative integer/);
  });
});

describe('cursor factories', () => {
  it('startAt collects variadic values', () => {
    const c = startAt<UserMeta>('alice', 30);
    expect(c).toEqual({ kind: 'startAt', values: ['alice', 30] });
  });

  it('startAfter collects variadic values', () => {
    const c = startAfter<UserMeta>('alice');
    expect(c.kind).toBe('startAfter');
    expect(c.values).toEqual(['alice']);
  });

  it('endAt collects variadic values', () => {
    const c = endAt<UserMeta>(99);
    expect(c.kind).toBe('endAt');
    expect(c.values).toEqual([99]);
  });

  it('endBefore collects variadic values', () => {
    const c = endBefore<UserMeta>('z');
    expect(c.kind).toBe('endBefore');
    expect(c.values).toEqual(['z']);
  });
});
