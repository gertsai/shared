// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { Session } from '@gertsai/session';
import type { AbstractDialog } from '@gertsai/session';
import type {
  IStorageProvider,
  StorageMetadata,
} from '@gertsai/storage-core';
import type { AuditedBatchRunner } from '../AuditedRunners';
import { BaseEntityStorageService } from '../BaseEntityStorageService';
import { InMemoryStorageProvider } from '../InMemoryStorageProvider';
import { allowFields, allowWrite, denyWrite, WriteRuleDenied } from '../write-rules';
import type { TableWriteRules } from '../write-rules';

interface CardData {
  readonly title: string;
  readonly list_id: string;
  readonly position: number;
  readonly assignee_id?: string;
}
type CardMeta = StorageMetadata<
  CardData,
  CardData,
  'title' | 'list_id' | 'position' | 'assignee_id'
>;

const makeSession = (operatorUuid = 'op-1'): Session =>
  new Session({
    operatorUuid,
    operatorType: 'web',
    tokenGetter: async () => 'tok',
    dialog: {
      confirm: async () => false,
      alert: () => undefined,
      error: () => undefined,
    } as AbstractDialog,
    clientPlatform: 'web',
    clientVersion: '1.0.0',
  });

const CARD_RULES: TableWriteRules = {
  create: allowWrite,
  update: {
    card_updated: allowFields([], ['title', 'assignee_id']),
    card_moved: allowFields(['list_id', 'position']),
    card_assigned: allowFields(['assignee_id']),
  },
  delete: allowWrite,
  restore: allowWrite,
};

class CardsStorage extends BaseEntityStorageService<CardMeta> {
  constructor(provider: IStorageProvider<CardMeta>, session: Session) {
    super({ provider, session, path: 'cards', rules: CARD_RULES });
  }
}

class RulelessStorage extends BaseEntityStorageService<CardMeta> {
  constructor(provider: IStorageProvider<CardMeta>, session: Session) {
    super({ provider, session, path: 'cards' });
  }
}

const seed = async (
  provider: InMemoryStorageProvider<CardMeta>,
): Promise<void> => {
  const svc = new CardsStorage(provider, makeSession());
  await svc.set({
    _uid: 'c-1',
    title: 'seed',
    list_id: 'l-1',
    position: 1000,
  } as CardData & { _uid: string });
};

describe('BaseEntityStorageService write-rules — set', () => {
  it('allows a clean create and stamps audit fields', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    const { id } = await svc.set({
      title: 't',
      list_id: 'l-1',
      position: 1,
    } as CardData);
    const doc = await provider.getDoc('cards', id);
    expect(doc).toMatchObject({ title: 't', creator_uuid: 'op-1' });
  });

  it('rejects caller-supplied audit fields before the provider write', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const setSpy = vi.spyOn(provider, 'set');
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.set({
        title: 't',
        list_id: 'l-1',
        position: 1,
        creator_uuid: 'spoofed',
      } as CardData & { creator_uuid: string }),
    ).rejects.toThrow(/protected fields in diff: creator_uuid/);
    expect(setSpy).not.toHaveBeenCalled();
    expect(await provider.count('cards')).toBe(0);
  });

  it('denied create leaves the store empty', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new (class extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules: { create: denyWrite } });
      }
    })(provider, makeSession());
    await expect(
      svc.set({ title: 't', list_id: 'l', position: 1 } as CardData),
    ).rejects.toThrow(WriteRuleDenied);
    expect(await provider.count('cards')).toBe(0);
  });
});

