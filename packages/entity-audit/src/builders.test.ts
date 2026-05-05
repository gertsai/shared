// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Session } from '@gertsai/session';

import {
  buildDataForDelete,
  buildDataForRestore,
  buildDataForSet,
  buildDataForUpdate,
} from './builders';
import type { TimestampProvider } from './timestamp';
import type {
  EntityBasicStatus,
  Timestamp,
  UpdateAction,
  UpdateActionMap,
  UpdateActionType,
} from './types';

// Module augmentation — exercises the F-14 narrowing pathway. After this
// declaration, `UpdateActionType` resolves to 'invite_sent' | 'transfer'
// across the entire test file, and `UpdateAction.type` includes those
// literals alongside the lifecycle reserved 'create' | 'delete' | 'restore'.
declare module './types' {
  interface UpdateActionMap {
    invite_sent: { type: 'invite_sent'; params: { email: string } };
    transfer: { type: 'transfer'; params: { amount: number } };
    noop: { type: 'noop' };
  }
}

// Fixed timestamp + provider so assertions are deterministic.
const FIXED_TS: Timestamp = { seconds: 1_700_000_000, nanoseconds: 250_000_000 };
const fixedProvider: TimestampProvider = () => FIXED_TS;

// Minimal Session stub. Avoids constructing a full Session (which needs a
// dialog + tokenGetter) — type-only import + cast is sufficient because the
// builders only read `operatorUuid` and `clientPlatform`. We deliberately
// pick `operatorType !== clientPlatform` to assert F-11 (audit fields come
// from `clientPlatform`, not `operatorType`).
const stubSession = {
  operatorUuid: 'op-1',
  operatorType: 'system' as const,
  clientPlatform: 'web' as const,
} as unknown as Session;

describe('buildDataForSet', () => {
  it('fills _uid, status, update_action, and full MutationMarks triplet', () => {
    interface Doc {
      readonly name: string;
    }
    const result = buildDataForSet<Doc>({ name: 'Alice' }, stubSession, {
      _uid: 'uid-1',
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      _uid: 'uid-1',
      name: 'Alice',
      status: 'created',
      update_action: {
        type: 'create',
        params: {},
        timestamp: FIXED_TS,
      },
      created_at: FIXED_TS,
      creator_uuid: 'op-1',
      created_by_platform: 'web',
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'web',
      deleted_at: null,
      deleted_by_uuid: null,
      deleted_by_platform: null,
    });
  });

  it('uses session.clientPlatform (not operatorType) for *_by_platform fields', () => {
    const result = buildDataForSet({ x: 1 }, stubSession, {
      _uid: 'uid-2',
      timestampProvider: fixedProvider,
    });
    // session.clientPlatform === 'web'; session.operatorType === 'system'.
    expect(result.created_by_platform).toBe('web');
    expect(result.updated_by_platform).toBe('web');
    expect(result.created_by_platform).not.toBe('system');
  });

  it('honours custom status override', () => {
    const result = buildDataForSet({}, stubSession, {
      _uid: 'uid-3',
      status: 'active',
      timestampProvider: fixedProvider,
    });
    expect(result.status).toBe('active');
  });

  it('respects merge order: base → data → marks → overrides', () => {
    const result = buildDataForSet(
      { value: 'from-data' },
      stubSession,
      {
        _uid: 'uid-4',
        base: { value: 'from-base', extra: 'base-only' },
        overrides: { value: 'from-overrides', status: 'archived' },
        timestampProvider: fixedProvider,
      },
    );
    // data wins over base.
    expect((result as unknown as { value: string }).value).toBe(
      'from-overrides',
    );
    // base-only key survives because nothing later overrides it.
    expect((result as unknown as { extra: string }).extra).toBe('base-only');
    // overrides win over status default.
    expect(result.status).toBe('archived');
    // overrides do NOT clobber audit triplet by accident — we only set
    // `status` here, so creator_uuid still comes from session.
    expect(result.creator_uuid).toBe('op-1');
  });

  it('propagates update_action.params from opts.params', () => {
    const result = buildDataForSet({}, stubSession, {
      _uid: 'uid-5',
      params: { source: 'invite-flow', cohort: 'beta' },
      timestampProvider: fixedProvider,
    });
    expect(result.update_action.params).toEqual({
      source: 'invite-flow',
      cohort: 'beta',
    });
    expect(result.update_action.type).toBe('create');
  });

  it('preserves all original Data fields verbatim', () => {
    interface Doc {
      readonly a: number;
      readonly b: string;
      readonly nested: { readonly x: boolean };
    }
    const data: Doc = { a: 1, b: 'two', nested: { x: true } };
    const result = buildDataForSet<Doc>(data, stubSession, {
      _uid: 'uid-6',
      timestampProvider: fixedProvider,
    });

    expect(result.a).toBe(1);
    expect(result.b).toBe('two');
    expect(result.nested).toEqual({ x: true });
    // Same reference passes through (shallow spread keeps the inner object).
    expect(result.nested).toBe(data.nested);
  });
});

