// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { Session } from '@gertsai/session';
import type { AbstractDialog } from '@gertsai/session';
import { VersionConflictError } from '@gertsai/storage-core';
import type { IStorageProvider, StorageMetadata } from '@gertsai/storage-core';
import type { AuditedBatchRunner, AuditedTxRunner } from './AuditedRunners';
import { BaseEntityStorageService } from './BaseEntityStorageService';
import { InMemoryStorageProvider } from './InMemoryStorageProvider';
import { allowFields, allowWrite, WriteRuleDenied } from './write-rules';
import type { TableWriteRules } from './write-rules';

interface CardData {
  readonly title: string;
  readonly list_id: string;
  readonly position: number;
  readonly profile?: { readonly scope: string };
  readonly update_version?: number;
  readonly update_action?: unknown;
}
type CardMeta = StorageMetadata<CardData, CardData, 'title' | 'list_id' | 'position'>;

const makeSession = (): Session =>
  new Session({
    operatorUuid: 'op-1',
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
    card_updated: allowFields([], ['title']),
    card_moved: allowFields(['list_id', 'position']),
  },
  delete: allowWrite,
  restore: allowWrite,
};

class CardsStorage extends BaseEntityStorageService<CardMeta> {
  constructor(provider: IStorageProvider<CardMeta>) {
    super({ provider, session: makeSession(), path: 'cards', rules: CARD_RULES });
  }
}

const seedCards = async (provider: InMemoryStorageProvider<CardMeta>): Promise<void> => {
  await provider.set('cards', 'c-1', {
    title: 'seed',
    list_id: 'l-1',
    position: 1000,
    update_version: 1,
  });
  await provider.set('cards', 'c-2', {
    title: 'safe',
    list_id: 'l-1',
    position: 2000,
    update_version: 1,
  });
};

type RunnerKind = 'batch' | 'transaction';
type CapturedRunner =
  | AuditedBatchRunner<CardMeta>
  | AuditedTxRunner<CardMeta>;

async function runWithCapturedRunner(
  service: CardsStorage,
  kind: RunnerKind,
  callback: (runner: CapturedRunner) => Promise<void>,
): Promise<void> {
  if (kind === 'batch') {
    await service.runBatch((runner) => callback(runner));
  } else {
    await service.runTransaction((runner) => callback(runner));
  }
}

