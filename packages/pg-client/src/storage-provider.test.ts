// SPDX-License-Identifier: Apache-2.0
/**
 * Tests for PgStorageProvider behavior that does not require PostgreSQL.
 * Write semantics are exercised by the real-PostgreSQL integration suite.
 */
import { describe, expect, it, vi } from 'vitest';

import { mockPgClient, type PgClient } from './index';
import {
  PgStorageProvider,
  type TableMap,
} from './storage-provider';
import type { StorageMetadata } from '@gertsai/storage-core';
import {
  ListenersNotSupportedError,
  TransactionConflictError,
} from '@gertsai/storage-core';
import { whereField } from '@gertsai/query-dsl';

interface UserData {
  readonly _uid?: string;
  readonly name: string;
  readonly email: string;
}

interface UserMeta extends StorageMetadata<UserData, UserData, 'name' | 'email'> {}

describe('PgStorageProvider — capabilities + listeners', () => {
  it('declares capabilities including audit-aware native upsert (Wave 7.2)', () => {
    const provider = new PgStorageProvider<UserMeta>({ client: mockPgClient() });
    expect(provider.capabilities).toEqual({
      listeners: false,
      transactions: true,
      batches: true,
      // Native upsert retains the original creator audit values on conflict.
      upsert: { supported: true, preservesCreatorAudit: true },
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

describe('PgStorageProvider — reads', () => {



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

});



describe('PgStorageProvider — runTransaction + conflict mapping', () => {
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

});