describe('buildDataForUpdate', () => {
  it('fills only updated_* marks when no action supplied (no created_*, no deleted_*, no update_action)', () => {
    interface Doc {
      readonly name: string;
    }
    const result = buildDataForUpdate<Doc>({ name: 'Bob' }, stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      name: 'Bob',
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'web',
    });
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('deleted_at');
    expect(result).not.toHaveProperty('update_action');
  });

  it('records update_action when opts.action provided', () => {
    interface Doc {
      readonly name: string;
    }
    const result = buildDataForUpdate<Doc>({ name: 'Bob' }, stubSession, {
      action: { type: 'invite_sent', params: { email: 'a@b.com' } },
      timestampProvider: fixedProvider,
    });

    expect(result.update_action).toEqual({
      type: 'invite_sent',
      params: { email: 'a@b.com' },
      timestamp: FIXED_TS,
    });
    // updated_* still present.
    expect(result.updated_by_platform).toBe('web');
  });

  it('defaults action.params to empty object when omitted', () => {
    const result = buildDataForUpdate({}, stubSession, {
      action: { type: 'noop' },
      timestampProvider: fixedProvider,
    });
    expect(result.update_action?.params).toEqual({});
  });

  it('preserves the partial fields supplied by the caller', () => {
    interface Doc {
      readonly a: number;
      readonly b: string;
    }
    const result = buildDataForUpdate<Doc>({ a: 99 }, stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result.a).toBe(99);
    expect(result).not.toHaveProperty('b');
  });

  it('uses clientPlatform (not operatorType) for updated_by_platform', () => {
    const result = buildDataForUpdate({}, stubSession, {
      timestampProvider: fixedProvider,
    });
    expect(result.updated_by_platform).toBe('web');
    expect(result.updated_by_platform).not.toBe('system');
  });
});

describe('buildDataForDelete', () => {
  it('fills deleted_*, refreshes updated_*, sets status, emits update_action: delete', () => {
    const result = buildDataForDelete(stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      deleted_at: FIXED_TS,
      deleted_by_uuid: 'op-1',
      deleted_by_platform: 'web',
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'web',
      status: 'deleted',
      update_action: {
        type: 'delete',
        params: {},
        timestamp: FIXED_TS,
      },
    });
    expect(result.deleted_at).toBe(result.updated_at);
  });

  it('uses clientPlatform for both deleted_by_platform and updated_by_platform', () => {
    const result = buildDataForDelete(stubSession, {
      timestampProvider: fixedProvider,
    });
    expect(result.deleted_by_platform).toBe('web');
    expect(result.updated_by_platform).toBe('web');
  });
});

describe('buildDataForRestore', () => {
  it('clears deleted_* to null, refreshes updated_*, sets status, emits update_action: restore', () => {
    const result = buildDataForRestore(stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      deleted_at: null,
      deleted_by_uuid: null,
      deleted_by_platform: null,
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'web',
      status: 'created',
      update_action: {
        type: 'restore',
        params: {},
        timestamp: FIXED_TS,
      },
    });
  });
});

describe('builder argument validation', () => {
  it('throws when session is null', () => {
    expect(() =>
      buildDataForSet({ a: 1 }, null as unknown as Session, { _uid: 'x' }),
    ).toThrow(/non-null Session/);
    expect(() =>
      buildDataForUpdate({ a: 1 }, null as unknown as Session),
    ).toThrow(/non-null Session/);
    expect(() => buildDataForDelete(null as unknown as Session)).toThrow(
      /non-null Session/,
    );
    expect(() => buildDataForRestore(null as unknown as Session)).toThrow(
      /non-null Session/,
    );
  });

  it('throws when session is undefined', () => {
    expect(() =>
      buildDataForSet({ a: 1 }, undefined as unknown as Session, {
        _uid: 'x',
      }),
    ).toThrow(/non-null Session/);
  });
});

