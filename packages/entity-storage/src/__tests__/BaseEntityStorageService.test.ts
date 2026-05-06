// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { Session } from '@gertsai/session';
import type { AbstractDialog, ClientPlatform } from '@gertsai/session';

import { BaseEntityStorageService } from '../BaseEntityStorageService';
import { InMemoryStorageProvider } from '../InMemoryStorageProvider';
import { STORAGE_EVENTS } from '../STORAGE_EVENTS';
import {
  ListenersNotSupportedError,
  type IStorageProvider,
  type StorageCapabilities,
  type StorageMetadata,
} from '@gertsai/storage-core';

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

const makeSession = (overrides: Partial<{
  operatorUuid: string;
  dataAccessUuid: string;
  clientPlatform: ClientPlatform;
}> = {}): Session =>
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

// Mock provider whose listener capability is OFF — used to verify that
// BaseEntityStorageService falls back via ListenersNotSupportedError.
class NoListenersProvider implements IStorageProvider<UserMeta> {
  readonly capabilities: StorageCapabilities = {
    listeners: false,
    transactions: false,
    batches: false,
  };
  private readonly _store = new Map<string, Map<string, UserData>>();
  private _coll(p: string): Map<string, UserData> {
    let m = this._store.get(p);
    if (!m) {
      m = new Map();
      this._store.set(p, m);
    }
    return m;
  }
  async set(p: string, id: string, data: UserData): Promise<void> {
    this._coll(p).set(id, data);
  }
  async update(p: string, id: string, partial: Partial<UserData>): Promise<void> {
    const cur = this._coll(p).get(id) ?? ({} as UserData);
    this._coll(p).set(id, { ...cur, ...partial });
  }
  async delete(p: string, id: string): Promise<void> {
    this._coll(p).delete(id);
  }
  async getDoc(p: string, id: string): Promise<UserData | null> {
    return this._coll(p).get(id) ?? null;
  }
  async getDocs(p: string): Promise<UserData[]> {
    return Array.from(this._coll(p).values());
  }
  async count(p: string): Promise<number> {
    return this._coll(p).size;
  }
  async runBatch<R>(): Promise<R> {
    throw new Error('not impl');
  }
  async runTransaction<R>(): Promise<R> {
    throw new Error('not impl');
  }
  // Non-optional listener methods (F-A-1) — throw per ADR-005 I-4 when capabilities.listeners=false.
  onDocumentSnapshot(): () => void {
    throw new ListenersNotSupportedError();
  }
  onCollectionSnapshot(): () => void {
    throw new ListenersNotSupportedError();
  }
}

