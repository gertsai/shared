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
    expect((cb.mock.calls.at(-1)![0] as unknown[]).length).toBe(1);
    await p.set('users', 'u2', { name: 'B', age: 2 });
    expect((cb.mock.calls.at(-1)![0] as unknown[]).length).toBe(2);
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

describe('InMemoryStorageProvider — getDocs/count apply Query<Meta>', () => {
  it('getDocs applies WhereOp filter (parity with PgStorageProvider/compileToSql)', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.set('users', 'u2', { name: 'B', age: 5 });
    await p.set('users', 'u3', { name: 'C', age: 9 });
    const out = await p.getDocs(
      'users',
      [{ kind: 'where', field: 'age', op: '>=', value: 5 }] as never,
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['B', 'C']);
  });

  it('count applies the same filter as getDocs', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.set('users', 'u2', { name: 'B', age: 5 });
    await p.set('users', 'u3', { name: 'C', age: 9 });
    const n = await p.count(
      'users',
      [{ kind: 'where', field: 'age', op: '<', value: 5 }] as never,
    );
    expect(n).toBe(1);
  });

  it('getDocs orders + limits per query (parity with compileToSql ORDER BY/LIMIT)', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.set('users', 'u2', { name: 'B', age: 5 });
    await p.set('users', 'u3', { name: 'C', age: 9 });
    const out = await p.getDocs(
      'users',
      [
        { kind: 'orderBy', field: 'age', direction: 'desc' },
        { kind: 'limit', value: 2 },
      ] as never,
    );
    expect(out.map((u) => u.age)).toEqual([9, 5]);
  });

  it('onCollectionSnapshot fires only docs matching the listener query', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    const cb = vi.fn();
    const off = p.onCollectionSnapshot(
      'users',
      [{ kind: 'where', field: 'age', op: '>=', value: 5 }] as never,
      cb,
    );
    await p.set('users', 'u1', { name: 'A', age: 1 });
    await p.set('users', 'u2', { name: 'B', age: 5 });
    const last = cb.mock.calls[cb.mock.calls.length - 1]?.[0] as Array<{
      readonly name: string;
    }>;
    expect(last.map((u) => u.name)).toEqual(['B']);
    off();
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

  it('write-only transaction (no reads) commits when target slot is undisturbed', async () => {
    // Wave 21 / EVID-076 FR-X1: blind writes are now version-checked,
    // but the check passes here because the target slot is empty
    // before the tx queues `set` AND remains empty until commit.
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

// Wave 21 / EVID-076 FR-X1 + FR-X2 — concurrent commit semantics.
describe('InMemoryStorageProvider — concurrent runTransaction (Wave 21 FR-X2)', () => {
  it('two concurrent tx that both blind-write the same key: 2nd throws TransactionConflictError', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    // Seed the slot so version starts at 1.
    await p.set('users', 'u1', { name: 'seed', age: 0 });

    // Two transactions both snapshot at version=1, queue blind writes,
    // then commit serially. The first wins; the second throws because
    // the version drifted (now 2) after the first commit.
    const tx1Promise = p.runTransaction(async (tx) => {
      tx.update('users', 'u1', { age: 1 });
    });
    await tx1Promise;

    // tx2's snapshot was taken before tx1 committed — re-create that
    // scenario explicitly by snapshotting then mutating externally.
    await expect(
      p.runTransaction(async (tx) => {
        tx.update('users', 'u1', { age: 2 });
        // External mutation between snapshot (above) and commit (below)
        // — bumps the live version past the snapshot's recording.
        await p.update('users', 'u1', { age: 99 });
      }),
    ).rejects.toThrow(TransactionConflictError);

    // Live store reflects the external write (99), not the tx2 attempt.
    expect((await p.getDoc('users', 'u1'))?.age).toBe(99);
  });

  it('write-without-read uses pre-tx version for the check', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });

    await expect(
      p.runTransaction(async (tx) => {
        // No tx.get on 'u1' — but the queue op still snapshots version=1.
        tx.update('users', 'u1', { age: 2 });
        // External mutation bumps version to 2.
        await p.update('users', 'u1', { age: 99 });
      }),
    ).rejects.toThrow(TransactionConflictError);
  });

  it('concurrent tx on disjoint keys both commit (per-key merge, not whole-map swap)', async () => {
    // Wave 21 / EVID-076 FR-X1 (H-ENT-1) regression: pre-Wave-21 commit
    // replaced the whole `collections` map with the tx's snapshot, so
    // two interleaved txns on the same path clobbered each other even
    // when they wrote DIFFERENT keys.
    const p = new InMemoryStorageProvider<UserMeta>();

    // Interleave tx1 and tx2 manually so both snapshot the same empty
    // collection map BEFORE either commits.
    let resolveTx1: (() => void) | null = null;
    const tx1Started = new Promise<void>((r) => {
      resolveTx1 = r;
    });

    const tx1 = p.runTransaction(async (tx) => {
      tx.set('users', 'a', { name: 'A', age: 1 });
      // Hand control back so tx2 can start with the same snapshot.
      resolveTx1?.();
      await new Promise((r) => setTimeout(r, 5));
    });

    await tx1Started;
    const tx2 = p.runTransaction(async (tx) => {
      tx.set('users', 'b', { name: 'B', age: 2 });
    });

    await Promise.all([tx1, tx2]);

    // Both writes survived (pre-Wave-21 would have lost one).
    expect(await p.getDoc('users', 'a')).toEqual({ name: 'A', age: 1 });
    expect(await p.getDoc('users', 'b')).toEqual({ name: 'B', age: 2 });
    expect(await p.count('users')).toBe(2);
  });

  it('reset/retry path works after a TransactionConflictError', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });

    // First attempt fails because we mutate externally mid-tx.
    await expect(
      p.runTransaction(async (tx) => {
        await tx.get('users', 'u1');
        await p.update('users', 'u1', { age: 99 });
        tx.update('users', 'u1', { age: 2 });
      }),
    ).rejects.toThrow(TransactionConflictError);

    // Retry — clean re-snapshot, no leftover state from the failed run.
    const retried = await p.runTransaction(async (tx) => {
      const cur = await tx.get('users', 'u1');
      tx.update('users', 'u1', { age: (cur?.age ?? 0) + 1 });
      return 'committed';
    });
    expect(retried).toBe('committed');
    expect((await p.getDoc('users', 'u1'))?.age).toBe(100);
  });
});

