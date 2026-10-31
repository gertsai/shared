// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { InMemoryStorageProvider } from '../InMemoryStorageProvider';
import type { StorageMetadata } from '@gertsai/storage-core';

type Data = Record<string, unknown>;
type Meta = StorageMetadata<Data, Data>;

const provider = (): InMemoryStorageProvider<Meta> =>
  new InMemoryStorageProvider<Meta>();

describe('InMemoryStorageProvider atomic commits', () => {
  it.each(['set', 'update'] as const)(
    'batch aborts every queued write after a stale %s CAS',
    async (kind) => {
      const p = provider();
      await p.set('users', 'current', { name: 'before', update_version: 2 });
      const docListener = vi.fn();
      const collectionListener = vi.fn();
      p.onDocumentSnapshot('users', 'new', docListener);
      p.onCollectionSnapshot('users', [], collectionListener);
      docListener.mockClear();
      collectionListener.mockClear();

      await expect(
        p.runBatch(async (batch) => {
          batch.set('users', 'new', { name: 'must-not-commit' });
          if (kind === 'set') {
            batch.set(
              'users',
              'current',
              { name: 'stale-set', update_version: 1 },
              { expectedVersion: 1 },
            );
          } else {
            batch.update(
              'users',
              'current',
              { name: 'stale-update' },
              { expectedVersion: 1 },
            );
          }
        }),
      ).rejects.toMatchObject({ name: 'VersionConflictError' });

      expect(await p.getDoc('users', 'new')).toBeNull();
      expect(await p.getDoc('users', 'current')).toEqual({
        name: 'before',
        update_version: 2,
      });
      expect(docListener).not.toHaveBeenCalled();
      expect(collectionListener).not.toHaveBeenCalled();
    },
  );

  it.each(['set', 'update'] as const)(
    'transaction aborts every queued write after a stale %s CAS',
    async (kind) => {
      const p = provider();
      await p.set('users', 'current', { name: 'before', update_version: 2 });
      const docListener = vi.fn();
      const collectionListener = vi.fn();
      p.onDocumentSnapshot('users', 'new', docListener);
      p.onCollectionSnapshot('users', [], collectionListener);
      docListener.mockClear();
      collectionListener.mockClear();

      await expect(
        p.runTransaction(async (tx) => {
          tx.set('users', 'new', { name: 'must-not-commit' });
          if (kind === 'set') {
            tx.set(
              'users',
              'current',
              { name: 'stale-set', update_version: 1 },
              { expectedVersion: 1 },
            );
          } else {
            tx.update(
              'users',
              'current',
              { name: 'stale-update' },
              { expectedVersion: 1 },
            );
          }
        }),
      ).rejects.toMatchObject({ name: 'VersionConflictError' });

      expect(await p.getDoc('users', 'new')).toBeNull();
      expect(await p.getDoc('users', 'current')).toEqual({
        name: 'before',
        update_version: 2,
      });
      expect(docListener).not.toHaveBeenCalled();
      expect(collectionListener).not.toHaveBeenCalled();
    },
  );

  it('applies multiple queued writes to the same key in order', async () => {
    const p = provider();
    await p.set('users', 'u1', { name: 'before', update_version: 4 });
    await p.runBatch(async (batch) => {
      batch.update('users', 'u1', { name: 'updated', update_version: 500 });
      batch.set('users', 'u1', { extra: true, update_version: 900 });
    });

    expect(await p.getDoc('users', 'u1')).toEqual({
      name: 'updated',
      update_version: 6,
      extra: true,
    });
  });

  it('transaction blind merge-set reads the committed fields and final version', async () => {
    const p = provider();
    await p.set('users', 'u1', {
      name: 'before',
      retained: 'yes',
      update_version: 4,
    });

    const local = await p.runTransaction(async (tx) => {
      tx.set('users', 'u1', { name: 'after', update_version: 1 });
      return tx.get('users', 'u1');
    });

    expect(local).toEqual({
      name: 'after',
      retained: 'yes',
      update_version: 5,
    });
    expect(await p.getDoc('users', 'u1')).toEqual(local);
  });

  it('batch commits the payload snapshot captured when each write is queued', async () => {
    const p = provider();
    const payload = { name: 'queued', nested: { value: 1 } };

    await p.runBatch(async (batch) => {
      batch.set('users', 'u1', payload);
      payload.name = 'mutated';
      payload.nested.value = 2;
    });

    expect(await p.getDoc('users', 'u1')).toEqual({
      name: 'queued',
      nested: { value: 1 },
    });
  });

  it('transaction local read and commit share the queued payload snapshot', async () => {
    const p = provider();
    const payload = { name: 'queued', nested: { value: 1 } };

    const local = await p.runTransaction(async (tx) => {
      tx.set('users', 'u1', payload);
      payload.name = 'mutated';
      payload.nested.value = 2;
      return tx.get('users', 'u1');
    });

    expect(local).toEqual({ name: 'queued', nested: { value: 1 } });
    expect(await p.getDoc('users', 'u1')).toEqual(local);
  });

  it('batch clone failure leaves earlier writes and notifications unpublished', async () => {
    const p = provider();
    await p.set('users', 'existing', { value: 'before' });
    const docListener = vi.fn();
    const collectionListener = vi.fn();
    p.onDocumentSnapshot('users', 'new', docListener);
    p.onCollectionSnapshot('users', [], collectionListener);
    docListener.mockClear();
    collectionListener.mockClear();

    await expect(
      p.runBatch(async (batch) => {
        batch.set('users', 'new', { value: 'first' });
        batch.set('users', 'uncloneable', {
          value: () => 'cannot structuredClone a function',
        });
      }),
    ).rejects.toThrow();

    expect(await p.getDoc('users', 'existing')).toEqual({ value: 'before' });
    expect(await p.getDoc('users', 'new')).toBeNull();
    expect(await p.getDoc('users', 'uncloneable')).toBeNull();
    expect(docListener).not.toHaveBeenCalled();
    expect(collectionListener).not.toHaveBeenCalled();
  });

  it('transaction clone failure leaves earlier writes and notifications unpublished', async () => {
    const p = provider();
    await p.set('users', 'existing', { value: 'before' });
    const docListener = vi.fn();
    const collectionListener = vi.fn();
    p.onDocumentSnapshot('users', 'new', docListener);
    p.onCollectionSnapshot('users', [], collectionListener);
    docListener.mockClear();
    collectionListener.mockClear();

    await expect(
      p.runTransaction(async (tx) => {
        tx.set('users', 'new', { value: 'first' });
        tx.set('users', 'uncloneable', {
          value: () => 'cannot structuredClone a function',
        });
      }),
    ).rejects.toThrow();

    expect(await p.getDoc('users', 'existing')).toEqual({ value: 'before' });
    expect(await p.getDoc('users', 'new')).toBeNull();
    expect(await p.getDoc('users', 'uncloneable')).toBeNull();
    expect(docListener).not.toHaveBeenCalled();
    expect(collectionListener).not.toHaveBeenCalled();
  });

  it('direct and queued updates of missing rows never create ghost rows', async () => {
    const p = provider();

    await p.update('users', 'direct-missing', { value: 'ignored' });
    await p.runBatch(async (batch) => {
      batch.update('users', 'batch-missing', { value: 'ignored' });
    });
    const transactionRead = await p.runTransaction(async (tx) => {
      tx.update('users', 'transaction-missing', { value: 'ignored' });
      return tx.get('users', 'transaction-missing');
    });

    expect(transactionRead).toBeNull();
    expect(await p.getDoc('users', 'direct-missing')).toBeNull();
    expect(await p.getDoc('users', 'batch-missing')).toBeNull();
    expect(await p.getDoc('users', 'transaction-missing')).toBeNull();
    expect(await p.count('users')).toBe(0);
  });
});
