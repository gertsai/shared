// SPDX-License-Identifier: Apache-2.0
/**
 * Coverage for the validated read-path: lifecycle filtering, safe-query
 * policy, strip projection, guard denial, and the load* choke points.
 */
import { describe, expect, it, vi } from 'vitest';
import { whereField, orderBy, limit } from '@gertsai/query-dsl';
import type { StorageMetadata } from '@gertsai/storage-core';

import {
  DEFAULT_LIFECYCLE,
  DEFAULT_SERVER_FIELDS,
  SCALAR_WHERE_OPS,
  getLive,
  isLive,
  listLive,
  liveConstraint,
  loadCount,
  loadOne,
  loadPage,
  loadUids,
  sanitizeConstraints,
  stripFields,
  stripRows,
} from '../index';
import type { RowReader } from '../index';

type Meta = StorageMetadata;

interface FakeReader extends RowReader {
  getDocsCalls: unknown[];
}

function makeReader(rows: Record<string, unknown>[]): FakeReader {
  const getDocsCalls: unknown[] = [];
  return {
    getDocsCalls,
    getDoc: async (_path: string, id: string) =>
      rows.find((r) => r['id'] === id) ?? null,
    getDocs: async (_path: string, query?: unknown) => {
      getDocsCalls.push(query);
      return rows;
    },
  };
}

describe('lifecycle', () => {
  it('isLive rejects tombstoned rows and non-records', () => {
    expect(isLive({ entity_status: 'live' })).toBe(true);
    expect(isLive({ entity_status: 'deleted' })).toBe(false);
    expect(isLive({})).toBe(true);
    expect(isLive(null)).toBe(false);
    expect(isLive('x')).toBe(false);
  });

  it('liveConstraint emits the tombstone predicate', () => {
    expect(liveConstraint()).toEqual({
      kind: 'where',
      field: 'entity_status',
      op: '!=',
      value: 'deleted',
    });
  });

  it('getLive returns undefined for tombstones, the row for live docs', async () => {
    const reader = makeReader([
      { id: 'a', entity_status: 'deleted' },
      { id: 'b', entity_status: 'live' },
    ]);
    expect(await getLive(reader, 't', 'a')).toBeUndefined();
    expect(await getLive(reader, 't', 'b')).toEqual({
      id: 'b',
      entity_status: 'live',
    });
    expect(await getLive(reader, 't', 'a', false)).toEqual({
      id: 'a',
      entity_status: 'deleted',
    });
  });

  it('listLive prepends the lifecycle predicate unless disabled', async () => {
    const reader = makeReader([]);
    await listLive(reader, 't', []);
    await listLive(reader, 't', [], false);
    const [liveQuery, rawQuery] = reader.getDocsCalls as ReadonlyArray<
      ReadonlyArray<unknown>
    >;
    expect(liveQuery![0]).toEqual(liveConstraint());
    expect(rawQuery!).toHaveLength(0);
  });
});

describe('sanitizeConstraints', () => {
  it('validates raw shape via query-dsl (garbage throws)', () => {
    expect(() => sanitizeConstraints('nope')).toThrow(TypeError);
    expect(() => sanitizeConstraints([{ kind: 'where' }])).toThrow(TypeError);
  });

  it('rejects ops outside allowedOps', () => {
    const q = [whereField<Meta, string>('f', 'in', [1, 2])];
    expect(() =>
      sanitizeConstraints(q, { allowedOps: SCALAR_WHERE_OPS }),
    ).toThrow(/not allowed by policy/);
    expect(sanitizeConstraints(q)).toHaveLength(2); // + injected limit
  });

  it('rejects fields outside allowedFields (where + orderBy)', () => {
    expect(() =>
      sanitizeConstraints([whereField<Meta, string>('secret', '==', 1)], {
        allowedFields: new Set(['board_id']),
      }),
    ).toThrow(/not allowed by policy/);
    expect(() =>
      sanitizeConstraints([orderBy<Meta, string>('password')], {
        allowedFields: new Set(['position']),
      }),
    ).toThrow(/not allowed by policy/);
  });

  it('clamps and injects limit', () => {
    const clamped = sanitizeConstraints([limit<Meta>(99999)], {
      maxLimit: 100,
    });
    expect(clamped.find((c) => c.kind === 'limit')).toEqual({
      kind: 'limit',
      value: 100,
    });
    const injected = sanitizeConstraints([]);
    expect(injected.find((c) => c.kind === 'limit')).toEqual({
      kind: 'limit',
      value: 1000,
    });
  });

  it('appends pinned fields after client constraints', () => {
    const out = sanitizeConstraints([whereField<Meta, string>('a', '==', 1)], {
      pinnedFields: { space_uid: 's1' },
    });
    const pin = out[out.length - 1] as { field: string; op: string; value: unknown };
    expect(pin).toEqual({ kind: 'where', field: 'space_uid', op: '==', value: 's1' });
  });
});