describe('BaseEntityStorageService write-rules — update', () => {
  it('card_updated on an allowed field persists', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await svc.update('c-1', { title: 'new' }, { action: 'card_updated' });
    const doc = await provider.getDoc('cards', 'c-1');
    expect(doc?.title).toBe('new');
    expect(doc).toMatchObject({
      updated_by_uuid: 'op-1',
      update_action: expect.objectContaining({ type: 'card_updated' }),
    });
  });

  it('update without action → denied before the provider write', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const updateSpy = vi.spyOn(provider, 'update');
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.update('c-1', { title: 'new' }),
    ).rejects.toThrow(/NO_UPDATE_ACTION/);
    expect(updateSpy).not.toHaveBeenCalled();
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');
  });

  it('update with unknown action type → denied', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.update('c-1', { title: 'x' }, { action: 'bogus' }),
    ).rejects.toThrow(/action 'bogus'/);
  });

  it('card_moved requires list_id+position — missing required is denied', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.update(
        'c-1',
        { position: 2000 } as Partial<CardData>,
        { action: 'card_moved' },
      ),
    ).rejects.toThrow(WriteRuleDenied);
    expect((await provider.getDoc('cards', 'c-1'))?.position).toBe(1000);
  });

  it('card_moved touching a foreign field is denied', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.update(
        'c-1',
        { list_id: 'l-2', position: 2000, title: 'sneak' } as Partial<CardData>,
        { action: 'card_moved' },
      ),
    ).rejects.toThrow(WriteRuleDenied);
  });

  it('card_moved with the required diff persists', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await svc.update(
      'c-1',
      { list_id: 'l-2', position: 2000 },
      { action: 'card_moved', params: { to_list_id: 'l-2' } },
    );
    const doc = await provider.getDoc('cards', 'c-1');
    expect(doc).toMatchObject({
      list_id: 'l-2',
      position: 2000,
      update_action: expect.objectContaining({
        type: 'card_moved',
        params: { to_list_id: 'l-2' },
      }),
    });
  });

  it('patching a protected field is denied even under a listed action', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.update('c-1', { id: 'spoof' } as Partial<CardData>, {
        action: 'card_updated',
      }),
    ).rejects.toThrow(/protected fields in diff: id/);
  });

  it('no-op patch on optional-only action → allowed (affectedKeys empty)', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    // `card_updated` has no required keys — a same-value write is a no-op,
    // Orchestra allows it (affectedKeys = []).
    await svc.update('c-1', { title: 'seed' }, { action: 'card_updated' });
  });

  it('ruleless table is unaffected by the engine', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new RulelessStorage(provider, makeSession());
    const { id } = await svc.set({
      title: 'x',
      list_id: 'l',
      position: 1,
    } as CardData);
    await svc.update(id, { title: 'y' }); // no action — no rules → pass
    await svc.delete(id);
    expect(await provider.count('cards')).toBe(1);
  });
});

describe('BaseEntityStorageService write-rules — delete/restore/destroy', () => {
  it('denied delete never reaches the provider', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new (class extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({
          provider: p,
          session: s,
          path: 'cards',
          rules: { delete: denyWrite },
        });
      }
    })(provider, makeSession());
    await expect(svc.delete('c-1')).rejects.toThrow(WriteRuleDenied);
    const doc = await provider.getDoc('cards', 'c-1');
    expect(doc).not.toMatchObject({ deleted_at: expect.anything() });
  });

  it('allowed delete soft-deletes; restore rule governs restore', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await svc.delete('c-1');
    let doc = await provider.getDoc('cards', 'c-1');
    expect(doc).toMatchObject({
      update_action: expect.objectContaining({ type: 'delete' }),
    });
    await svc.restore('c-1');
    doc = await provider.getDoc('cards', 'c-1');
    expect(doc).toMatchObject({
      update_action: expect.objectContaining({ type: 'restore' }),
    });
  });

  it('destroy is gated by its own rule', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    // CARD_RULES has no `destroy` → fail-closed.
    await expect(svc.destroy('c-1')).rejects.toThrow(/no rule for verb 'destroy'/);
    expect(await provider.getDoc('cards', 'c-1')).not.toBeNull();
  });
});

