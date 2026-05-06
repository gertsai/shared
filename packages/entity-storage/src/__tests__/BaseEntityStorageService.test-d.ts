// SPDX-License-Identifier: Apache-2.0
/**
 * Type-level invariants for {@link BaseEntityStorageService}, the
 * {@link StorageEventPayload} discriminated union, and {@link SetEntityInput}.
 * Runtime body uses `expectTypeOf` from vitest — pure type assertions.
 *
 * Per SPEC-008.1 audit fixes C-5 (event payload union) and F5 (SetEntityInput
 * shape).
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { MutationMarks } from '@gertsai/entity-audit';
import type { StorageMetadata } from '@gertsai/storage-core';

import type {
  SetEntityInput,
  StorageEventPayload,
} from '../BaseEntityStorageService';

interface UserData {
  readonly name: string;
  readonly email: string;
}
type UserMeta = StorageMetadata<UserData & MutationMarks, UserData, 'name' | 'email'>;

describe('StorageEventPayload<Meta> discriminated union (C-5)', () => {
  it('narrows entity-created to a payload carrying `data: Meta["read"]`', () => {
    type P = StorageEventPayload<UserMeta>;
    type Created = Extract<P, { event: 'entity-created' }>;
    expectTypeOf<Created['data']>().toEqualTypeOf<UserData & MutationMarks>();
    // Created variant has no `partial` field.
    expectTypeOf<Created>().not.toHaveProperty('partial');
  });

  it('narrows entity-updated to a payload carrying `partial: Partial<Meta["write"]>`', () => {
    type P = StorageEventPayload<UserMeta>;
    type Updated = Extract<P, { event: 'entity-updated' }>;
    expectTypeOf<Updated['partial']>().toEqualTypeOf<Partial<UserData>>();
    // Updated variant has no full `data` field.
    expectTypeOf<Updated>().not.toHaveProperty('data');
  });

  it('narrows entity-deleted / entity-restored to bare {path,id} payloads', () => {
    type P = StorageEventPayload<UserMeta>;
    type Deleted = Extract<P, { event: 'entity-deleted' }>;
    type Restored = Extract<P, { event: 'entity-restored' }>;
    // No `data`, no `partial` — the `event` discriminant + `id` is enough.
    expectTypeOf<Deleted>().not.toHaveProperty('data');
    expectTypeOf<Deleted>().not.toHaveProperty('partial');
    expectTypeOf<Restored>().not.toHaveProperty('data');
    expectTypeOf<Restored>().not.toHaveProperty('partial');
    expectTypeOf<Deleted['id']>().toEqualTypeOf<string>();
    expectTypeOf<Restored['path']>().toEqualTypeOf<string>();
  });

  it('listeners can exhaustively switch on the event discriminant', () => {
    // Compile-only check: a switch over `event` covers all variants. The
    // trailing `assertNever(p)` proves exhaustivity — adding a new variant
    // without extending the switch will surface as a `never` mismatch.
    const assertNever = (x: never): never => {
      throw new Error(`unexpected event: ${String(x)}`);
    };
    const handler = (p: StorageEventPayload<UserMeta>): string => {
      switch (p.event) {
        case 'entity-created':
          return p.data.name;
        case 'entity-updated':
          return p.partial.email ?? '';
        case 'entity-deleted':
          return p.id;
        case 'entity-restored':
          return p.id;
        case 'entity-destroyed':
          return p.id;
        default:
          return assertNever(p);
      }
    };
    expectTypeOf(handler).parameter(0).toEqualTypeOf<StorageEventPayload<UserMeta>>();
  });
});

describe('SetEntityInput<Meta> shape (F5)', () => {
  it('equals Meta["write"] & { _uid?: string }, NOT Meta["read"]', () => {
    expectTypeOf<SetEntityInput<UserMeta>>().toEqualTypeOf<
      UserData & { readonly _uid?: string }
    >();
  });

  it('does not require MutationMarks fields on input (those are stamped server-side)', () => {
    // Caller can pass a bare write shape without supplying audit marks.
    const input: SetEntityInput<UserMeta> = {
      name: 'Alice',
      email: 'alice@example.com',
    };
    expectTypeOf(input).toMatchTypeOf<SetEntityInput<UserMeta>>();
    // `_uid` is optional.
    const withUid: SetEntityInput<UserMeta> = {
      _uid: 'fixed',
      name: 'B',
      email: 'b@x.com',
    };
    expectTypeOf(withUid).toMatchTypeOf<SetEntityInput<UserMeta>>();
  });
});