describe('InMemoryStorageProvider — concurrent runBatch (Wave 21 FR-X2)', () => {
  it('concurrent batches on disjoint keys both commit', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();

    let resolveB1: (() => void) | null = null;
    const b1Started = new Promise<void>((r) => {
      resolveB1 = r;
    });

    const b1 = p.runBatch(async (b) => {
      b.set('users', 'a', { name: 'A', age: 1 });
      resolveB1?.();
      await new Promise((r) => setTimeout(r, 5));
    });
    await b1Started;
    const b2 = p.runBatch(async (b) => {
      b.set('users', 'b', { name: 'B', age: 2 });
    });

    await Promise.all([b1, b2]);
    expect(await p.getDoc('users', 'a')).toEqual({ name: 'A', age: 1 });
    expect(await p.getDoc('users', 'b')).toEqual({ name: 'B', age: 2 });
  });

  it('batch blind-write conflicts when the live version drifts during the callback', async () => {
    const p = new InMemoryStorageProvider<UserMeta>();
    await p.set('users', 'u1', { name: 'A', age: 1 });

    await expect(
      p.runBatch(async (b) => {
        // Snapshot version=1 at this queue.
        b.update('users', 'u1', { age: 2 });
        // External mutation bumps version to 2 before commit.
        await p.update('users', 'u1', { age: 99 });
      }),
    ).rejects.toThrow(TransactionConflictError);

    // Live store reflects the external write.
    expect((await p.getDoc('users', 'u1'))?.age).toBe(99);
  });
});