describe('BaseEntityStorageService write-rules — create existence', () => {
  it('set on an existing row is denied — create cannot overwrite', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const setSpy = vi.spyOn(provider, 'set');
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.set({
        _uid: 'c-1',
        title: 'overwrite',
        list_id: 'l-9',
        position: 1,
      } as CardData & { _uid: string }),
    ).rejects.toThrow(/create-only/);
    expect(setSpy).not.toHaveBeenCalled();
    // The stored row is untouched — the deny landed before the provider.
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');
  });
});

describe('BaseEntityStorageService write-rules — audited runners', () => {
  it('runBatch: a denied write inside the runner rejects the whole commit', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.runBatch(async (batch) => {
        batch.set({
          _uid: 'c-2',
          title: 'new',
          list_id: 'l-1',
          position: 2,
        } as CardData & { _uid: string });
        batch.update('c-1', { title: 'x' }, { action: 'bogus' });
      }),
    ).rejects.toThrow(WriteRuleDenied);
    // Atomic abort — the legal set() in the same batch never landed.
    expect(await provider.getDoc('cards', 'c-2')).toBeNull();
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');
  });

  it('runBatch: a legal batch lands with stamped audit fields', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await svc.runBatch(async (batch) => {
      batch.set({
        _uid: 'c-2',
        title: 'new',
        list_id: 'l-1',
        position: 2,
      } as CardData & { _uid: string });
      batch.update(
        'c-1',
        { title: 'renamed' },
        { action: 'card_updated' },
      );
    });
    expect(await provider.getDoc('cards', 'c-2')).toMatchObject({
      title: 'new',
      creator_uuid: 'op-1',
    });
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('renamed');
  });

  it('runBatch: set() on an existing row is denied at the pending gate', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.runBatch(async (batch) => {
        batch.set({
          _uid: 'c-1',
          title: 'overwrite',
          list_id: 'l-1',
          position: 1,
        } as CardData & { _uid: string });
      }),
    ).rejects.toThrow(/create-only|already exists/);
  });

  it('runTransaction: a denied write inside the runner rejects the whole commit', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.runTransaction(async (tx) => {
        tx.update('c-1', { title: 'x' }, { action: 'bogus' });
        tx.set({
          _uid: 'c-2',
          title: 'new',
          list_id: 'l-1',
          position: 2,
        } as CardData & { _uid: string });
      }),
    ).rejects.toThrow(WriteRuleDenied);
    expect(await provider.getDoc('cards', 'c-2')).toBeNull();
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');
  });

  it('runTransaction: tx.get reads committed rows; a legal write lands', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await svc.runTransaction(async (tx) => {
      const row = await tx.get('c-1');
      expect(row?.title).toBe('seed');
      tx.update('c-1', { title: 'renamed' }, { action: 'card_updated' });
    });
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('renamed');
  });
});

describe('BaseEntityStorageService write-rules — governed upsert', () => {
  it('upsert of a NEW row is a clean create', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await svc.upsert({
      _uid: 'c-9',
      title: 'fresh',
      list_id: 'l-1',
      position: 9,
    } as CardData & { _uid: string });
    expect(await provider.getDoc('cards', 'c-9')).toMatchObject({
      title: 'fresh',
      creator_uuid: 'op-1',
    });
  });

  it('upsert of an EXISTING row is denied — use update() with an action', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    await expect(
      svc.upsert({
        _uid: 'c-1',
        title: 'overwrite',
        list_id: 'l-9',
        position: 9,
      } as CardData & { _uid: string }),
    ).rejects.toThrow(/update/);
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');
  });
});

describe('BaseEntityStorageService write-rules — delete action channel', () => {
  const DELETE_ACTION_RULES: TableWriteRules = {
    create: allowWrite,
    update: allowWrite,
    delete: {
      member_revoked: ({ action }) =>
        action !== undefined && action.params['user_id'] === 'u-2',
    },
  };

  it('delete forwards action+params into the rule eval', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new (class extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({
          provider: p,
          session: s,
          path: 'cards',
          rules: DELETE_ACTION_RULES,
        });
      }
    })(provider, makeSession());
    // Wrong params → denied; no action → the write stamps the
    // default 'delete' action, which the action-keyed ruleset does not
    // list → fail-closed deny.
    await expect(
      svc.delete('c-1', {
        action: 'member_revoked',
        params: { user_id: 'u-3' },
      }),
    ).rejects.toThrow(WriteRuleDenied);
    await expect(svc.delete('c-1')).rejects.toThrow(WriteRuleDenied);
    await svc.delete('c-1', {
      action: 'member_revoked',
      params: { user_id: 'u-2' },
    });
    expect(await provider.getDoc('cards', 'c-1')).toMatchObject({
      update_action: expect.objectContaining({ type: 'member_revoked' }),
    });
  });
});

