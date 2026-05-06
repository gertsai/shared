// SPDX-License-Identifier: Apache-2.0
/**
 * Runtime smoke for {@link defineStorageMetadata} and shape contracts of
 * {@link IStorageProvider}. Type-level invariants live in `types.test-d.ts`.
 */
import { describe, expect, it } from 'vitest';

import { defineStorageMetadata } from '../types';
import type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageCapabilities,
  StorageMetadata,
} from '../types';
import { ListenersNotSupportedError } from '../errors';

interface UserRead {
  id: string;
  email: string;
  age: number;
}

describe('defineStorageMetadata', () => {
  it('returns a phantom envelope (curried call shape)', () => {
    const meta = defineStorageMetadata<UserRead>()({
      indexed: ['id', 'email'] as const,
    });
    // Phantom-typed runtime properties exist (placeholder undefined).
    expect(meta).toHaveProperty('read');
    expect(meta).toHaveProperty('write');
    expect(meta).toHaveProperty('indexed');
  });

  it('preserves the indexed tuple at runtime under _runtimeIndexed', () => {
    const meta = defineStorageMetadata<UserRead>()({
      indexed: ['id', 'email'] as const,
    });
    // The helper stashes the literal tuple as a non-typed runtime field.
    const runtime = (meta as unknown as { _runtimeIndexed: readonly string[] })
      ._runtimeIndexed;
    expect(runtime).toEqual(['id', 'email']);
  });

  it('accepts an empty indexed tuple', () => {
    const meta = defineStorageMetadata<UserRead>()({ indexed: [] as const });
    const runtime = (meta as unknown as { _runtimeIndexed: readonly string[] })
      ._runtimeIndexed;
    expect(runtime).toEqual([]);
  });
});

// A minimal in-memory provider used as a structural fixture — not a
// production-quality adapter. Enough to demonstrate the interface is
// implementable and the listener throw-contract holds.
class TestProvider<Meta extends StorageMetadata> implements IStorageProvider<Meta> {
  readonly capabilities = {
    listeners: false,
    transactions: true,
    batches: true,
  } as const satisfies StorageCapabilities;

  private readonly store = new Map<string, Meta['read']>();

  private key(path: string, id: string) {
    return `${path}#${id}`;
  }

  async set(path: string, id: string, data: Meta['write']): Promise<void> {
    this.store.set(this.key(path, id), data as unknown as Meta['read']);
  }

  async getDoc(path: string, id: string): Promise<Meta['read'] | null> {
    return this.store.get(this.key(path, id)) ?? null;
  }

  async getDocs(path: string, _query?: Query<Meta>): Promise<Meta['read'][]> {
    const prefix = `${path}#`;
    const out: Meta['read'][] = [];
    for (const [k, v] of this.store) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }

  async count(path: string, query?: Query<Meta>): Promise<number> {
    return (await this.getDocs(path, query)).length;
  }

  async update(
    path: string,
    id: string,
    partial: Partial<Meta['write']>,
  ): Promise<void> {
    const cur = this.store.get(this.key(path, id));
    if (!cur) return;
    this.store.set(this.key(path, id), {
      ...(cur as object),
      ...(partial as object),
    } as Meta['read']);
  }

  async delete(path: string, id: string): Promise<void> {
    this.store.delete(this.key(path, id));
  }

  async runBatch<R>(fn: (batch: IBatchRunner<Meta>) => Promise<R>): Promise<R> {
    const ops: Array<() => Promise<void>> = [];
    const batch: IBatchRunner<Meta> = {
      set: (p, i, d) => {
        ops.push(() => this.set(p, i, d));
      },
      update: (p, i, d) => {
        ops.push(() => this.update(p, i, d));
      },
      delete: (p, i) => {
        ops.push(() => this.delete(p, i));
      },
    };
    const result = await fn(batch);
    for (const op of ops) await op();
    return result;
  }

