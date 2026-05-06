// SPDX-License-Identifier: Apache-2.0
/**
 * Audit-stamped runTransaction / runBatch tests for BaseEntityStorageService.
 *
 * Verifies F-2 fix (Sprint 3.5.1): writes performed inside the transaction
 * / batch wrappers carry the same `entity-audit` marks (`creator_uuid`,
 * `MutationMarks`, `update_action`) as single-document `set` / `update` /
 * `delete` / `restore`.
 */
import { describe, expect, it, vi } from 'vitest';

import { Session } from '@gertsai/session';
import type { AbstractDialog, ClientPlatform } from '@gertsai/session';
import {
  TransactionConflictError,
  type IBatchRunner,
  type IStorageProvider,
  type ITransactionRunner,
  type StorageCapabilities,
  type StorageMetadata,
} from '@gertsai/storage-core';

import { BaseEntityStorageService } from '../BaseEntityStorageService';
import { InMemoryStorageProvider } from '../InMemoryStorageProvider';

interface UserData {
  readonly name: string;
  readonly email: string;
}
type UserMeta = StorageMetadata<UserData, UserData, 'name' | 'email'>;

const makeDialog = (): AbstractDialog => ({
  confirm: async () => false,
  alert: () => undefined,
  error: () => undefined,
});

const makeSession = (
  overrides: Partial<{
    operatorUuid: string;
    dataAccessUuid: string;
    clientPlatform: ClientPlatform;
  }> = {},
): Session =>
  new Session({
    operatorUuid: overrides.operatorUuid ?? 'op-1',
    operatorType: 'web',
    tokenGetter: async () => 'tok',
    dialog: makeDialog(),
    clientPlatform: overrides.clientPlatform ?? 'web',
    clientVersion: '1.0.0',
    ...(overrides.dataAccessUuid !== undefined
      ? { dataAccessUuid: overrides.dataAccessUuid }
      : {}),
  });

class UsersStorage extends BaseEntityStorageService<UserMeta> {
  constructor(provider: IStorageProvider<UserMeta>, session: Session) {
    super({ provider, session, path: 'users' });
  }
}

type StoredUser = UserData & {
  _uid: string;
  status: string;
  creator_uuid: string;
  created_by_platform: string;
  updated_by_uuid: string;
  deleted_at: { seconds: number; nanoseconds: number } | null;
  deleted_by_uuid: string | null;
  update_action: {
    type: string;
    params: Record<string, unknown>;
    timestamp: { seconds: number; nanoseconds: number };
  };
};

describe('BaseEntityStorageService — runTransaction (audit-stamped)', () => {
  it('tx.set stamps creator_uuid + MutationMarks + update_action: create', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const session = makeSession();
    const svc = new UsersStorage(provider, session);

    const out = await svc.runTransaction(async (tx) => {
      return tx.set({ name: 'Alice', email: 'a@x.com' } as UserData);
    });

    expect(typeof out.id).toBe('string');
    const stored = (await provider.getDoc('users', out.id)) as StoredUser | null;
    expect(stored).not.toBeNull();
    expect(stored?._uid).toBe(out.id);
    expect(stored?.creator_uuid).toBe('op-1');
    expect(stored?.created_by_platform).toBe('web');
    expect(stored?.updated_by_uuid).toBe('op-1');
    expect(stored?.deleted_at).toBeNull();
    expect(stored?.status).toBe('created');
    expect(stored?.update_action.type).toBe('create');
  });

  it('tx.set honors caller-supplied _uid', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const out = await svc.runTransaction(async (tx) =>
      tx.set({ _uid: 'fixed-tx', name: 'Z', email: 'z@x.com' } as UserData & {
        _uid: string;
      }),
    );
    expect(out.id).toBe('fixed-tx');
    expect(await provider.getDoc('users', 'fixed-tx')).not.toBeNull();
  });

  it('tx.update with action records update_action.type', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);

    await svc.runTransaction(async (tx) => {
      tx.update(id, { name: 'A2' } as Partial<UserData>, {
        action: 'rename',
        params: { source: 'admin' },
      });
    });

    const stored = (await provider.getDoc('users', id)) as StoredUser | null;
    expect(stored?.name).toBe('A2');
    expect(stored?.update_action.type).toBe('rename');
    expect(stored?.update_action.params.source).toBe('admin');
  });

  it('tx.delete is soft-delete (deleted_* set, row stays)', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);

    await svc.runTransaction(async (tx) => {
      tx.delete(id);
    });

    const stored = (await provider.getDoc('users', id)) as StoredUser | null;
    // Soft-delete invariant: row is still present.
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('deleted');
    expect(stored?.deleted_at).not.toBeNull();
    expect(stored?.deleted_by_uuid).toBe('op-1');
    expect(stored?.update_action.type).toBe('delete');
  });

  it('tx.restore reverses tx.delete', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    await svc.delete(id);

    await svc.runTransaction(async (tx) => {
      tx.restore(id);
    });

    const stored = (await provider.getDoc('users', id)) as StoredUser | null;
    expect(stored?.status).toBe('created');
    expect(stored?.deleted_at).toBeNull();
    expect(stored?.update_action.type).toBe('restore');
  });

  it('tx.get reads inside the transaction snapshot', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);

    const observed = await svc.runTransaction(async (tx) => tx.get(id));
    expect(observed).not.toBeNull();
    expect((observed as StoredUser)._uid).toBe(id);
  });

  it('TransactionConflictError surfaces unchanged from inner runner', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);

    // First tx reads the doc, then we mutate concurrently before commit
    // closes — InMemoryStorageProvider re-validates the read-set.
    await expect(
      svc.runTransaction(async (tx) => {
        await tx.get(id);
        // Concurrent mutation while tx is open — bumps the version.
        await provider.update('users', id, {
          name: 'race',
        } as Partial<UserData>);
        // Queue a write so the tx has something to commit.
        tx.update(id, { name: 'after-race' } as Partial<UserData>);
      }),
    ).rejects.toThrow(TransactionConflictError);
  });

  it('tx callback throwing aborts the transaction (no partial commits)', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const beforeCount = await provider.count('users');

    await expect(
      svc.runTransaction(async (tx) => {
        tx.set({ name: 'doomed', email: 'd@x.com' } as UserData);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const afterCount = await provider.count('users');
    expect(afterCount).toBe(beforeCount);
  });

  it('throws when service is destroyed', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    svc.$destroy();
    await expect(
      svc.runTransaction(async (tx) => {
        tx.set({ name: 'X', email: 'x@x.com' } as UserData);
      }),
    ).rejects.toThrow(/destroyed/);
  });
});

