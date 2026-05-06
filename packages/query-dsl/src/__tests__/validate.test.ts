// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import type { StorageMetadata } from '@gertsai/storage-core';
import {
  endAt,
  limit,
  orderBy,
  startAt,
  whereField,
} from '../constraints';
import type { Query } from '../types';
import { validateQuery } from '../validate';

interface OrderRead {
  uid: string;
  total: number;
  status: string;
  tags: string[];
}
type OrderMeta = StorageMetadata<OrderRead, OrderRead, 'uid' | 'total' | 'status' | 'tags'>;

describe('validateQuery happy path', () => {
  it('accepts a single whereField constraint', () => {
    const q: Query<OrderMeta> = [whereField<OrderMeta, 'status'>('status', '==', 'paid')];
    expect(() => validateQuery(q)).not.toThrow();
  });

  it('accepts a multi-clause query', () => {
    const q: Query<OrderMeta> = [
      whereField<OrderMeta, 'status'>('status', '==', 'paid'),
      orderBy<OrderMeta, 'total'>('total', 'desc'),
      limit<OrderMeta>(50),
    ];
    expect(() => validateQuery(q)).not.toThrow();
  });

  it('accepts cursor constraints with non-empty values', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total'),
      startAt<OrderMeta>(100),
      endAt<OrderMeta>(500),
    ];
    expect(() => validateQuery(q)).not.toThrow();
  });
});

describe('validateQuery rejection', () => {
  it('rejects an empty query', () => {
    expect(() => validateQuery<OrderMeta>([])).toThrow(/at least one constraint/);
  });

  it('rejects a non-array input', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional malformed input
      validateQuery({} as any),
    ).toThrow(/must be an array/);
  });

  it('rejects an `in` op with scalar value', () => {
    const q = [
      // Bypass the overload gate to simulate a runtime caller that built
      // the constraint from JSON.
      { kind: 'where', field: 'status', op: 'in', value: 'paid' },
    ] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).toThrow(/requires an array value/);
  });

  it('rejects an unknown WhereOp', () => {
    const q = [
      { kind: 'where', field: 'status', op: 'LIKE', value: '%a%' },
    ] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).toThrow(/not a known WhereOp/);
  });

  it('rejects a negative limit', () => {
    const q = [{ kind: 'limit', value: -1 }] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).toThrow(/non-negative integer/);
  });

  it('rejects an empty cursor values array', () => {
    const q = [{ kind: 'startAt', values: [] }] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).toThrow(/non-empty array/);
  });
});