describe('soft-delete + restore round-trip', () => {
  it('preserves business data integrity across delete + restore', () => {
    interface Doc {
      readonly title: string;
      readonly count: number;
    }
    const created = buildDataForSet<Doc>(
      { title: 'My Doc', count: 5 },
      stubSession,
      { _uid: 'doc-1', timestampProvider: fixedProvider },
    );

    // Apply soft-delete patch.
    const tombMarks = buildDataForDelete(stubSession, {
      timestampProvider: fixedProvider,
    });
    const tombstoned = { ...created, ...tombMarks };
    expect(tombstoned.title).toBe('My Doc');
    expect(tombstoned.count).toBe(5);
    expect(tombstoned.deleted_at).toEqual(FIXED_TS);
    expect(tombstoned.status).toBe('deleted');
    expect(tombstoned.update_action.type).toBe('delete');

    // Apply restore patch.
    const restoreMarks = buildDataForRestore(stubSession, {
      timestampProvider: fixedProvider,
    });
    const restored = { ...tombstoned, ...restoreMarks };
    expect(restored.title).toBe('My Doc');
    expect(restored.count).toBe(5);
    expect(restored.deleted_at).toBeNull();
    expect(restored.deleted_by_uuid).toBeNull();
    expect(restored.deleted_by_platform).toBeNull();
    expect(restored.status).toBe('created');
    expect(restored.update_action.type).toBe('restore');
    // created_* survives the round-trip untouched.
    expect(restored.created_at).toEqual(FIXED_TS);
    expect(restored.creator_uuid).toBe('op-1');
  });
});

describe('UpdateActionMap module-augmentation pattern', () => {
  it('exports an UpdateActionMap interface that consumers can augment', () => {
    const action: UpdateAction = {
      type: 'invite_sent',
      params: { email: 'a@b.com' },
      timestamp: FIXED_TS,
    };
    expect(action.type).toBe('invite_sent');
    // Reference UpdateActionMap so the import is not pruned.
    const _map = {} as UpdateActionMap;
    expect(_map).toEqual({});
  });

  it('UpdateAction.type is at minimum assignable from the lifecycle literals', () => {
    // Lifecycle literals stay assignable regardless of UpdateActionMap state.
    expectTypeOf<'create'>().toMatchTypeOf<UpdateAction['type']>();
    expectTypeOf<'delete'>().toMatchTypeOf<UpdateAction['type']>();
    expectTypeOf<'restore'>().toMatchTypeOf<UpdateAction['type']>();
  });

  it('UpdateAction.type narrows to include augmented literals (type-level)', () => {
    // After the `declare module './types'` block above, the augmented
    // literals must be assignable to `UpdateAction.type` too.
    expectTypeOf<'invite_sent'>().toMatchTypeOf<UpdateAction['type']>();
    expectTypeOf<'transfer'>().toMatchTypeOf<UpdateAction['type']>();
    expectTypeOf<'noop'>().toMatchTypeOf<UpdateAction['type']>();
  });
});

describe('EntityBasicStatus union (open with autocomplete hints)', () => {
  it('accepts the four canonical literals', () => {
    const a: EntityBasicStatus = 'active';
    const b: EntityBasicStatus = 'created';
    const c: EntityBasicStatus = 'archived';
    const d: EntityBasicStatus = 'deleted';
    expect([a, b, c, d]).toEqual(['active', 'created', 'archived', 'deleted']);
  });

  it('also accepts custom domain statuses (open string union)', () => {
    // No @ts-expect-error — the `(string & {})` branch keeps the union open.
    const pending: EntityBasicStatus = 'pending';
    const draft: EntityBasicStatus = 'draft';
    const suspended: EntityBasicStatus = 'suspended';
    expect([pending, draft, suspended]).toEqual([
      'pending',
      'draft',
      'suspended',
    ]);
  });
});

describe('UpdateActionType derivation (F-14)', () => {
  it('resolves to the union of augmented action `type` literals', () => {
    // After the `declare module './types'` augmentation at top of file,
    // UpdateActionType narrows to 'invite_sent' | 'transfer' | 'noop'.
    expectTypeOf<UpdateActionType>().toEqualTypeOf<
      'invite_sent' | 'transfer' | 'noop'
    >();
  });
});