describe('deferred write ownership snapshots', () => {
  it.each(['batch', 'transaction'] as const)(
    '%s policy evaluation uses the queued patch snapshot, not a later caller mutation',
    async (kind) => {
      const provider = new InMemoryStorageProvider<CardMeta>();
      await seedCards(provider);
      const service = new CardsStorage(provider);
      const patch = { position: 2000 };

      await expect(
        runWithCapturedRunner(service, kind, async (runner) => {
          runner.update('c-1', patch, { action: 'card_updated' });
          patch.position = 1000;
        }),
      ).rejects.toThrow(WriteRuleDenied);

      expect((await provider.getDoc('cards', 'c-1'))?.position).toBe(1000);
    },
  );

  it.each(['batch', 'transaction'] as const)(
    '%s authorizes owned nested data and action params after caller mutation',
    async (kind) => {
      const provider = new InMemoryStorageProvider<CardMeta>();
      await seedCards(provider);
      await provider.update('cards', 'c-1', { profile: { scope: 'before' } });
      const before = await provider.getDoc('cards', 'c-1');
      const params = { authorization: { canEdit: true }, scope: 'safe' };
      let authorizedAfter: Record<string, unknown> | undefined;
      const rules: TableWriteRules = {
        ...CARD_RULES,
        update: {
          card_updated: async (context) => {
            const after = await context.getAfter?.('cards', context.id);
            authorizedAfter = after;
            const authorization = context.action?.params['authorization'];
            return authorization !== null
              && typeof authorization === 'object'
              && 'canEdit' in authorization
              && authorization.canEdit === true
              && after !== undefined
              && after['profile'] !== null
              && typeof after['profile'] === 'object'
              && 'scope' in after['profile']
              && after['profile'].scope === context.action?.params['scope'];
          },
        },
      };
      class ParamsStorage extends BaseEntityStorageService<CardMeta> {
        constructor() {
          super({ provider, session: makeSession(), path: 'cards', rules });
        }
      }
      const service = new ParamsStorage();
      const profile = { scope: 'safe' };

      await runWithCapturedRunner(service, kind, async (runner) => {
        runner.update('c-1', { profile }, {
          action: 'card_updated',
          params,
        });
        profile.scope = 'mutated';
        params.authorization.canEdit = false;
        params.scope = 'mutated';
      });

      const persisted = await provider.getDoc('cards', 'c-1');
      expect(persisted?.profile).toEqual({ scope: 'safe' });
      expect(persisted?.update_action).toMatchObject({
        params: { authorization: { canEdit: true }, scope: 'safe' },
      });
      expect(authorizedAfter).toEqual(persisted);
    },
  );

  it.each(['batch', 'transaction'] as const)(
    '%s rejected nested write leaves the complete row unchanged',
    async (kind) => {
      const provider = new InMemoryStorageProvider<CardMeta>();
      await seedCards(provider);
      await provider.update('cards', 'c-1', { profile: { scope: 'safe' } });
      const before = await provider.getDoc('cards', 'c-1');
      const params = { authorization: { canEdit: false }, scope: 'safe' };
      const rules: TableWriteRules = {
        ...CARD_RULES,
        update: {
          card_updated: async (context) => {
            const after = await context.getAfter?.('cards', context.id);
            const authorization = context.action?.params['authorization'];
            return authorization !== null
              && typeof authorization === 'object'
              && 'canEdit' in authorization
              && authorization.canEdit === true
              && after !== undefined
              && after['profile'] !== null
              && typeof after['profile'] === 'object'
              && 'scope' in after['profile']
              && after['profile'].scope === context.action?.params['scope'];
          },
        },
      };
      class ParamsStorage extends BaseEntityStorageService<CardMeta> {
        constructor() {
          super({ provider, session: makeSession(), path: 'cards', rules });
        }
      }
      const service = new ParamsStorage();
      const profile = { scope: 'safe' };

      await expect(
        runWithCapturedRunner(service, kind, async (runner) => {
          runner.update('c-1', { profile }, {
            action: 'card_updated',
            params,
          });
          profile.scope = 'mutated';
          params.authorization.canEdit = true;
          params.scope = 'mutated';
        }),
      ).rejects.toThrow(WriteRuleDenied);

      expect(await provider.getDoc('cards', 'c-1')).toEqual(before);
    },
  );


  it.each(['update', 'delete'] as const)(
    'direct %s authorizes the originally captured action',
    async (verb) => {
      const provider = new InMemoryStorageProvider<CardMeta>();
      await seedCards(provider);
      const rules: TableWriteRules = {
        ...CARD_RULES,
        update: { card_allowed: allowWrite },
        delete: (context) => context.action?.type === 'card_allowed',
      };
      class ActionStorage extends BaseEntityStorageService<CardMeta> {
        constructor() {
          super({ provider, session: makeSession(), path: 'cards', rules });
        }
      }
      const service = new ActionStorage();
      const before = await provider.getDoc('cards', 'c-1');
      const opts: { action?: string } = { action: 'card_unlisted' };

      const operation = verb === 'update'
        ? service.update('c-1', { title: 'mutated' }, opts)
        : service.delete('c-1', opts);
      opts.action = 'card_allowed';

      await expect(operation).rejects.toThrow(WriteRuleDenied);
      expect(await provider.getDoc('cards', 'c-1')).toEqual(before);
    },
  );

  it.each(['update', 'delete', 'restore'] as const)(
    'direct %s retains its captured expectedVersion through rule evaluation',
    async (verb) => {
      const provider = new InMemoryStorageProvider<CardMeta>();
      await seedCards(provider);
      let resolveEntered!: () => void;
      const entered = {
        promise: new Promise<void>((resolve) => {
          resolveEntered = resolve;
        }),
        resolve: () => resolveEntered(),
      };
      let resolveGate!: () => void;
      const gate = {
        promise: new Promise<void>((resolve) => {
          resolveGate = resolve;
        }),
        resolve: () => resolveGate(),
      };
      const pause = async (): Promise<boolean> => {
        entered.resolve();
        await gate.promise;
        return true;
      };
      const rules: TableWriteRules = {
        ...CARD_RULES,
        update: { card_updated: pause },
        delete: pause,
        restore: pause,
      };
      class BarrierStorage extends BaseEntityStorageService<CardMeta> {
        constructor() {
          super({ provider, session: makeSession(), path: 'cards', rules });
        }
      }
      const service = new BarrierStorage();
      const opts: { expectedVersion?: number; action?: string } = {
        expectedVersion: 1,
        action: 'card_updated',
      };
      const operation = verb === 'update'
        ? service.update('c-1', { title: 'stale-update' }, opts)
        : verb === 'delete'
          ? service.delete('c-1', opts)
          : service.restore('c-1', opts);

      try {
        await entered.promise;
        await provider.update('cards', 'c-1', { title: 'concurrent-update' }, {
          expectedVersion: 1,
        });
        const afterConcurrentWrite = await provider.getDoc('cards', 'c-1');
        delete opts.expectedVersion;
        gate.resolve();

        await expect(operation).rejects.toThrow(VersionConflictError);
        expect(await provider.getDoc('cards', 'c-1')).toEqual(afterConcurrentWrite);
      } finally {
        gate.resolve();
        await operation.catch(() => undefined);
      }
    },
  );
});

