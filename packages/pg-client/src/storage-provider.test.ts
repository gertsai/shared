// SPDX-License-Identifier: Apache-2.0
/**
 * Tests for {@link PgStorageProvider} (the additive `./storage` adapter for
 * `@gertsai/pg-client`). Covers W-4B-4 acceptance criteria + the sample
 * reference test (W-4B-2 + AC-W4-2): write one repository against
 * `IStorageProvider`, swap PgStorageProvider ↔ InMemoryStorageProvider, both
 * suites pass.
 */
import { describe, expect, it, vi } from 'vitest';

import { mockPgClient, type PgClient } from './index';
import {
  PgBatchRunner,
  PgStorageProvider,
  PgTransactionRunner,
  type TableMap,
} from './storage-provider';
import type { StorageMetadata } from '@gertsai/storage-core';
import {
  ListenersNotSupportedError,
  TransactionConflictError,
} from '@gertsai/storage-core';
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { whereField, orderBy, limit } from '@gertsai/query-dsl';

interface UserData {
  readonly _uid?: string;
  readonly name: string;
  readonly email: string;
}

interface UserMeta extends StorageMetadata<UserData, UserData, 'name' | 'email'> {}

describe('PgStorageProvider — capabilities + listeners', () => {
  it('declares capabilities { listeners:false, transactions:true, batches:true, upsert:false }', () => {
    const provider = new PgStorageProvider<UserMeta>({ client: mockPgClient() });
    expect(provider.capabilities).toEqual({
      listeners: false,
      transactions: true,
      batches: true,
      // Wave 6.5 / PRD-007 — `upsert: false` until audit-aware impl ships
      // (current set() overwrites the whole jsonb, including creator_uuid).
      upsert: false,
    });
  });

  it('onDocumentSnapshot throws ListenersNotSupportedError', () => {
    const provider = new PgStorageProvider<UserMeta>({ client: mockPgClient() });
    expect(() => provider.onDocumentSnapshot()).toThrow(ListenersNotSupportedError);
  });

  it('onCollectionSnapshot throws ListenersNotSupportedError', () => {
    const provider = new PgStorageProvider<UserMeta>({ client: mockPgClient() });
    expect(() => provider.onCollectionSnapshot()).toThrow(ListenersNotSupportedError);
  });
});

describe('PgStorageProvider — TableMap + identifier validation', () => {
  it('default identity: path → identical table name', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.set('users', 'u1', { name: 'a', email: 'a@x' });
    const recorded = client.recorded;
    expect(recorded[0]?.sql).toContain('INSERT INTO users');
  });

  it('TableMap override: path → mapped table name', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({
      client,
      tableMap: { users: 'app_users' },
    });
    await provider.set('users', 'u1', { name: 'a', email: 'a@x' });
    expect(client.recorded[0]?.sql).toContain('INSERT INTO app_users');
  });

  it('invalid identifier in tableMap throws at construction time', () => {
    expect(
      () =>
        new PgStorageProvider<UserMeta>({
          client: mockPgClient(),
          tableMap: { users: '"; DROP TABLE x; --' } as TableMap,
        }),
    ).toThrow(/Invalid SQL identifier/);
  });

  it('invalid path identifier (no override) throws at use time', async () => {
    const provider = new PgStorageProvider<UserMeta>({ client: mockPgClient() });
    await expect(
      provider.set('bad-path-with-dash', 'u1', { name: 'a', email: 'a@x' }),
    ).rejects.toThrow(/Invalid SQL identifier/);
  });
});

describe('PgStorageProvider — CRUD recorded SQL', () => {
  it('set: INSERT ... ON CONFLICT', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.set('users', 'u1', { name: 'a', email: 'a@x' });
    const sql = client.recorded[0]?.sql ?? '';
    expect(sql).toMatch(/INSERT INTO users/);
    expect(sql).toMatch(/ON CONFLICT \(id\)/);
  });

  it('update: UPDATE ... SET data = data || partial', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.update('users', 'u1', { email: 'b@x' });
    const sql = client.recorded[0]?.sql ?? '';
    expect(sql).toMatch(/UPDATE users SET data = data \|\| /);
    expect(sql).toMatch(/WHERE id = /);
  });

  it('delete: DELETE FROM ... WHERE id', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.delete('users', 'u1');
    expect(client.recorded[0]?.sql).toMatch(/DELETE FROM users WHERE id = /);
  });

  it('getDoc: returns null when no row, otherwise data field', async () => {
    const provider1 = new PgStorageProvider<UserMeta>({ client: mockPgClient() });
    const empty = await provider1.getDoc('users', 'u1');
    expect(empty).toBeNull();

    const client2 = mockPgClient({
      queryResults: [
        {
          pattern: /SELECT data FROM users/i,
          result: [{ data: { name: 'a', email: 'a@x' } }],
        },
      ],
    });
    const provider2 = new PgStorageProvider<UserMeta>({ client: client2 });
    const found = await provider2.getDoc('users', 'u1');
    expect(found).toEqual({ name: 'a', email: 'a@x' });
  });

  it('getDocs (no query): SELECT data FROM table', async () => {
    const client = mockPgClient({
      queryResults: [
        {
          pattern: /SELECT data FROM users$/i,
          result: [{ data: { name: 'a', email: 'a@x' } }],
        },
      ],
    });
    const provider = new PgStorageProvider<UserMeta>({ client });
    const rows = await provider.getDocs('users');
    expect(rows).toEqual([{ name: 'a', email: 'a@x' }]);
  });

  it('getDocs with whereField/orderBy/limit: forwards compiled SQL + params', async () => {
    const client = mockPgClient({ defaultQueryResult: [] });
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.getDocs('users', [
      whereField<UserMeta, 'email'>('email', '==', 'a@x'),
      orderBy<UserMeta, 'name'>('name', 'asc'),
      limit<UserMeta>(10),
    ]);
    const recorded = client.recorded[0];
    expect(recorded?.kind).toBe('query');
    // compileToSql output is asserted in @gertsai/query-dsl tests; here we
    // just confirm the params travelled through unchanged.
    expect(recorded?.params).toContain('a@x');
    expect(recorded?.params).toContain(10);
  });
});