describe('BaseEntityStorageService write-rules — batch/transaction routing', () => {
  it('defers routed rules once and evaluates getAfter with committed sibling state plus exact stamps', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const calls: Array<{
      claims: Readonly<Record<string, unknown>> | undefined;
      target: Record<string, unknown> | undefined;
      sibling: Record<string, unknown> | undefined;
    }> = [];
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_updated: async (ctx) => {
          const [target, sibling] = await Promise.all([
            ctx.getAfter?.('cards', ctx.id),
            ctx.getAfter?.('cards', 'c-2'),
          ]);
          calls.push({ claims: ctx.claims, target, sibling });
          return ctx.claims?.['can_edit'] === true
            && target?.['title'] === 'changed'
            && sibling?.['title'] === 'created-in-tx';
        },
      },
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules, claims: { can_edit: true } });
      }
    }
    const svc = new Svc(provider, makeSession());
    await svc.runTransaction(async (tx) => {
      await svc.update('c-1', { title: 'changed' }, { action: 'card_updated', transaction: tx });
      await svc.set(
        { _uid: 'c-2', title: 'created-in-tx', list_id: 'l-1', position: 2 } as CardData & { _uid: string },
        { transaction: tx },
      );
      await svc.upsert(
        { _uid: 'c-3', title: 'upserted-in-tx', list_id: 'l-1', position: 3 } as CardData & { _uid: string },
        { transaction: tx },
      );
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.claims).toEqual({ can_edit: true });
    expect(calls[0]?.target).toMatchObject({
      title: 'changed',
      updated_by_uuid: 'op-1',
    });
    expect(calls[0]?.sibling).toMatchObject({ title: 'created-in-tx' });
    expect(await provider.getDoc('cards', 'c-3')).toMatchObject({
      title: 'upserted-in-tx',
      creator_uuid: 'op-1',
    });
    const persisted = (await provider.getDoc('cards', 'c-1')) as unknown as Record<string, unknown>;
    expect(persisted['updated_by_uuid']).toBe(calls[0]?.target?.['updated_by_uuid']);
    expect(persisted['updated_at']).toEqual(calls[0]?.target?.['updated_at']);
  });

  it('memoizes concurrent single-write readers for the same document key', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    await provider.set('lists', 'l-1', { archived: false } as unknown as CardData);
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_updated: async (ctx) => {
          const [first, second] = await Promise.all([
            ctx.get?.('lists', 'l-1'),
            ctx.get?.('lists', 'l-1'),
          ]);
          return first?.['archived'] === false && second?.['archived'] === false;
        },
      },
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules });
      }
    }
    const svc = new Svc(provider, makeSession());
    const getDoc = vi.spyOn(provider, 'getDoc');
    await svc.update('c-1', { title: 'memoized' }, { action: 'card_updated' });
    expect(getDoc.mock.calls.filter(([path, id]) => path === 'lists' && id === 'l-1')).toHaveLength(1);
  });

  it('rejects a foreign active runner before a ruleless service can queue a mutation', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const owner = new CardsStorage(provider, makeSession());
    const ruleless = new RulelessStorage(provider, makeSession());
    await owner.runBatch(async (batch) => {
      await expect(
        ruleless.update('c-1', { title: 'foreign' }, { batch }),
      ).rejects.toThrow();
      expect(await provider.getDoc('cards', 'c-1')).toMatchObject({ title: 'seed' });
    });
    expect(await provider.getDoc('cards', 'c-1')).toMatchObject({ title: 'seed' });
    let expiredBatch: AuditedBatchRunner<CardMeta> | undefined;
    await owner.runBatch(async (batch) => {
      expiredBatch = batch;
    });
    if (expiredBatch === undefined) throw new Error('expected captured batch runner');
    await expect(
      ruleless.update('c-1', { title: 'expired' }, { batch: expiredBatch }),
    ).rejects.toThrow();
    const unregistered = {} as unknown as AuditedBatchRunner<CardMeta>;
    await expect(
      ruleless.update('c-1', { title: 'unregistered' }, { batch: unregistered }),
    ).rejects.toThrow();
    expect(await provider.getDoc('cards', 'c-1')).toMatchObject({ title: 'seed' });
  });

  it('routes delete and restore through the owning transaction with lifecycle stamps', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    class LifecycleStorage extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules: CARD_RULES });
      }
    }
    const svc = new LifecycleStorage(provider, makeSession());
    await svc.runTransaction(async (tx) => {
      await svc.delete('c-1', { transaction: tx });
    });
    expect(await provider.getDoc('cards', 'c-1')).toMatchObject({
      status: 'deleted',
      deleted_by_uuid: 'op-1',
    });
    await svc.runTransaction(async (tx) => {
      await svc.restore('c-1', { transaction: tx });
    });
    expect(await provider.getDoc('cards', 'c-1')).toMatchObject({
      status: 'created',
      deleted_at: null,
      update_action: expect.objectContaining({ type: 'restore' }),
    });
    await expect(
      svc.runTransaction(async (tx) => {
        await svc.destroy('c-1', { transaction: tx });
      }),
    ).rejects.toThrow(/destroy.*does not support batch or transaction routing/);
    expect(await provider.getDoc('cards', 'c-1')).not.toBeNull();
    await expect(
      svc.runBatch(async (batch) => {
        await svc.destroy('c-1', { batch });
      }),
    ).rejects.toThrow(/destroy.*does not support batch or transaction routing/);
    expect(await provider.getDoc('cards', 'c-1')).not.toBeNull();
  });
});

