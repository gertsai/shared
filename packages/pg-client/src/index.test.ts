// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import type { PgClient, PgClientLike } from './index';
import { mockPgClient } from './index';

describe('mockPgClient', () => {
  it('$queryRaw returns default empty rows when no matchers configured', async () => {
    const db = mockPgClient();
    const rows = await db.$queryRaw`SELECT 1`;
    expect(rows).toEqual([]);
  });

  it('$queryRaw returns the result of the first matching pattern', async () => {
    const db = mockPgClient({
      queryResults: [
        { pattern: /FROM users/i, result: [{ id: 1, name: 'Ada' }] },
        { pattern: /FROM orders/i, result: [{ id: 99 }] },
      ],
    });
    const rows = await db.$queryRaw<{ id: number; name: string }>`SELECT * FROM users WHERE id = ${1}`;
    expect(rows).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('$queryRaw falls back to defaultQueryResult when no pattern matches', async () => {
    const fallback = [{ sentinel: true }];
    const db = mockPgClient({
      queryResults: [{ pattern: /FROM users/i, result: [{ id: 1 }] }],
      defaultQueryResult: fallback,
    });
    const rows = await db.$queryRaw`SELECT * FROM products`;
    expect(rows).toEqual(fallback);
  });

  it('$executeRaw returns default 0 when no matchers configured', async () => {
    const db = mockPgClient();
    const affected = await db.$executeRaw`UPDATE users SET active = ${true}`;
    expect(affected).toBe(0);
  });

  it('$executeRaw returns the count of the first matching pattern', async () => {
    const db = mockPgClient({
      executeResults: [
        { pattern: /UPDATE users/i, result: 3 },
        { pattern: /DELETE FROM/i, result: 1 },
      ],
    });
    const affected = await db.$executeRaw`UPDATE users SET active = ${false} WHERE id = ${42}`;
    expect(affected).toBe(3);
  });

  it('$executeRaw honours defaultExecuteResult when no pattern matches', async () => {
    const db = mockPgClient({
      executeResults: [{ pattern: /UPDATE users/i, result: 3 }],
      defaultExecuteResult: 7,
    });
    const affected = await db.$executeRaw`DELETE FROM logs WHERE id = ${1}`;
    expect(affected).toBe(7);
  });

  it('records sql, params, and kind for $queryRaw calls', async () => {
    const db = mockPgClient();
    await db.$queryRaw`SELECT * FROM users WHERE id = ${42} AND role = ${'admin'}`;
    expect(db.recorded).toHaveLength(1);
    const entry = db.recorded[0];
    expect(entry?.kind).toBe('query');
    expect(entry?.sql).toBe('SELECT * FROM users WHERE id = $1 AND role = $2');
    expect(entry?.params).toEqual([42, 'admin']);
  });

  it('records sql, params, and kind for $executeRaw calls', async () => {
    const db = mockPgClient();
    await db.$executeRaw`UPDATE users SET active = ${true} WHERE id = ${7}`;
    expect(db.recorded).toHaveLength(1);
    const entry = db.recorded[0];
    expect(entry?.kind).toBe('execute');
    expect(entry?.sql).toBe('UPDATE users SET active = $1 WHERE id = $2');
    expect(entry?.params).toEqual([true, 7]);
  });

  it('reset() clears all recorded queries', async () => {
    const db = mockPgClient();
    await db.$queryRaw`SELECT 1`;
    await db.$executeRaw`UPDATE x SET y = ${1}`;
    expect(db.recorded).toHaveLength(2);
    db.reset();
    expect(db.recorded).toHaveLength(0);
  });

  it('$disconnect resolves without error', async () => {
    const db = mockPgClient();
    await expect(db.$disconnect()).resolves.toBeUndefined();
  });

  it('PgClientLike narrows assignable types and excludes incompatible ones', () => {
    // Compile-time assertion: assignment + never check.
    const db: PgClient = mockPgClient();
    const narrowed: PgClientLike<typeof db> = db;
    expect(typeof narrowed.$queryRaw).toBe('function');

    type NotAClient = { foo: string };
    type Narrowed = PgClientLike<NotAClient>;
    const sentinel: Narrowed extends never ? true : false = true;
    expect(sentinel).toBe(true);
  });
});