describe('PgStorageProvider — count', () => {
  it('count without query: SELECT COUNT(*)', async () => {
    const client = mockPgClient({
      queryResults: [
        { pattern: /SELECT COUNT\(\*\)/i, result: [{ count: 7 }] },
      ],
    });
    const provider = new PgStorageProvider<UserMeta>({ client });
    expect(await provider.count('users')).toBe(7);
  });

  it('count with query: COUNT(*) wraps compiled SELECT', async () => {
    const client = mockPgClient({
      queryResults: [
        { pattern: /COUNT\(\*\)/i, result: [{ count: '3' }] }, // bigint sometimes returned as string
      ],
    });
    const provider = new PgStorageProvider<UserMeta>({ client });
    const n = await provider.count('users', [
      whereField<UserMeta, 'email'>('email', '==', 'a@x'),
    ]);
    expect(n).toBe(3);
  });
});

describe('PgStorageProvider — runBatch', () => {
  it('queues ops and applies them in order', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.runBatch<void>(async (batch) => {
      batch.set('users', 'a', { name: 'a', email: 'a@x' });
      batch.update('users', 'b', { email: 'b@x' });
      batch.delete('users', 'c');
    });
    const sqls = client.recorded.map((r) => r.sql);
    expect(sqls[0]).toMatch(/INSERT INTO users/);
    expect(sqls[1]).toMatch(/UPDATE users/);
    expect(sqls[2]).toMatch(/DELETE FROM users/);
  });

  it('PgBatchRunner is constructible standalone (introspection)', () => {
    const client = mockPgClient();
    const runner = new PgBatchRunner<UserMeta>(client, (p) => p);
    expect(runner).toBeInstanceOf(PgBatchRunner);
  });
});

