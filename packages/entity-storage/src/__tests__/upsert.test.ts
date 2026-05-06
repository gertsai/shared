// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { Session, type AbstractDialog } from '@gertsai/session';
import type { StorageMetadata } from '@gertsai/storage-core';

import { BaseEntityStorageService } from '../BaseEntityStorageService';
import { InMemoryStorageProvider } from '../InMemoryStorageProvider';
import { STORAGE_EVENTS } from '../STORAGE_EVENTS';

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

const makeSession = (operatorUuid = 'op-1'): Session =>
  new Session({
    operatorUuid,
    operatorType: 'web',
    tokenGetter: async () => 'tok',
    dialog: makeDialog(),
    clientPlatform: 'web',
    clientVersion: '1.0.0',
  });

class UsersStorage extends BaseEntityStorageService<UserMeta> {
  constructor(provider: InMemoryStorageProvider<UserMeta>, session: Session) {
    super({ provider, session, path: 'users' });
  }
}

describe('BaseEntityStorageService.upsert', () => {
  it('inserts a new entity (delegates to set) and stamps creator audit', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession('alice'));
    const created = vi.fn();
    const updated = vi.fn();
    svc.on(STORAGE_EVENTS.ENTITY_CREATED, created);
    svc.on(STORAGE_EVENTS.ENTITY_UPDATED, updated);

    const { id } = await svc.upsert({
      _uid: 'u-new',
      name: 'Alice',
      email: 'a@example.com',
    });

    expect(id).toBe('u-new');
    expect(created).toHaveBeenCalledTimes(1);
    expect(updated).not.toHaveBeenCalled();

    const stored = (await provider.getDoc('users', 'u-new')) as
      | (UserData & {
          _uid: string;
          creator_uuid?: string;
          created_at?: unknown;
        })
      | null;
    expect(stored).not.toBeNull();
    expect(stored?._uid).toBe('u-new');
    expect(stored?.creator_uuid).toBe('alice');
    expect(stored?.created_at).toBeDefined();
  });

  it('updates an existing entity (delegates to update) and preserves creator audit', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession('bob'));

    await svc.upsert({
      _uid: 'u-existing',
      name: 'Bob',
      email: 'b@example.com',
    });
    const afterCreate = (await provider.getDoc('users', 'u-existing')) as {
      creator_uuid?: string;
      created_at?: unknown;
      updated_at?: unknown;
      name: string;
    };
    const createdAt = afterCreate.created_at;
    const creatorUuid = afterCreate.creator_uuid;

    const created = vi.fn();
    const updated = vi.fn();
    svc.on(STORAGE_EVENTS.ENTITY_CREATED, created);
    svc.on(STORAGE_EVENTS.ENTITY_UPDATED, updated);

    await new Promise((r) => setTimeout(r, 5));

    const { id } = await svc.upsert({
      _uid: 'u-existing',
      name: 'Bob B.',
      email: 'b@example.com',
    });

    expect(id).toBe('u-existing');
    expect(created).not.toHaveBeenCalled();
    expect(updated).toHaveBeenCalledTimes(1);

    const afterUpdate = (await provider.getDoc('users', 'u-existing')) as {
      creator_uuid?: string;
      created_at?: unknown;
      updated_at?: unknown;
      name: string;
    };
    expect(afterUpdate.name).toBe('Bob B.');
    expect(afterUpdate.created_at).toEqual(createdAt);
    expect(afterUpdate.creator_uuid).toBe(creatorUuid);
    expect(afterUpdate.updated_at).toBeDefined();
    expect(afterUpdate.updated_at).not.toEqual(afterCreate.updated_at);
  });

  it('forwards routing opts (transaction) on the insert path', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession('carol'));

    const result = await svc.runTransaction(async (tx) => {
      return svc.upsert(
        {
          _uid: 'u-tx',
          name: 'Carol',
          email: 'c@example.com',
        },
        { transaction: tx },
      );
    });

    expect(result.id).toBe('u-tx');
    const stored = (await provider.getDoc('users', 'u-tx')) as
      | (UserData & { _uid: string; creator_uuid?: string })
      | null;
    expect(stored).not.toBeNull();
    expect(stored?.creator_uuid).toBe('carol');
  });
});