describe('optimistic concurrency — update_version / expectedVersion', () => {
  it('stamps update_version=1 on create and bumps it on each update', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await seed(provider);
    expect(((await provider.getDoc('cards', 'c-1')) as unknown as Record<string, unknown>)?.['update_version']).toBe(1);
    await svc.update('c-1', { title: 'b' }, { action: 'card_updated' });
    const doc = await provider.getDoc('cards', 'c-1');
    expect((doc as unknown as Record<string, unknown>)['update_version']).toBe(2);
  });

  it('applies an update when expectedVersion matches the committed row', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await seed(provider);
    await svc.update(
      'c-1',
      { title: 'v2' },
      { action: 'card_updated', expectedVersion: 1 },
    );
    const doc = await provider.getDoc('cards', 'c-1');
    expect(doc).toMatchObject({ title: 'v2', update_version: 2 });
  });

  it('throws VersionConflictError (not WriteRuleDenied) on a stale expectedVersion', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await seed(provider);
    const { VersionConflictError } = await import('@gertsai/storage-core');
    const err = await svc
      .update('c-1', { title: 'x' }, { action: 'card_updated', expectedVersion: 9 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect(err).not.toBeInstanceOf(WriteRuleDenied);
    // Nothing applied.
    expect((await provider.getDoc('cards', 'c-1'))?.['title']).toBe('seed');
  });

  it('treats a missing row as a conflict when expectedVersion is declared', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await seed(provider);
    await expect(
      svc.update('c-absent', { title: 'x' }, { action: 'card_updated', expectedVersion: 1 }),
    ).rejects.toMatchObject({ name: 'VersionConflictError' });
  });

  it('enforces expectedVersion inside runBatch — conflict aborts the whole batch', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await seed(provider);
    await svc.set({
      _uid: 'c-2',
      title: 'seed2',
      list_id: 'l-1',
      position: 2000,
    } as CardData & { _uid: string });
    const err = await svc
      .runBatch(async (b) => {
        b.update('c-1', { title: 'ok' }, { action: 'card_updated', expectedVersion: 1 });
        b.update('c-2', { title: 'stale' }, { action: 'card_updated', expectedVersion: 99 });
      })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'VersionConflictError' });
    // Atomic: c-1 was NOT updated either.
    expect((await provider.getDoc('cards', 'c-1'))?.['title']).toBe('seed');
    expect((await provider.getDoc('cards', 'c-2'))?.['title']).toBe('seed2');
  });

  it('provider.update enforces expectedVersion atomically (ungoverned path)', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new RulelessStorage(provider, makeSession());
    await svc.set({
      _uid: 'c-1',
      title: 'seed',
      list_id: 'l-1',
      position: 1000,
    } as CardData & { _uid: string });
    await provider.update('cards', 'c-1', { title: 'x' }, { expectedVersion: 9 })
      .then(() => {
        throw new Error('must throw');
      })
      .catch((e: unknown) => {
        expect(e).toMatchObject({ name: 'VersionConflictError', expected: 9, actual: 1 });
      });
    await provider.update('cards', 'c-1', { title: 'x' }, { expectedVersion: 1 });
    expect(((await provider.getDoc('cards', 'c-1')) as unknown as Record<string, unknown>)?.['update_version']).toBe(2);
  });

  it('denies a caller patch carrying update_version (protected field)', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const svc = new CardsStorage(provider, makeSession());
    await seed(provider);
    await expect(
      svc.update(
        'c-1',
        { title: 'x', update_version: 42 } as Partial<CardData>,
        { action: 'card_updated' },
      ),
    ).rejects.toThrow(WriteRuleDenied);
  });

  it('fires onDenied for policy denials and version conflicts alike', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const onDenied = vi.fn();
    class ObservedStorage extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules: CARD_RULES, onDenied });
      }
    }
    const svc = new ObservedStorage(provider, makeSession());
    await svc.set({
      _uid: 'c-1',
      title: 'seed',
      list_id: 'l-1',
      position: 1000,
    } as CardData & { _uid: string });
    // Policy denial — no action on a mapped table.
    await expect(svc.update('c-1', { title: 'x' })).rejects.toThrow(WriteRuleDenied);
    // Version conflict.
    await expect(
      svc.update('c-1', { title: 'x' }, { action: 'card_updated', expectedVersion: 42 }),
    ).rejects.toMatchObject({ name: 'VersionConflictError' });
    expect(onDenied).toHaveBeenCalledTimes(2);
    expect(onDenied).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'WriteRuleDenied' }));
    expect(onDenied).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'VersionConflictError', path: 'cards', id: 'c-1', expected: 42 }),
    );
  });
});

