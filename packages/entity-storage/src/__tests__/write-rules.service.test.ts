// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { Session } from '@gertsai/session';
import type { AbstractDialog } from '@gertsai/session';
import type {
  IStorageProvider,
  StorageMetadata,
} from '@gertsai/storage-core';

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

describe('BaseEntityStorageService write-rules — batch/transaction routing', () => {
  it('a denied update routed via batch never lands in the queue', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    const batchUpdate = vi.fn();
    const fakeBatch = {
      set: vi.fn(),
      update: batchUpdate,
      delete: vi.fn(),
      restore: vi.fn(),
    };
    await expect(
      svc.update(
        'c-1',
        { title: 'x' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { action: 'bogus', batch: fakeBatch as any },
      ),
    ).rejects.toThrow(WriteRuleDenied);
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it('tx-routed update reads the resource from the provider (committed pre-state, not tx local view)', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seed(provider);
    const svc = new CardsStorage(provider, makeSession());
    const getDocSpy = vi.spyOn(provider, 'getDoc');
    const txGet = vi.fn(async () => ({
      _uid: 'c-1',
      title: 'seed',
      list_id: 'l-1',
      position: 1000,
    }));
    const txUpdate = vi.fn();
    const fakeTx = {
      get: txGet,
      set: vi.fn(),
      update: txUpdate,
      delete: vi.fn(),
      restore: vi.fn(),
    };
    await svc.update(
      'c-1',
      { list_id: 'l-2', position: 2000 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'card_moved', transaction: fakeTx as any },
    );
    // Rules resource = committed row → provider read, never tx.get
    // (the tx local view would already contain own queued writes).
    expect(txGet).not.toHaveBeenCalled();
    expect(getDocSpy).toHaveBeenCalledWith('cards', 'c-1');
    expect(txUpdate).toHaveBeenCalledWith(
      'c-1',
      { list_id: 'l-2', position: 2000 },
      expect.objectContaining({ action: 'card_moved' }),
    );
  });
});
