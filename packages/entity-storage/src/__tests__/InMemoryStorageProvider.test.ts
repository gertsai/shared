// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { InMemoryStorageProvider } from '../InMemoryStorageProvider';
import {
  TransactionConflictError,
  type StorageMetadata,
} from '@gertsai/storage-core';

interface UserData {
  readonly _uid?: string;
  readonly name: string;
  readonly age: number;
}
type UserMeta = StorageMetadata<UserData, UserData, 'name' | 'age'>;

describe('InMemoryStorageProvider — capabilities + CRUD', () => {
  it('declares full capabilities (listeners, transactions, batches all true)', () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    expect(p.capabilities.listeners).toBe(true);
    expect(p.capabilities.transactions).toBe(true);
    expect(p.capabilities.batches).toBe(true);
  });

  it('set / getDoc round-trip', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    expect(await p.getDoc('users', 'u1')).toEqual({ name: 'A', age: 1 });
  });

  it('getDoc returns null when absent', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    expect(await p.getDoc('users', 'missing')).toBeNull();
  });

  it('update merges partials onto existing record', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.update('users', 'u1', { age: 2 });
    expect(await p.getDoc('users', 'u1')).toEqual({ name: 'A', age: 2 });
  });

  it('delete removes the doc', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.delete('users', 'u1');
    expect(await p.getDoc('users', 'u1')).toBeNull();
  });

  it('count + getDocs reflect collection contents', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    expect(await p.count('users')).toBe(0);
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.set('users', 'u2', { name: 'B', age: 2 });
    expect(await p.count('users')).toBe(2);
    const docs = await p.getDocs('users');
    expect(docs.length).toBe(2);
  });

  it('cross-collection isolation — separate maps per path', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('a', 'x', { name: 'A', age: 1 });
    await p.set('b', 'x', { name: 'B', age: 2 });
    expect(await p.getDoc('a', 'x')).toEqual({ name: 'A', age: 1 });
    expect(await p.getDoc('b', 'x')).toEqual({ name: 'B', age: 2 });
    expect(await p.count('a')).toBe(1);
    expect(await p.count('b')).toBe(1);
  });
});

describe('InMemoryStorageProvider — listeners', () => {
  it('onDocumentSnapshot fires on insert, update, delete', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    const cb = vi.fn();
    const off = p.onDocumentSnapshot('users', 'u1', cb);
    // Initial fires sync with null (doc absent).
    expect(cb).toHaveBeenCalledWith(null);

    await p.set('users', 'u1', { name: 'A', age: 1 });
    expect(cb).toHaveBeenLastCalledWith({ name: 'A', age: 1 });

    await p.update('users', 'u1', { age: 2 });
    expect(cb).toHaveBeenLastCalledWith({ name: 'A', age: 2 });

    await p.delete('users', 'u1');
    expect(cb).toHaveBeenLastCalledWith(null);
    off();
  });

  it('unsubscribing prevents further notifications', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    const cb = vi.fn();
    const off = p.onDocumentSnapshot('users', 'u1', cb);
    cb.mockClear();
    off();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('onCollectionSnapshot fires on each mutation', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    const cb = vi.fn();
    const off = p.onCollectionSnapshot('users', [], cb);
    // Initial fires sync with [].
    expect(cb).toHaveBeenLastCalledWith([]);
    await p.set('users', 'u1', { name: 'A', age: 1 });
    expect((cb.mock.calls[cb.mock.calls.length - 1]?.[0] as unknown[]).length).toBe(1);
    await p.set('users', 'u2', { name: 'B', age: 2 });
    expect((cb.mock.calls[cb.mock.calls.length - 1]?.[0] as unknown[]).length).toBe(2);
    off();
  });
});

describe('InMemoryStorageProvider — runBatch', () => {
  it('applies all writes atomically on success', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.runBatch(async (b) => {
      b.set('users', 'u1', { name: 'A', age: 1 });
      b.set('users', 'u2', { name: 'B', age: 2 });
      b.update('users', 'u1', { age: 11 });
    });
    expect(await p.getDoc('users', 'u1')).toEqual({ name: 'A', age: 11 });
    expect(await p.getDoc('users', 'u2')).toEqual({ name: 'B', age: 2 });
  });

  it('rolls back when fn throws (no partial mutations visible)', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'pre', age: 0 });
    await expect(
      p.runBatch(async (b) => {
        b.set('users', 'u2', { name: 'B', age: 2 });
        b.update('users', 'u1', { age: 99 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // u1 unchanged, u2 never created.
    expect(await p.getDoc('users', 'u1')).toEqual({ name: 'pre', age: 0 });
    expect(await p.getDoc('users', 'u2')).toBeNull();
  });

  it('emits listener notifications only after successful commit', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    const cb = vi.fn();
    p.onDocumentSnapshot('users', 'u1', cb);
    cb.mockClear();
    await p.runBatch(async (b) => {
      b.set('users', 'u1', { name: 'A', age: 1 });
    });
    // Exactly one notification post-commit.
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith({ name: 'A', age: 1 });
  });
});

describe('InMemoryStorageProvider — runTransaction', () => {
  it('applies writes when no concurrent mutation observed', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    const result = await p.runTransaction(async (tx) => {
      const cur = await tx.get('users', 'u1');
      tx.update('users', 'u1', { age: (cur?.age ?? 0) + 1 });
      return 'ok';
    });
    expect(result).toBe('ok');
    expect((await p.getDoc('users', 'u1'))?.age).toBe(2);
  });

  it('throws TransactionConflictError on concurrent _version mismatch', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await expect(
      p.runTransaction(async (tx) => {
        await tx.get('users', 'u1');
        // External mutation between read and commit.
        await p.update('users', 'u1', { age: 99 });
        tx.update('users', 'u1', { age: 2 });
      }),
    ).rejects.toThrow(TransactionConflictError);
    // Live store reflects the external mutation only — not the tx write.
    expect((await p.getDoc('users', 'u1'))?.age).toBe(99);
  });

  it('write-only transaction (no reads) commits without conflict checks', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.runTransaction(async (tx) => {
      tx.set('users', 'u1', { name: 'A', age: 1 });
    });
    expect(await p.getDoc('users', 'u1')).toEqual({ name: 'A', age: 1 });
  });

  it('detects conflict when read on absent doc that gets created externally', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await expect(
      p.runTransaction(async (tx) => {
        await tx.get('users', 'u1'); // observed: absent
        await p.set('users', 'u1', { name: 'inserted-elsewhere', age: 1 });
        tx.update('users', 'u1', { age: 2 });
      }),
    ).rejects.toThrow(TransactionConflictError);
  });
});
