// SPDX-License-Identifier: Apache-2.0
/**
 * Integration smoke for the {@link storageProviderIdentifier} DI token —
 * verifies registration + lookup against `@gertsai/di`'s `ServicesRegistry`
 * and confirms the identifier is a unique symbol-branded value.
 */
import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';

import { ServicesRegistry, createIdentifier } from '@gertsai/di';
import type { IGlobalService } from '@gertsai/di';

import { storageProviderIdentifier } from '../identifier';
import { ListenersNotSupportedError } from '../errors';
import type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageCapabilities,
  StorageMetadata,
} from '../types';

interface UserRead {
  id: string;
  email: string;
}
type UserMeta = StorageMetadata<UserRead, UserRead, 'id' | 'email'>;

/**
 * Minimal stub combining `IStorageProvider` with `IGlobalService` so it
 * fits the widened registry-side type. Listener methods throw to honour
 * the F-A-1 contract.
 */
class StubProvider
  extends EventEmitter
  implements IStorageProvider<UserMeta>, IGlobalService
{
  readonly capabilities = {
    listeners: false,
    transactions: false,
    batches: false,
  } as const satisfies StorageCapabilities;

  get isReady(): Promise<void> {
    return Promise.resolve();
  }

  async set(): Promise<void> {}
  async getDoc(): Promise<UserRead | null> {
    return null;
  }
  async getDocs(_path: string, _q?: Query<UserMeta>): Promise<UserRead[]> {
    return [];
  }
  async count(): Promise<number> {
    return 0;
  }
  async update(): Promise<void> {}
  async delete(): Promise<void> {}
  async runBatch<R>(fn: (b: IBatchRunner<UserMeta>) => Promise<R>): Promise<R> {
    return fn({
      set: () => {},
      update: () => {},
      delete: () => {},
    });
  }
  async runTransaction<R>(
    fn: (tx: ITransactionRunner<UserMeta>) => Promise<R>,
  ): Promise<R> {
    return fn({
      get: async () => null,
      set: () => {},
      update: () => {},
      delete: () => {},
    });
  }
  onDocumentSnapshot(
    _path: string,
    _id: string,
    _cb: (doc: UserRead | null) => void,
  ): () => void {
    throw new ListenersNotSupportedError('stub');
  }
  onCollectionSnapshot(
    _path: string,
    _query: Query<UserMeta>,
    _cb: (docs: UserRead[]) => void,
  ): () => void {
    throw new ListenersNotSupportedError('stub');
  }
  $destroy(): void {
    this.removeAllListeners();
  }
}

describe('storageProviderIdentifier', () => {
  it('is a string-typed branded service identifier', () => {
    // ServiceIdentifier<T> is `string & { __TYPE__: T }` — runtime is a Symbol
    // (per `createIdentifier`). The token's name is 'StorageProvider'.
    expect(typeof storageProviderIdentifier).toBe('symbol');
    expect(String(storageProviderIdentifier)).toContain('StorageProvider');
  });

  it('round-trips through ServicesRegistry.create()', () => {
    const registry = new ServicesRegistry<null>();
    const stub = new StubProvider();
    // Register via the canonical token. `create` ignores the consumer
    // argument for global services (passed as `null`).
    registry.register(storageProviderIdentifier, () => stub);
    const resolved = registry.create(storageProviderIdentifier, null);
    expect(resolved).toBe(stub);
  });

  it('throws when no factory is registered for the token', () => {
    const registry = new ServicesRegistry<null>();
    expect(() => registry.create(storageProviderIdentifier, null)).toThrow(
      /not found/i,
    );
  });

  it('produces a different identifier when the consumer creates a custom one', () => {
    // Apps with multiple providers (one per Meta) create their own tokens.
    const customId = createIdentifier<StubProvider, 'CustomStorage'>(
      'CustomStorage',
    );
    expect(customId).not.toBe(storageProviderIdentifier);

    const registry = new ServicesRegistry<null>();
    const a = new StubProvider();
    const b = new StubProvider();
    registry.register(storageProviderIdentifier, () => a);
    registry.register(customId, () => b);
    expect(registry.create(storageProviderIdentifier, null)).toBe(a);
    expect(registry.create(customId, null)).toBe(b);
  });

  it('unregister removes the factory', () => {
    const registry = new ServicesRegistry<null>();
    const stub = new StubProvider();
    registry.register(storageProviderIdentifier, () => stub);
    registry.unregister(storageProviderIdentifier);
    expect(() => registry.create(storageProviderIdentifier, null)).toThrow();
  });
});