describe('BaseEntityStorageService write-rules — single-doc cross-document readers', () => {
  it('ctx.get reads a committed doc in another collection during update', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    // Rule: a card may move only while its parent list is not archived —
    // the Orchestra getChat(space_uid) pattern.
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_moved: async (ctx) => {
          if (ctx.get === undefined) return false;
          const list = await ctx.get('lists', String(ctx.patch['list_id'] ?? ''));
          return list !== undefined && list['archived'] !== true;
        },
      },
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules });
      }
    }
    const svc = new Svc(provider, makeSession());
    await seed(provider);
    // No list doc → deny.
    await expect(
      svc.update('c-1', { list_id: 'l-2', position: 5 }, { action: 'card_moved' }),
    ).rejects.toThrow(WriteRuleDenied);
    // Archived list → deny.
    await provider.set('lists', 'l-2', { archived: true } as unknown as CardData);
    await expect(
      svc.update('c-1', { list_id: 'l-2', position: 5 }, { action: 'card_moved' }),
    ).rejects.toThrow(WriteRuleDenied);
    // Live list → allow.
    await provider.set('lists', 'l-3', { archived: false } as unknown as CardData);
    await svc.update('c-1', { list_id: 'l-3', position: 5 }, { action: 'card_moved' });
    expect(((await provider.getDoc('cards', 'c-1')) as unknown as Record<string, unknown>)?.['list_id']).toBe('l-3');
  });

  it('ctx.getAfter exposes the post-write image of the target doc', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    // Rule: reject the update when the post-write title is forbidden —
    // the pattern Orchestra uses for "after" assertions.
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_updated: async (ctx) => {
          if (ctx.getAfter === undefined) return false;
          const after = await ctx.getAfter('cards', ctx.id);
          return after !== undefined && after['title'] !== 'forbidden';
        },
      },
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules });
      }
    }
    const svc = new Svc(provider, makeSession());
    await seed(provider);
    await expect(
      svc.update('c-1', { title: 'forbidden' }, { action: 'card_updated' }),
    ).rejects.toThrow(WriteRuleDenied);
    await svc.update('c-1', { title: 'fine' }, { action: 'card_updated' });
    expect(((await provider.getDoc('cards', 'c-1')) as unknown as Record<string, unknown>)?.['title']).toBe('fine');
  });

  it('ctx.getAfter returns committed state for sibling docs and the deleted image on delete', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const seen: Array<Record<string, unknown> | undefined> = [];
    const rules: TableWriteRules = {
      ...CARD_RULES,
      delete: async (ctx) => {
        if (ctx.getAfter === undefined) return false;
        seen[0] = await ctx.getAfter('cards', ctx.id);
        seen[1] = await ctx.getAfter('cards', 'other-card');
        return true;
      },
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules });
      }
    }
    const svc = new Svc(provider, makeSession());
    await seed(provider);
    await provider.set('cards', 'other-card', { title: 'sib', list_id: 'l-1', position: 1 } as CardData);
    await svc.delete('c-1');
    // Target doc: committed image folded with the delete stamp.
    expect(seen[0]).toMatchObject({ title: 'seed' });
    expect(seen[0]?.['deleted_at']).toBeDefined();
    // Sibling: untouched committed state.
    expect(seen[1]).toMatchObject({ title: 'sib' });
  });

  it('ctx.getAfter is undefined for the target doc on destroy', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const rules: TableWriteRules = {
      ...CARD_RULES,
      destroy: async (ctx) => ctx.getAfter !== undefined
        && (await ctx.getAfter('cards', ctx.id)) === undefined,
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session) {
        super({ provider: p, session: s, path: 'cards', rules });
      }
    }
    const svc = new Svc(provider, makeSession());
    await seed(provider);
    await svc.destroy('c-1');
    expect(await provider.getDoc('cards', 'c-1')).toBeNull();
  });

  it('forwards claims into single-doc rule evals', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_updated: async (ctx) =>
          ctx.claims?.['admin'] === true || ctx.patch['title'] !== 'admin-only',
      },
    };
    class Svc extends BaseEntityStorageService<CardMeta> {
      constructor(p: IStorageProvider<CardMeta>, s: Session, claims?: Readonly<Record<string, unknown>>) {
        super({ provider: p, session: s, path: 'cards', rules, ...(claims !== undefined ? { claims } : {}) });
      }
    }
    const plain = new Svc(provider, makeSession());
    const admin = new Svc(provider, makeSession(), { admin: true });
    await seed(provider);
    // No claims → the protected value is denied, ordinary values pass.
    await expect(
      plain.update('c-1', { title: 'admin-only' }, { action: 'card_updated' }),
    ).rejects.toThrow(WriteRuleDenied);
    await plain.update('c-1', { title: 'ok' }, { action: 'card_updated' });
    // Admin claim → the protected value passes.
    await admin.update('c-1', { title: 'admin-only' }, { action: 'card_updated' });
    expect(((await provider.getDoc('cards', 'c-1')) as unknown as Record<string, unknown>)?.['title']).toBe('admin-only');
  });
});
