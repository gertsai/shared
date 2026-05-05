// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

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
} from './types';

// Fixed timestamp + provider so assertions are deterministic.
const FIXED_TS: Timestamp = { seconds: 1_700_000_000, nanoseconds: 250_000_000 };
const fixedProvider: TimestampProvider = () => FIXED_TS;

// Minimal Session stub. Avoids constructing a full Session (which needs a
// dialog + tokenGetter) — type-only import + cast is sufficient because the
// builders only read `operatorUuid` and `operatorType`.
const stubSession = {
  operatorUuid: 'op-1',
  operatorType: 'api' as const,
} as unknown as Session;

describe('buildDataForSet', () => {
  it('fills all created_*, updated_*, and null deleted_* marks', () => {
    interface Doc {
      readonly name: string;
    }
    const result = buildDataForSet<Doc>({ name: 'Alice' }, stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      name: 'Alice',
      created_at: FIXED_TS,
      created_by_uuid: 'op-1',
      created_by_platform: 'api',
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'api',
      deleted_at: null,
      deleted_by_uuid: null,
      deleted_by_platform: null,
    });
  });

  it('preserves all original Data fields verbatim', () => {
    interface Doc {
      readonly a: number;
      readonly b: string;
      readonly nested: { readonly x: boolean };
    }
    const data: Doc = { a: 1, b: 'two', nested: { x: true } };
    const result = buildDataForSet<Doc>(data, stubSession, {
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
  it('fills only updated_* marks (no created_*, no deleted_*)', () => {
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
      updated_by_platform: 'api',
    });
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('deleted_at');
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
});

describe('buildDataForDelete', () => {
  it('fills deleted_* and refreshes updated_* to the same instant', () => {
    const result = buildDataForDelete(stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      deleted_at: FIXED_TS,
      deleted_by_uuid: 'op-1',
      deleted_by_platform: 'api',
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'api',
    });
    expect(result.deleted_at).toBe(result.updated_at);
  });
});

describe('buildDataForRestore', () => {
  it('clears deleted_* to null and refreshes updated_*', () => {
    const result = buildDataForRestore(stubSession, {
      timestampProvider: fixedProvider,
    });

    expect(result).toEqual({
      deleted_at: null,
      deleted_by_uuid: null,
      deleted_by_platform: null,
      updated_at: FIXED_TS,
      updated_by_uuid: 'op-1',
      updated_by_platform: 'api',
    });
  });
});

describe('builder argument validation', () => {
  it('throws when session is null', () => {
    expect(() =>
      buildDataForSet({ a: 1 }, null as unknown as Session),
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
      buildDataForSet({ a: 1 }, undefined as unknown as Session),
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
      { timestampProvider: fixedProvider },
    );

    // Apply soft-delete patch.
    const tombMarks = buildDataForDelete(stubSession, {
      timestampProvider: fixedProvider,
    });
    const tombstoned = { ...created, ...tombMarks };
    expect(tombstoned.title).toBe('My Doc');
    expect(tombstoned.count).toBe(5);
    expect(tombstoned.deleted_at).toEqual(FIXED_TS);

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
    // created_* survives the round-trip untouched.
    expect(restored.created_at).toEqual(FIXED_TS);
    expect(restored.created_by_uuid).toBe('op-1');
  });
});

describe('UpdateActionMap module-augmentation pattern (type-level)', () => {
  // Smoke test: the empty interface compiles and accepts the canonical
  // UpdateAction shape. Real consumers extend `UpdateActionMap` via
  // `declare module '@gertsai/entity-audit'` in their own files; we just
  // verify the surface area exists at runtime.
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
});

describe('EntityBasicStatus union', () => {
  it('accepts active / archived / deleted only', () => {
    const a: EntityBasicStatus = 'active';
    const b: EntityBasicStatus = 'archived';
    const c: EntityBasicStatus = 'deleted';
    expect([a, b, c]).toEqual(['active', 'archived', 'deleted']);
    // @ts-expect-error — 'pending' is not a member of EntityBasicStatus.
    const _bad: EntityBasicStatus = 'pending';
    expect(_bad).toBe('pending');
  });
});
