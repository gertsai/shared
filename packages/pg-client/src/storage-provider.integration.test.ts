// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';

import { limit, offset, orderBy, whereField } from '@gertsai/query-dsl';
import { compileToSql } from '@gertsai/query-dsl/sql';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VersionConflictError, type StorageMetadata } from '@gertsai/storage-core';

import type { PgClient } from './index';
import { PgStorageProvider } from './storage-provider';

type TestMeta = StorageMetadata<
  Record<string, unknown>,
  Record<string, unknown>,
  'value' | 'score' | 'enabled'
>;

function toSql(strings: TemplateStringsArray, values: ReadonlyArray<unknown>): string {
  return strings.reduce(
    (sql, part, index) => sql + part + (index < values.length ? `$${index + 1}` : ''),
    '',
  );
}

const databaseUrl = process.env.PG_TEST_URL;
const pgDescribe = databaseUrl ? describe : describe.skip;

pgDescribe('PgStorageProvider version advancement (real PostgreSQL)', () => {
  const table = `pg_storage_version_${randomUUID().replaceAll('-', '')}`;
  let pool: Pool | undefined;
  let connection: PoolClient | undefined;
  let provider: PgStorageProvider<TestMeta>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    connection = await pool.connect();
    await connection.query(`CREATE TABLE ${table} (id text PRIMARY KEY, data jsonb NOT NULL)`);
    const client: PgClient = {
      $queryRaw: async <T>(strings: TemplateStringsArray, ...values: unknown[]) => {
        const result = await connection!.query(toSql(strings, values), [...values]);
        return result.rows as T[];
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const result = await connection!.query(toSql(strings, values), [...values]);
        return result.rowCount ?? 0;
      },
      $disconnect: async () => undefined,
    };
    provider = new PgStorageProvider<TestMeta>({
      client,
      tableMap: { records: table },
    });
  });

  beforeEach(async () => {
    await connection!.query(`TRUNCATE TABLE ${table}`);
  });

  afterAll(async () => {
    try {
      if (connection) {
        await connection.query(`DROP TABLE IF EXISTS ${table}`);
      }
    } finally {
      try {
        connection?.release();
      } finally {
        await pool?.end();
      }
    }
  });

  it('binds reordered and repeated update parameters and rejects stale ETags', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)`,
      ['row', { value: 'before', update_version: 4 }],
    );

    await provider.update('records', 'row', { value: 'after', update_version: 900 }, {
      expectedVersion: 4,
    });
    await expect(
      provider.update('records', 'row', { value: 'stale' }, { expectedVersion: 4 }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    expect(await provider.getDoc('records', 'row')).toEqual({
      value: 'after',
      update_version: 5,
    });
  });

  it('uses bigint CAS guards above the 32-bit integer limit for update and set', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)`,
      ['large-version', { value: 'before', update_version: 2147483647 }],
    );

    await provider.update('records', 'large-version', { value: 'updated' }, {
      expectedVersion: 2147483647,
    });
    expect(await provider.getDoc('records', 'large-version')).toEqual({
      value: 'updated',
      update_version: 2147483648,
    });

    await provider.set('records', 'large-version', { value: 'set' }, {
      expectedVersion: 2147483648,
    });
    expect(await provider.getDoc('records', 'large-version')).toEqual({
      value: 'set',
      update_version: 2147483649,
    });

    await expect(
      provider.update('records', 'large-version', { value: 'stale' }, {
        expectedVersion: 2147483647,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect(await provider.getDoc('records', 'large-version')).toEqual({
      value: 'set',
      update_version: 2147483649,
    });
  });

  it('advances versions for merge and overwrite set, but preserves insert seeds and unversioned rows', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2), ($3, $4)`,
      [
        'existing',
        { keep: true, update_version: 8 },
        'unversioned',
        { keep: true },
      ],
    );

    await provider.set('records', 'existing', { merged: true, update_version: 700 });
    expect(await provider.getDoc('records', 'existing')).toEqual({
      keep: true,
      merged: true,
      update_version: 9,
    });

    await provider.set('records', 'existing', { replaced: true, update_version: 700 }, {
      merge: false,
    });
    expect(await provider.getDoc('records', 'existing')).toEqual({
      replaced: true,
      update_version: 10,
    });

    await provider.set('records', 'fresh', { seeded: true, update_version: 41 });
    await provider.update('records', 'unversioned', { changed: true });
    expect(await provider.getDoc('records', 'fresh')).toEqual({
      seeded: true,
      update_version: 41,
    });
    expect(await provider.getDoc('records', 'unversioned')).toEqual({
      keep: true,
      changed: true,
    });
  });

  it('advances native upsert versions without replacing creator audit fields', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)`,
      [
        'row',
        {
          creator_uuid: 'original-creator',
          created_at: '2026-01-01T00:00:00.000Z',
          update_version: 12,
          value: 'before',
        },
      ],
    );

    await provider.upsertDoc('records', 'row', {
      creator_uuid: 'replacement-creator',
      created_at: '2026-02-01T00:00:00.000Z',
      update_version: 800,
      value: 'after',
    });

    expect(await provider.getDoc('records', 'row')).toEqual({
      creator_uuid: 'original-creator',
      created_at: '2026-01-01T00:00:00.000Z',
      update_version: 13,
      value: 'after',
    });
  });

  it('preserves fresh insert version seeds through native upsert', async () => {
    await provider.upsertDoc('records', 'fresh', { value: 'new', update_version: 22 });
    expect(await provider.getDoc('records', 'fresh')).toEqual({
      value: 'new',
      update_version: 22,
    });
  });

  it('rolls back a batch when a later version guard fails', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)`,
      ['row', { value: 'before', update_version: 3 }],
    );

    await expect(
      provider.runBatch(async (batch) => {
        batch.update('records', 'row', { value: 'first' }, { expectedVersion: 3 });
        batch.update('records', 'row', { value: 'stale' }, { expectedVersion: 3 });
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    expect(await provider.getDoc('records', 'row')).toEqual({
      value: 'before',
      update_version: 3,
    });
  });

  it('rolls back a transaction when a later version guard fails', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)`,
      ['row', { value: 'before', update_version: 5 }],
    );

    await expect(
      provider.runTransaction(async (tx) => {
        tx.update('records', 'row', { value: 'first' }, { expectedVersion: 5 });
        tx.update('records', 'row', { value: 'stale' }, { expectedVersion: 5 });
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    expect(await provider.getDoc('records', 'row')).toEqual({
      value: 'before',
      update_version: 5,
    });
  });

  it('executes query constraints with their compiled positional parameters', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2), ($3, $4)`,
      ['match', { value: 'wanted' }, 'other', { value: 'different' }],
    );

    const docs = await provider.getDocs('records', [
      whereField<TestMeta, 'value'>('value', '==', 'wanted'),
    ]);

    expect(docs).toEqual([{ value: 'wanted' }]);
  });

  it('queries JSONB scalar comparisons, membership, ordering, pagination, and count', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2), ($3, $4), ($5, $6)`,
      [
        'a', { value: 'group-a', score: 2, enabled: true },
        'b', { value: 'group-a', score: 10, enabled: true },
        'c', { value: 'group-b', score: 20, enabled: false },
      ],
    );

    const inDocs = await provider.getDocs('records', [
      whereField<TestMeta, 'value'>('value', 'in', ['group-a', 'group-b']),
    ]);
    expect(
      inDocs.sort(
        (left, right) =>
          String(left.value).localeCompare(String(right.value)) ||
          Number(left.score) - Number(right.score),
      ),
    ).toEqual([
      { value: 'group-a', score: 2, enabled: true },
      { value: 'group-a', score: 10, enabled: true },
      { value: 'group-b', score: 20, enabled: false },
    ]);

    const notInDocs = await provider.getDocs('records', [
      whereField<TestMeta, 'value'>('value', 'not-in', ['group-a']),
    ]);
    expect(notInDocs).toEqual([{ value: 'group-b', score: 20, enabled: false }]);

    const page = [
      whereField<TestMeta, 'score'>('score', '>=', 2),
      whereField<TestMeta, 'enabled'>('enabled', '==', true),
      orderBy<TestMeta, 'score'>('score', 'desc'),
      limit<TestMeta>(1),
      offset<TestMeta>(1),
    ];
    expect(await provider.getDocs('records', page)).toEqual([
      { value: 'group-a', score: 2, enabled: true },
    ]);
    expect(await provider.count('records', page)).toBe(1);
  });

  it('matches JSONB array members by type and handles empty candidates', async () => {
    await connection!.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
      [
        'string', { value: ['admin'] },
        'number', { value: [7] },
        'null', { value: [null] },
        'other', { value: ['viewer'] },
      ],
    );

    const matches = await provider.getDocs('records', [
      whereField<TestMeta, 'value'>('value', 'array-contains-any', [
        'admin',
        7,
        null,
      ]),
    ]);
    expect(
      matches.sort((left, right) =>
        JSON.stringify(left.value).localeCompare(JSON.stringify(right.value)),
      ),
    ).toEqual([
      { value: ['admin'] },
      { value: [7] },
      { value: [null] },
    ]);

    expect(
      await provider.getDocs('records', [
        whereField<TestMeta, 'value'>('value', 'array-contains-any', []),
      ]),
    ).toEqual([]);
  });

  it('compiles array-contains-any against a flat JSONB column named value', async () => {
    const flatTable = `pg_query_flat_${randomUUID().replaceAll('-', '')}`;

    try {
      await connection!.query(`CREATE TABLE ${flatTable} (value jsonb NOT NULL)`);
      await connection!.query(
        `INSERT INTO ${flatTable} (value) VALUES ($1::jsonb), ($2::jsonb), ($3::jsonb), ($4::jsonb)`,
        [
          JSON.stringify(['admin']),
          JSON.stringify([7]),
          JSON.stringify([null]),
          JSON.stringify(['viewer']),
        ],
      );

      const query = [
        whereField<TestMeta, 'value'>('value', 'array-contains-any', [
          'admin',
          7,
          null,
        ]),
      ];
      const compiledQuery = compileToSql(query, flatTable);
      const matches = await connection!.query<{ value: unknown }>(
        compiledQuery.sql,
        [...compiledQuery.params],
      );
      expect(
        matches.rows
          .map((row) => JSON.stringify(row.value))
          .sort(),
      ).toEqual(['["admin"]', '[7]', '[null]']);

      const emptyQuery = [
        whereField<TestMeta, 'value'>('value', 'array-contains-any', []),
      ];
      const compiledEmptyQuery = compileToSql(emptyQuery, flatTable);
      const emptyMatches = await connection!.query<{ value: unknown }>(
        compiledEmptyQuery.sql,
        [...compiledEmptyQuery.params],
      );
      expect(emptyMatches.rows).toEqual([]);
    } finally {
      await connection!.query(`DROP TABLE IF EXISTS ${flatTable}`);
    }
  });

});