describe('BaseEntityStorageService — set / update / delete / restore round-trip', () => {
  it('set() generates uid + audit fields + emits ENTITY_CREATED', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const session = makeSession();
    const svc = new UsersStorage(provider, session);
    const handler = vi.fn();
    svc.on(STORAGE_EVENTS.ENTITY_CREATED, handler);

    const { id } = await svc.set({
      name: 'Alice',
      email: 'a@example.com',
    } as UserData);

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalledTimes(1);
    const stored = (await provider.getDoc('users', id)) as
      | (UserData & {
          _uid: string;
          status: string;
          creator_uuid: string;
          created_by_platform: string;
          updated_at: { seconds: number };
          deleted_at: unknown;
          update_action: { type: string };
        })
      | null;
    expect(stored).not.toBeNull();
    expect(stored?._uid).toBe(id);
    expect(stored?.status).toBe('created');
    expect(stored?.creator_uuid).toBe('op-1');
    expect(stored?.created_by_platform).toBe('web');
    expect(stored?.deleted_at).toBeNull();
    expect(stored?.update_action.type).toBe('create');
  });

  it('set() honors explicit _uid passed in', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({
      _uid: 'fixed-uid',
      name: 'B',
      email: 'b@x.com',
    } as UserData & { _uid: string });
    expect(id).toBe('fixed-uid');
    expect(await provider.getDoc('users', 'fixed-uid')).not.toBeNull();
  });

  it('update() refreshes updated_* + emits ENTITY_UPDATED', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    const before = (await provider.getDoc('users', id)) as
      | { updated_at: { seconds: number; nanoseconds: number } }
      | null;
    // Force a tick gap so `updated_at` differs.
    await new Promise((r) => setTimeout(r, 5));

    const handler = vi.fn();
    svc.on(STORAGE_EVENTS.ENTITY_UPDATED, handler);
    await svc.update(id, { name: 'A2' } as Partial<UserData>);

    expect(handler).toHaveBeenCalledTimes(1);
    const after = (await provider.getDoc('users', id)) as
      | (UserData & { updated_at: { seconds: number; nanoseconds: number } })
      | null;
    expect(after?.name).toBe('A2');
    expect(after?.email).toBe('a@x.com');
    // Either nanoseconds or seconds advanced.
    expect(
      (after?.updated_at.seconds ?? 0) > (before?.updated_at.seconds ?? 0) ||
        (after?.updated_at.nanoseconds ?? 0) >
          (before?.updated_at.nanoseconds ?? 0),
    ).toBe(true);
  });

  it('update() with action option records update_action', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    await svc.update(id, { name: 'A2' } as Partial<UserData>, {
      action: 'rename',
      params: { source: 'admin' },
    });
    const stored = (await provider.getDoc('users', id)) as {
      update_action: { type: string; params: Record<string, unknown> };
    } | null;
    expect(stored?.update_action.type).toBe('rename');
    expect(stored?.update_action.params.source).toBe('admin');
  });

  it('delete() soft-deletes (record stays, status flips) + emits ENTITY_DELETED', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    const handler = vi.fn();
    svc.on(STORAGE_EVENTS.ENTITY_DELETED, handler);

    await svc.delete(id);

    expect(handler).toHaveBeenCalledTimes(1);
    const stored = (await provider.getDoc('users', id)) as {
      status: string;
      deleted_at: unknown;
      deleted_by_uuid: string | null;
    } | null;
    // Soft-delete: record still present.
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('deleted');
    expect(stored?.deleted_at).not.toBeNull();
    expect(stored?.deleted_by_uuid).toBe('op-1');
  });

  it('restore() reverses soft-delete + emits ENTITY_RESTORED', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    await svc.delete(id);

    const handler = vi.fn();
    svc.on(STORAGE_EVENTS.ENTITY_RESTORED, handler);
    await svc.restore(id);

    expect(handler).toHaveBeenCalledTimes(1);
    const stored = (await provider.getDoc('users', id)) as {
      status: string;
      deleted_at: unknown;
    } | null;
    expect(stored?.status).toBe('created');
    expect(stored?.deleted_at).toBeNull();
  });

  it('dataAccessUuid is honored: session.dataAccessUuid != operatorUuid', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    // operatorUuid='op-1' but dataAccessUuid='target-7' (AI-on-behalf-of).
    const session = makeSession({
      operatorUuid: 'op-1',
      dataAccessUuid: 'target-7',
    });
    const svc = new UsersStorage(provider, session);

    expect(session.dataAccessUuid).toBe('target-7');
    expect(session.isOperatorScopeOverridden).toBe(true);

    const { id } = await svc.set({ name: 'C', email: 'c@x.com' } as UserData);
    const stored = (await provider.getDoc('users', id)) as {
      creator_uuid: string;
    } | null;
    // Audit fields use the operator (mutator), not the data-access scope —
    // session.dataAccessUuid being honored means the field is exposed and
    // distinct from operatorUuid (forwarded to consumers via session API).
    expect(stored?.creator_uuid).toBe('op-1');
    // Session forwards the explicit override unchanged.
    expect(svc['_session'].dataAccessUuid).toBe('target-7');
  });

  it('get / list / count delegate to provider', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    expect(await svc.count()).toBe(0);
    expect(await svc.list()).toEqual([]);

    const { id } = await svc.set({ name: 'A', email: 'a@x.com' } as UserData);
    expect(await svc.count()).toBe(1);
    const got = await svc.get(id);
    expect(got).not.toBeNull();
    const list = await svc.list();
    expect(list.length).toBe(1);
  });

  it('listener wrappers throw ListenersNotSupportedError when capabilities.listeners=false', async () => {
    const provider = new NoListenersProvider();
    const svc = new UsersStorage(provider, makeSession());
    expect(() => svc.onDocumentSnapshot('id', () => undefined)).toThrow(
      ListenersNotSupportedError,
    );
    expect(() => svc.onCollectionSnapshot([], () => undefined)).toThrow(
      ListenersNotSupportedError,
    );
  });

  it('listener wrappers delegate to provider when capabilities.listeners=true', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const cb = vi.fn();
    const off = svc.onDocumentSnapshot('id-1', cb);
    expect(typeof off).toBe('function');
    // Initial fires synchronously with `null` since doc absent.
    expect(cb).toHaveBeenCalledWith(null);
    off();
  });

  it('$destroy() emits DESTROYED, disposes listeners, removes all listeners', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    const destroyHandler = vi.fn();
    const docHandler = vi.fn();
    svc.on(STORAGE_EVENTS.DESTROYED, destroyHandler);
    svc.onDocumentSnapshot('id-x', docHandler);

    svc.$destroy();
    expect(svc.destroyed).toBe(true);
    expect(destroyHandler).toHaveBeenCalledTimes(1);

    // Second call is a no-op.
    svc.$destroy();
    expect(destroyHandler).toHaveBeenCalledTimes(1);

    // Subsequent calls throw.
    await expect(
      svc.set({ name: 'X', email: 'x@x.com' } as UserData),
    ).rejects.toThrow(/destroyed/);
  });

  it('exposes provider capabilities + path passthroughs', () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession());
    expect(svc.path).toBe('users');
    expect(svc.capabilities.listeners).toBe(true);
    expect(svc.capabilities.transactions).toBe(true);
    expect(svc.capabilities.batches).toBe(true);
  });
});