describe('BaseEntityStorageService — runBatch (audit-stamped)', () => {
  it('batch.set + batch.update + batch.delete carry audit marks', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    // Pre-existing row for update + delete in the batch.
    const { id: existing } = await svc.set({
      name: 'Pre',
      email: 'p@x.com',
    } as UserData);

    const result = await svc.runBatch(async (b) => {
      const a = b.set({ name: 'A', email: 'a@x.com' } as UserData);
      b.update(existing, { name: 'Pre2' } as Partial<UserData>, {
        action: 'rename',
      });
      // soft-delete the pre-existing row
      b.delete(existing);
      return a;
    });

    const created = (await provider.getDoc('users', result.id)) as
      | StoredUser
      | null;
    expect(created?.creator_uuid).toBe('op-1');
    expect(created?.update_action.type).toBe('create');

    // After batch: the pre-existing row has been soft-deleted last —
    // status flips to 'deleted', not removed physically.
    const preStored = (await provider.getDoc(
      'users',
      existing,
    )) as StoredUser | null;
    expect(preStored).not.toBeNull();
    expect(preStored?.status).toBe('deleted');
    expect(preStored?.deleted_by_uuid).toBe('op-1');
  });

  it('batch.restore reverses a soft-delete', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    await svc.delete(id);

    await svc.runBatch(async (b) => {
      b.restore(id);
    });

    const stored = (await provider.getDoc('users', id)) as StoredUser | null;
    expect(stored?.status).toBe('created');
    expect(stored?.deleted_at).toBeNull();
    expect(stored?.update_action.type).toBe('restore');
  });

  it('batch callback throwing → outer error propagates, no partial commits', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const beforeCount = await provider.count('users');

    await expect(
      svc.runBatch(async (b) => {
        b.set({ name: 'X', email: 'x@x.com' } as UserData);
        throw new Error('batch-boom');
      }),
    ).rejects.toThrow('batch-boom');

    expect(await provider.count('users')).toBe(beforeCount);
  });

  it('batch passes audit-stamped writes through to the raw batch runner', async () => {
    // Spy provider — checks the wrapper actually delegates to provider.runBatch
    // and forwards stamped data (not raw partial).
    const setSpy = vi.fn();
    const updateSpy = vi.fn();
    class SpyProvider implements IStorageProvider<UserMeta> {
      readonly capabilities: StorageCapabilities = {
        listeners: false,
        transactions: true,
        batches: true,
      };
      async set(): Promise<void> {
        return undefined;
      }
      async update(): Promise<void> {
        return undefined;
      }
      async delete(): Promise<void> {
        return undefined;
      }
      async getDoc(): Promise<UserData | null> {
        return null;
      }
      async getDocs(): Promise<UserData[]> {
        return [];
      }
      async count(): Promise<number> {
        return 0;
      }
      async runBatch<R>(
        fn: (batch: IBatchRunner<UserMeta>) => Promise<R>,
      ): Promise<R> {
        const runner: IBatchRunner<UserMeta> = {
          set: (path, id, data) => setSpy(path, id, data),
          update: (path, id, partial) => updateSpy(path, id, partial),
          delete: () => undefined,
        };
        return fn(runner);
      }
      async runTransaction<R>(
        fn: (tx: ITransactionRunner<UserMeta>) => Promise<R>,
      ): Promise<R> {
        const runner: ITransactionRunner<UserMeta> = {
          get: async () => null,
          set: () => undefined,
          update: () => undefined,
          delete: () => undefined,
        };
        return fn(runner);
      }
      onDocumentSnapshot(): () => void {
        throw new Error('no');
      }
      onCollectionSnapshot(): () => void {
        throw new Error('no');
      }
    }

    const provider = new SpyProvider();
    const svc = new UsersStorage(provider, makeSession());
    await svc.runBatch(async (b) => {
      b.set({ _uid: 'u1', name: 'A', email: 'a@x.com' } as UserData & {
        _uid: string;
      });
      b.update('u2', { name: 'B' } as Partial<UserData>, { action: 'edit' });
    });

    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArgs = setSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(setArgs[0]).toBe('users');
    expect(setArgs[1]).toBe('u1');
    expect(setArgs[2].creator_uuid).toBe('op-1');
    expect((setArgs[2].update_action as { type: string }).type).toBe('create');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updateArgs = updateSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(updateArgs[2].updated_by_uuid).toBe('op-1');
    expect((updateArgs[2].update_action as { type: string }).type).toBe(
      'edit',
    );
  });
});