describe('audited runner callback lifetime', () => {
  it.each([
    ['batch', 'routed'] as const,
    ['batch', 'direct'] as const,
    ['transaction', 'routed'] as const,
    ['transaction', 'direct'] as const,
  ])('%s rejects a %s write after the user callback settles', async (kind, path) => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seedCards(provider);
    let signalEntered!: () => void;
    let releaseGate!: () => void;
    const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_updated: async (context) => {
          if (context.id === 'c-1') {
            const sibling = await context.getAfter?.('cards', 'c-2');
            signalEntered();
            await gate;
            return sibling?.['title'] === 'safe';
          }
          return false;
        },
      },
    };
    class GatedStorage extends BaseEntityStorageService<CardMeta> {
      constructor() {
        super({ provider, session: makeSession(), path: 'cards', rules });
      }
    }
    const service = new GatedStorage();
    let captured: CapturedRunner | undefined;
    const operation = runWithCapturedRunner(service, kind, async (runner) => {
      captured = runner;
      runner.update('c-1', { title: 'first-write' }, { action: 'card_updated' });
    });

    await entered;
    if (captured === undefined) throw new Error('expected captured runner');
    let rejected = false;
    try {
      if (path === 'routed') {
        const write = kind === 'batch'
          ? service.update('c-2', { title: 'forbidden' }, {
            action: 'card_updated',
            batch: captured as AuditedBatchRunner<CardMeta>,
          })
          : service.update('c-2', { title: 'forbidden' }, {
            action: 'card_updated',
            transaction: captured as AuditedTxRunner<CardMeta>,
          });
        await expect(write).rejects.toThrow();
        rejected = true;
      } else {
        expect(() => captured?.update(
          'c-2',
          { title: 'forbidden' },
          { action: 'card_updated' },
        )).toThrow();
        rejected = true;
      }
    } finally {
      releaseGate();
      await operation.catch(() => undefined);
    }

    expect(rejected).toBe(true);
    expect((await provider.getDoc('cards', 'c-2'))?.title).toBe('safe');
  });
});

