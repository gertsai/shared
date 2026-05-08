// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { Session, type AbstractDialog } from '@gertsai/session';
import type { StorageMetadata } from '@gertsai/storage-core';

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
  // Wave 7.2 audit P1-1 reshape: `InMemoryStorageProvider` now opts into
  // the 1-RTT fast path (`capabilities.upsert.preservesCreatorAudit: true`).
  // Tests below assert audit invariants (creator preserved on update;
  // last_modified refreshed) under the FAST PATH. ENTITY_CREATED /
  // ENTITY_UPDATED events are NOT emitted by the fast path because the
  // service cannot tell insert from update without a pre-read (which
  // would defeat the 1-RTT optimization). See `BaseEntityStorageService.upsert()`
  // header comment.

  it('inserts a new entity via fast path and stamps creator audit', async () => {
    const provider = new InMemoryStorageProvider<UserMeta>();
    const svc = new UsersStorage(provider, makeSession('alice'));

    const { id } = await svc.upsert({
      _uid: 'u-new',
      name: 'Alice',
      email: 'a@example.com',
    });

    expect(id).toBe('u-new');

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

  it('updates an existing entity via fast path and preserves creator audit', async () => {
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

    await new Promise((r) => setTimeout(r, 5));

    const { id } = await svc.upsert({
      _uid: 'u-existing',
      name: 'Bob B.',
      email: 'b@example.com',
    });

    expect(id).toBe('u-existing');

    const afterUpdate = (await provider.getDoc('users', 'u-existing')) as {
      creator_uuid?: string;
      created_at?: unknown;
      updated_at?: unknown;
      name: string;
    };
    expect(afterUpdate.name).toBe('Bob B.');
    // Wave 7.2 audit P1-1: audit-aware InMemory upsertDoc preserves
    // create-time fields on conflict (key invariant the tri-state cap
    // promised — `preservesCreatorAudit: true`).
    expect(afterUpdate.created_at).toEqual(createdAt);
    expect(afterUpdate.creator_uuid).toBe(creatorUuid);
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