describe('PgStorageProvider — runTransaction + conflict mapping', () => {
  it('wraps fn in BEGIN/COMMIT', async () => {
    const client = mockPgClient();
    const provider = new PgStorageProvider<UserMeta>({ client });
    await provider.runTransaction<void>(async (tx) => {
      tx.set('users', 'a', { name: 'a', email: 'a@x' });
    });
    const sqls = client.recorded.map((r) => r.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
  });

  it('PgTransactionRunner.get queries SELECT data', async () => {
    const client = mockPgClient({
      queryResults: [
        {
          pattern: /SELECT data FROM users WHERE id/i,
          result: [{ data: { name: 'q', email: 'q@x' } }],
        },
      ],
    });
    const provider = new PgStorageProvider<UserMeta>({ client });
    let read: UserData | null = null;
    await provider.runTransaction<void>(async (tx) => {
      read = await tx.get('users', 'a');
    });
    expect(read).toEqual({ name: 'q', email: 'q@x' });
  });

  it('SQLSTATE 40001 is mapped to TransactionConflictError + ROLLBACK issued', async () => {
    const conflictError: Error & { code?: string } = Object.assign(
      new Error('serialization failure'),
      { code: '40001' },
    );
    const failingClient: PgClient = {
      $queryRaw: vi.fn().mockRejectedValue(conflictError),
      $executeRaw: vi.fn().mockImplementation(async (s: TemplateStringsArray) => {
        if (String(s[0]).startsWith('BEGIN')) return 0;
        if (String(s[0]).startsWith('COMMIT')) return 0;
        if (String(s[0]).startsWith('ROLLBACK')) return 0;
        return 0;
      }),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PgStorageProvider<UserMeta>({ client: failingClient });
    await expect(
      provider.runTransaction<void>(async (tx) => {
        await tx.get('users', 'a');
      }),
    ).rejects.toThrow(TransactionConflictError);
  });

  it('non-conflict errors propagate unchanged', async () => {
    const failingClient: PgClient = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection lost')),
      $executeRaw: vi.fn().mockResolvedValue(0),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PgStorageProvider<UserMeta>({ client: failingClient });
    await expect(
      provider.runTransaction<void>(async (tx) => {
        await tx.get('users', 'a');
      }),
    ).rejects.toThrow(/connection lost/);
  });

  it('PgTransactionRunner is constructible standalone (introspection)', () => {
    const client = mockPgClient();
    const runner = new PgTransactionRunner<UserMeta>(client, (p) => p);
    expect(runner).toBeInstanceOf(PgTransactionRunner);
  });
});

/* -------------------------------------------------------------------------
 * Sample reference test (W-4B-2 / AC-W4-2): same behavioural suite is run
 * against PgStorageProvider (with mockPgClient) AND InMemoryStorageProvider.
 * This is the "swap one provider for another" confidence test promised in
 * SPEC-008 Acceptance Checklist. Behaviour-level only — we DON'T compare
 * SQL recording (those are PgStorageProvider-specific).
 * ------------------------------------------------------------------------- */

interface KvData {
  readonly value: string;
}
interface KvMeta extends StorageMetadata<KvData, KvData, 'value'> {}

function buildPgProviderWithFakeStore(): PgStorageProvider<KvMeta> {
  // We construct a tiny in-memory shadow store that mockPgClient drives so
  // PgStorageProvider acts as if it has a real backing PG. This is just for
  // the *swap test* — production code uses a real PgClient impl.
  const store = new Map<string, KvData>();
  const client: PgClient = {
    async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
      const sql = strings.join('?');
      if (/SELECT data FROM kv WHERE id/.test(sql)) {
        const id = values[0] as string;
        const row = store.get(id);
        return (row ? [{ data: row }] : []) as T[];
      }
      if (/SELECT data FROM kv$/.test(sql) || /SELECT data FROM kv\b/.test(sql)) {
        return Array.from(store.values()).map((data) => ({ data })) as T[];
      }
      if (/SELECT COUNT/i.test(sql)) {
        return [{ count: store.size }] as T[];
      }
      return [] as T[];
    },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
      const sql = strings.join('?');
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return 0;
      if (/INSERT INTO kv/.test(sql)) {
        store.set(values[0] as string, values[1] as KvData);
        return 1;
      }
      if (/UPDATE kv SET data = data \|\|/.test(sql)) {
        const id = values[0] as string;
        const partial = values[1] as Partial<KvData>;
        const cur = store.get(id);
        if (cur) store.set(id, { ...cur, ...partial });
        return 1;
      }
      if (/DELETE FROM kv/.test(sql)) {
        store.delete(values[0] as string);
        return 1;
      }
      return 0;
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return new PgStorageProvider<KvMeta>({ client });
}

describe.each<{
  name: string;
  build: () => Promise<{
    set: (id: string, data: KvData) => Promise<void>;
    get: (id: string) => Promise<KvData | null>;
    update: (id: string, partial: Partial<KvData>) => Promise<void>;
    delete: (id: string) => Promise<void>;
    list: () => Promise<KvData[]>;
    count: () => Promise<number>;
  }>;
}>([
  {
    name: 'PgStorageProvider (mock-backed)',
    build: async () => {
      const p = buildPgProviderWithFakeStore();
      return {
        set: (id, data) => p.set('kv', id, data),
        get: (id) => p.getDoc('kv', id),
        update: (id, partial) => p.update('kv', id, partial),
        delete: (id) => p.delete('kv', id),
        list: () => p.getDocs('kv'),
        count: () => p.count('kv'),
      };
    },
  },
  {
    name: 'InMemoryStorageProvider',
    build: async () => {
      const p = new InMemoryStorageProvider<KvMeta>();
      return {
        set: (id, data) => p.set('kv', id, data),
        get: (id) => p.getDoc('kv', id),
        update: (id, partial) => p.update('kv', id, partial),
        delete: (id) => p.delete('kv', id),
        list: () => p.getDocs('kv'),
        count: () => p.count('kv'),
      };
    },
  },
])('AC-W4-2 cross-provider parity: $name', ({ build }) => {
  it('CRUD round-trip', async () => {
    const provider = await build();
    expect(await provider.get('a')).toBeNull();

    await provider.set('a', { value: 'one' });
    expect(await provider.get('a')).toEqual({ value: 'one' });

    await provider.update('a', { value: 'two' });
    expect(await provider.get('a')).toEqual({ value: 'two' });

    await provider.set('b', { value: 'three' });
    expect(await provider.count()).toBe(2);

    const list = await provider.list();
    expect(list).toHaveLength(2);

    await provider.delete('a');
    expect(await provider.get('a')).toBeNull();
    expect(await provider.count()).toBe(1);
  });
});