  async runTransaction<R>(
    fn: (tx: ITransactionRunner<Meta>) => Promise<R>,
  ): Promise<R> {
    const ops: Array<() => Promise<void>> = [];
    const tx: ITransactionRunner<Meta> = {
      get: (p, i) => this.getDoc(p, i),
      set: (p, i, d) => {
        ops.push(() => this.set(p, i, d));
      },
      update: (p, i, d) => {
        ops.push(() => this.update(p, i, d));
      },
      delete: (p, i) => {
        ops.push(() => this.delete(p, i));
      },
    };
    const result = await fn(tx);
    for (const op of ops) await op();
    return result;
  }

  onDocumentSnapshot(
    _path: string,
    _id: string,
    _cb: (doc: Meta['read'] | null) => void,
  ): () => void {
    throw new ListenersNotSupportedError(
      'TestProvider does not implement listeners.',
    );
  }

  onCollectionSnapshot(
    _path: string,
    _query: Query<Meta>,
    _cb: (docs: Meta['read'][]) => void,
  ): () => void {
    throw new ListenersNotSupportedError(
      'TestProvider does not implement listeners.',
    );
  }
}

describe('IStorageProvider — structural conformance', () => {
  type UserMeta = StorageMetadata<UserRead, UserRead, 'id' | 'email'>;

  it('round-trips set/getDoc/delete', async () => {
    const provider = new TestProvider<UserMeta>();
    const u: UserRead = { id: 'u1', email: 'a@b.c', age: 10 };
    await provider.set('users', 'u1', u);
    expect(await provider.getDoc('users', 'u1')).toEqual(u);
    await provider.delete('users', 'u1');
    expect(await provider.getDoc('users', 'u1')).toBeNull();
  });

  it('getDocs lists prefixed entries; count matches', async () => {
    const provider = new TestProvider<UserMeta>();
    await provider.set('users', 'u1', { id: 'u1', email: 'a@b.c', age: 10 });
    await provider.set('users', 'u2', { id: 'u2', email: 'd@e.f', age: 20 });
    expect((await provider.getDocs('users')).length).toBe(2);
    expect(await provider.count('users')).toBe(2);
  });

  it('update merges partial writes', async () => {
    const provider = new TestProvider<UserMeta>();
    await provider.set('users', 'u1', { id: 'u1', email: 'a@b.c', age: 10 });
    await provider.update('users', 'u1', { age: 11 });
    expect(await provider.getDoc('users', 'u1')).toEqual({
      id: 'u1',
      email: 'a@b.c',
      age: 11,
    });
  });

  it('runBatch flushes queued operations on resolution', async () => {
    const provider = new TestProvider<UserMeta>();
    const result = await provider.runBatch(async (b) => {
      b.set('users', 'u1', { id: 'u1', email: 'a@b.c', age: 10 });
      b.set('users', 'u2', { id: 'u2', email: 'd@e.f', age: 20 });
      return 'ok' as const;
    });
    expect(result).toBe('ok');
    expect(await provider.count('users')).toBe(2);
  });

  it('runTransaction provides reads + queued writes', async () => {
    const provider = new TestProvider<UserMeta>();
    await provider.set('users', 'u1', { id: 'u1', email: 'a@b.c', age: 10 });

    const final = await provider.runTransaction(async (tx) => {
      const cur = await tx.get('users', 'u1');
      tx.update('users', 'u1', { age: (cur?.age ?? 0) + 1 });
      return cur;
    });
    expect(final?.age).toBe(10);
    expect((await provider.getDoc('users', 'u1'))?.age).toBe(11);
  });

  it('listener methods throw when capabilities.listeners=false (F-A-1)', () => {
    const provider = new TestProvider<UserMeta>();
    expect(() => provider.onDocumentSnapshot('users', 'u1', () => {})).toThrow(
      ListenersNotSupportedError,
    );
    expect(() =>
      provider.onCollectionSnapshot('users', [], () => {}),
    ).toThrow(ListenersNotSupportedError);
  });

  it('capabilities are literal-narrowed for compile-time branching', () => {
    const provider = new TestProvider<UserMeta>();
    // Literal `false` carried through the const assertion — at the type
    // level this enables `if (provider.capabilities.listeners) { ... }`
    // narrowing. Runtime check confirms the value matches the type.
    expect(provider.capabilities.listeners).toBe(false);
    expect(provider.capabilities.transactions).toBe(true);
    expect(provider.capabilities.batches).toBe(true);
  });
});
