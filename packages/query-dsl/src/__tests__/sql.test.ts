// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import type { StorageMetadata } from '@gertsai/storage-core';
import {
  limit,
  orderBy,
  whereField,
} from '../constraints';
import { compileToSql } from '../sql';
import type { Query } from '../types';

interface InvoiceRead {
  uid: string;
  total: number;
  status: string;
  tags: string[];
}
type InvoiceMeta = StorageMetadata<
  InvoiceRead,
  InvoiceRead,
  'uid' | 'total' | 'status' | 'tags'
>;

describe('compileToSql whereField + orderBy + limit', () => {
  it('compiles a simple equality filter to $1 placeholders', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', '==', 'paid'),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe('SELECT * FROM invoices WHERE status = $1');
    expect(params).toEqual(['paid']);
  });

  it('compiles inequality `!=` to `<>`', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', '!=', 'cancelled'),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe('SELECT * FROM invoices WHERE status <> $1');
    expect(params).toEqual(['cancelled']);
  });

  it('compiles a range comparison and an orderBy', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'total'>('total', '>=', 100),
      orderBy<InvoiceMeta, 'total'>('total', 'desc'),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe(
      'SELECT * FROM invoices WHERE total >= $1 ORDER BY total DESC',
    );
    expect(params).toEqual([100]);
  });

  it('compiles a LIMIT clause and parameterises the count', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', '==', 'paid'),
      limit<InvoiceMeta>(25),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe(
      'SELECT * FROM invoices WHERE status = $1 LIMIT $2',
    );
    expect(params).toEqual(['paid', 25]);
  });
});

describe('compileToSql IN / array-contains', () => {
  it('expands an `in` operator into N $-placeholders', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', 'in', [
        'paid',
        'pending',
        'failed',
      ]),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe(
      'SELECT * FROM invoices WHERE status IN ($1, $2, $3)',
    );
    expect(params).toEqual(['paid', 'pending', 'failed']);
  });

  it('emits jsonb @> for array-contains', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'tags'>('tags', 'array-contains', 'urgent'),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe('SELECT * FROM invoices WHERE tags @> $1::jsonb');
    expect(params).toEqual([JSON.stringify(['urgent'])]);
  });
});

describe('compileToSql multi-constraint composition', () => {
  it('joins multiple where clauses with AND and preserves declaration order', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', '==', 'paid'),
      whereField<InvoiceMeta, 'total'>('total', '>', 0),
      orderBy<InvoiceMeta, 'total'>('total', 'asc'),
      orderBy<InvoiceMeta, 'uid'>('uid', 'asc'),
      limit<InvoiceMeta>(10),
    ];
    const { sql, params } = compileToSql(q, 'invoices');
    expect(sql).toBe(
      'SELECT * FROM invoices WHERE status = $1 AND total > $2 ORDER BY total ASC, uid ASC LIMIT $3',
    );
    expect(params).toEqual(['paid', 0, 10]);
  });
});

describe('compileToSql identifier guards', () => {
  it('rejects a malicious table name', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', '==', 'paid'),
    ];
    expect(() =>
      compileToSql(q, 'invoices; DROP TABLE invoices --'),
    ).toThrow(/not a valid SQL identifier/);
  });

  it('rejects an empty table name', () => {
    const q: Query<InvoiceMeta> = [
      whereField<InvoiceMeta, 'status'>('status', '==', 'paid'),
    ];
    expect(() => compileToSql(q, '')).toThrow(/not a valid SQL identifier/);
  });

  it('rejects a malicious column name (constraint built by hand)', () => {
    // Caller-built constraint that bypasses the type system.
    const q = [
      {
        kind: 'where',
        field: 'status; DROP TABLE invoices --',
        op: '==',
        value: 'x',
      },
    ] as unknown as Query<InvoiceMeta>;
    expect(() => compileToSql(q, 'invoices')).toThrow(
      /not a valid SQL identifier/,
    );
  });
});
