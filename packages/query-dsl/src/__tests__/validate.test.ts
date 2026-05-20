// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import type { StorageMetadata } from '@gertsai/storage-core';
import {
  FULL_QUERY_CAPABILITIES,
  IN_MEMORY_QUERY_CAPABILITIES,
  MINIMAL_QUERY_CAPABILITIES,
  POSTGRES_QUERY_CAPABILITIES,
} from '../capabilities';
import {
  endAt,
  limit,
  limitToLast,
  offset,
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

  it('rejects a negative limitToLast value', () => {
    const q = [
      { kind: 'limitToLast', value: -3 },
    ] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).toThrow(/limitToLast.*non-negative integer/);
  });

  it('rejects a negative offset value', () => {
    const q = [{ kind: 'offset', value: -1 }] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).toThrow(/offset.*non-negative integer/);
  });

  it('accepts valid limitToLast and offset constraints', () => {
    const q = [
      { kind: 'limitToLast', value: 5 },
      { kind: 'offset', value: 10 },
    ] as unknown as Query<OrderMeta>;
    expect(() => validateQuery(q)).not.toThrow();
  });
});

// Wave 21 / EVID-076 FR-X5 — capability matrix gating.
describe('validateQuery capability gating', () => {
  it('throws when offset is supplied against MINIMAL_QUERY_CAPABILITIES', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      offset<OrderMeta>(10),
    ];
    expect(() => validateQuery(q, MINIMAL_QUERY_CAPABILITIES)).toThrow(
      /offset/,
    );
  });

  it('accepts offset against POSTGRES_QUERY_CAPABILITIES (Pg honours OFFSET)', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      offset<OrderMeta>(10),
    ];
    expect(() => validateQuery(q, POSTGRES_QUERY_CAPABILITIES)).not.toThrow();
  });

  it('throws when limitToLast is supplied against POSTGRES_QUERY_CAPABILITIES', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      limitToLast<OrderMeta>(5),
    ];
    expect(() => validateQuery(q, POSTGRES_QUERY_CAPABILITIES)).toThrow(
      /limitToLast/,
    );
  });

  it('accepts limitToLast against IN_MEMORY_QUERY_CAPABILITIES', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      limitToLast<OrderMeta>(5),
    ];
    expect(() => validateQuery(q, IN_MEMORY_QUERY_CAPABILITIES)).not.toThrow();
  });

  it('throws when cursors are supplied against POSTGRES_QUERY_CAPABILITIES (cursors=unsupported)', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      startAt<OrderMeta>(100),
    ];
    expect(() => validateQuery(q, POSTGRES_QUERY_CAPABILITIES)).toThrow(
      /cursor/,
    );
  });

  it('accepts cursors against IN_MEMORY_QUERY_CAPABILITIES (cursors=native)', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      startAt<OrderMeta>(100),
      endAt<OrderMeta>(200),
    ];
    expect(() => validateQuery(q, IN_MEMORY_QUERY_CAPABILITIES)).not.toThrow();
  });

  it('FULL_QUERY_CAPABILITIES accepts every constraint kind', () => {
    const q: Query<OrderMeta> = [
      whereField<OrderMeta, 'status'>('status', '==', 'paid'),
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      startAt<OrderMeta>(100),
      endAt<OrderMeta>(500),
      offset<OrderMeta>(2),
      limit<OrderMeta>(10),
      limitToLast<OrderMeta>(3),
    ];
    expect(() => validateQuery(q, FULL_QUERY_CAPABILITIES)).not.toThrow();
  });

  it('omitting capabilities preserves pre-Wave 21 behaviour (no gating)', () => {
    const q: Query<OrderMeta> = [
      orderBy<OrderMeta, 'total'>('total', 'asc'),
      limitToLast<OrderMeta>(5),
      offset<OrderMeta>(2),
      startAt<OrderMeta>(100),
    ];
    expect(() => validateQuery(q)).not.toThrow();
  });
});