describe('service claims ownership snapshot', () => {
  it('retains the constructor-time nested claims for both direct and deferred policy checks', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seedCards(provider);
    const claims = { authorization: { canEdit: false } };
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: {
        card_updated: ({ claims: evaluatedClaims }) =>
          evaluatedClaims?.['authorization'] !== null
          && typeof evaluatedClaims?.['authorization'] === 'object'
          && (evaluatedClaims['authorization'] as { canEdit?: boolean }).canEdit === true,
      },
    };
    class ClaimsStorage extends BaseEntityStorageService<CardMeta> {
      constructor() {
        super({ provider, session: makeSession(), path: 'cards', rules, claims });
      }
    }
    const service = new ClaimsStorage();

    claims.authorization.canEdit = true;
    await expect(
      service.update('c-1', { title: 'direct-write' }, { action: 'card_updated' }),
    ).rejects.toThrow(WriteRuleDenied);
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');

    claims.authorization.canEdit = false;
    await expect(
      service.runBatch(async (batch) => {
        batch.update('c-1', { title: 'deferred-write' }, { action: 'card_updated' });
        claims.authorization.canEdit = true;
      }),
    ).rejects.toThrow(WriteRuleDenied);
    expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('seed');
  });
});
describe('action predicate own-property lookup', () => {
  it.each(['toString', 'constructor'] as const)(
    'denies inherited %s actions without changing the row on direct, batch, and transaction writes',
    async (action) => {
      for (const kind of ['direct', 'batch', 'transaction'] as const) {
        const provider = new InMemoryStorageProvider<CardMeta>();
        await seedCards(provider);
        const before = await provider.getDoc('cards', 'c-1');
        const service = new CardsStorage(provider);
        const options = { action };

        if (kind === 'direct') {
          await expect(
            service.update('c-1', { list_id: 'l-2' }, options),
          ).rejects.toThrow(WriteRuleDenied);
        } else {
          await expect(
            runWithCapturedRunner(service, kind, async (runner) => {
              runner.update('c-1', { list_id: 'l-2' }, options);
            }),
          ).rejects.toThrow(WriteRuleDenied);
        }

        expect(await provider.getDoc('cards', 'c-1')).toEqual(before);
      }
    },
  );

  it('does not use an inherited wildcard predicate as a fallback', async () => {
    const provider = new InMemoryStorageProvider<CardMeta>();
    await seedCards(provider);
    const before = await provider.getDoc('cards', 'c-1');
    const rules: TableWriteRules = {
      ...CARD_RULES,
      update: Object.create({ '*': allowWrite }) as NonNullable<TableWriteRules['update']>,
    };
    class InheritedWildcardStorage extends BaseEntityStorageService<CardMeta> {
      constructor() {
        super({ provider, session: makeSession(), path: 'cards', rules });
      }
    }

    await expect(
      new InheritedWildcardStorage().update(
        'c-1',
        { list_id: 'l-2' },
        { action: 'unlisted-action' },
      ),
    ).rejects.toThrow(WriteRuleDenied);
    expect(await provider.getDoc('cards', 'c-1')).toEqual(before);
  });

  it.each([
    ['explicit action', { toString: allowWrite }, 'toString'],
    ['explicit wildcard', { '*': allowWrite }, 'unlisted-action'],
  ] as const)(
    'preserves an own %s predicate',
    async (_label, updateRules, action) => {
      const provider = new InMemoryStorageProvider<CardMeta>();
      await seedCards(provider);
      const rules: TableWriteRules = { ...CARD_RULES, update: updateRules };
      class ExplicitActionStorage extends BaseEntityStorageService<CardMeta> {
        constructor() {
          super({ provider, session: makeSession(), path: 'cards', rules });
        }
      }

      await new ExplicitActionStorage().update(
        'c-1',
        { title: 'allowed' },
        { action },
      );
      expect((await provider.getDoc('cards', 'c-1'))?.title).toBe('allowed');
    },
  );
});