describe('strip', () => {
  it('stripFields copies — the store row is not mutated', () => {
    const row = { id: 'a', update_action: { type: 'x' } };
    const out = stripFields(row, DEFAULT_SERVER_FIELDS);
    expect(out).toEqual({ id: 'a' });
    expect(row.update_action).toBeDefined();
  });

  it('stripRows maps + passes through empty field list', () => {
    const rows = [{ id: 'a', update_action: {} }, { id: 'b' }];
    expect(stripRows(rows, DEFAULT_SERVER_FIELDS)).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(stripRows(rows, [])).toEqual(rows);
  });
});

describe('load*', () => {
  const rows = [
    { id: 'a', board_id: 'b1', update_action: { type: 't' }, entity_status: 'live' },
    { id: 'b', board_id: 'b2', update_action: null, entity_status: 'live' },
    { id: 'c', board_id: 'b1', entity_status: 'deleted' },
  ];

  it('loadOne applies lifecycle + strip + guard id', async () => {
    const reader = makeReader(rows);
    const guard = vi.fn();
    const out = await loadOne({ reader, path: 'cards', id: 'a', strip: DEFAULT_SERVER_FIELDS, guard });
    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'cards', id: 'a' }),
    );
    expect(out).toEqual({ id: 'a', board_id: 'b1', entity_status: 'live' });
    expect(
      await loadOne({ reader, path: 'cards', id: 'c' }),
    ).toBeUndefined();
  });

  it('loadPage throws when the guard denies — before touching storage', async () => {
    const reader = makeReader(rows);
    const getDocsSpy = vi.spyOn(reader, 'getDocs');
    await expect(
      loadPage({
        reader,
        path: 'cards',
        guard: () => {
          throw new Error('denied');
        },
      }),
    ).rejects.toThrow('denied');
    expect(getDocsSpy).not.toHaveBeenCalled();
  });

  it('loadPage sends lifecycle + constraints + pins as ONE query', async () => {
    const reader = makeReader(rows);
    await loadPage({
      reader,
      path: 'cards',
      constraints: [whereField<Meta, string>('board_id', '==', 'b1')],
      policy: { pinnedFields: { project_id: 'p1' }, maxLimit: 5 },
    });
    const q = reader.getDocsCalls[0] as ReadonlyArray<{ kind: string; field?: string; value?: unknown }>;
    expect(q[0]).toEqual(liveConstraint());
    expect(q.some((c) => c.field === 'board_id')).toBe(true);
    expect(q.some((c) => c.field === 'project_id' && c.value === 'p1')).toBe(true);
    expect(q.some((c) => c.kind === 'limit' && c.value === 5)).toBe(true);
  });

  it('loadPage strips fields off every row', async () => {
    const reader = makeReader(rows);
    const out = await loadPage({ reader, path: 'cards', strip: DEFAULT_SERVER_FIELDS });
    expect(out.every((r) => !('update_action' in r))).toBe(true);
  });

  it('loadUids projects to string ids only', async () => {
    const reader = makeReader([{ id: 'a' }, { id: 7 }, { no_id: true }]);
    expect(await loadUids({ reader, path: 't' })).toEqual(['a']);
  });

  it('loadCount delegates to the counter with the full query', async () => {
    const reader = {
      ...makeReader(rows),
      count: async (_p: string, q?: unknown) =>
        (q as ReadonlyArray<unknown>).length,
    };
    expect(
      await loadCount({
        reader,
        path: 'cards',
        constraints: [whereField<Meta, string>('x', '==', 1)],
      }),
    ).toBe(3); // lifecycle + client where + injected limit
  });
});
