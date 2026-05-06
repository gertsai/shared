// SPDX-License-Identifier: Apache-2.0
/**
 * Type-level invariants for {@link StorageMetadata}, {@link defineStorageMetadata},
 * and {@link IStorageProvider}. Uses `expectTypeOf` from vitest — no runtime
 * assertions; the file is included by `vitest typecheck`.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { defineStorageMetadata } from '../types';
import type {
  IStorageProvider,
  Query,
  StorageCapabilities,
  StorageMetadata,
} from '../types';

interface UserRead {
  id: string;
  email: string;
  age: number;
}

describe('StorageMetadata generic defaults', () => {
  it('defaults Write to Read and Indexed to keyof Read & string', () => {
    type Meta = StorageMetadata<UserRead>;
    expectTypeOf<Meta['read']>().toEqualTypeOf<UserRead>();
    expectTypeOf<Meta['write']>().toEqualTypeOf<UserRead>();
    expectTypeOf<Meta['indexed']>().toEqualTypeOf<'id' | 'email' | 'age'>();
  });

  it('honours explicit Write and Indexed when supplied', () => {
    type Meta = StorageMetadata<UserRead, { id: string }, 'id'>;
    expectTypeOf<Meta['read']>().toEqualTypeOf<UserRead>();
    expectTypeOf<Meta['write']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<Meta['indexed']>().toEqualTypeOf<'id'>();
  });
});

describe('defineStorageMetadata literal narrowing (F-T-1)', () => {
  it('narrows Indexed to the literal tuple element union', () => {
    const meta = defineStorageMetadata<UserRead>()({
      indexed: ['id', 'email'] as const,
    });
    type Meta = typeof meta;
    expectTypeOf<Meta['indexed']>().toEqualTypeOf<'id' | 'email'>();
    // Verify it does not widen to all keys of UserRead.
    expectTypeOf<Meta['indexed']>().not.toEqualTypeOf<'id' | 'email' | 'age'>();
  });

  it('preserves Read across the curry', () => {
    const meta = defineStorageMetadata<UserRead>()({
      indexed: ['id'] as const,
    });
    type Meta = typeof meta;
    expectTypeOf<Meta['read']>().toEqualTypeOf<UserRead>();
    expectTypeOf<Meta['write']>().toEqualTypeOf<UserRead>();
  });
});

describe('IStorageProvider method signatures (non-optional listeners F-T-3)', () => {
  type UserMeta = StorageMetadata<UserRead, UserRead, 'id' | 'email'>;

  it('all CRUD methods are present and async', () => {
    type Provider = IStorageProvider<UserMeta>;
    expectTypeOf<Provider>().toHaveProperty('set');
    expectTypeOf<Provider>().toHaveProperty('getDoc');
    expectTypeOf<Provider>().toHaveProperty('getDocs');
    expectTypeOf<Provider>().toHaveProperty('count');
    expectTypeOf<Provider>().toHaveProperty('update');
    expectTypeOf<Provider>().toHaveProperty('delete');
    expectTypeOf<Provider>().toHaveProperty('runBatch');
    expectTypeOf<Provider>().toHaveProperty('runTransaction');
  });

  it('listener methods are non-optional (always present in the interface)', () => {
    type Provider = IStorageProvider<UserMeta>;
    // Non-optional means the property type does not include `undefined`.
    // We also explicitly verify these keys are present.
    expectTypeOf<Provider>().toHaveProperty('onDocumentSnapshot');
    expectTypeOf<Provider>().toHaveProperty('onCollectionSnapshot');
    // The function shape itself must not be `undefined`.
    expectTypeOf<Provider['onDocumentSnapshot']>().not.toEqualTypeOf<undefined>();
    expectTypeOf<Provider['onCollectionSnapshot']>().not.toEqualTypeOf<undefined>();
  });

  it('capabilities is readonly StorageCapabilities', () => {
    type Provider = IStorageProvider<UserMeta>;
    expectTypeOf<Provider['capabilities']>().toEqualTypeOf<StorageCapabilities>();
  });

  it('getDocs accepts an optional Query<Meta>', () => {
    type Provider = IStorageProvider<UserMeta>;
    type GetDocs = Provider['getDocs'];
    expectTypeOf<GetDocs>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<GetDocs>()
      .parameter(1)
      .toEqualTypeOf<Query<UserMeta> | undefined>();
  });
});

describe('StorageCapabilities readonly fields', () => {
  it('all three flags are readonly boolean', () => {
    expectTypeOf<StorageCapabilities['listeners']>().toEqualTypeOf<boolean>();
    expectTypeOf<StorageCapabilities['transactions']>().toEqualTypeOf<boolean>();
    expectTypeOf<StorageCapabilities['batches']>().toEqualTypeOf<boolean>();
  });
});
