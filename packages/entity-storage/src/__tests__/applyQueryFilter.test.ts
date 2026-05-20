// SPDX-License-Identifier: Apache-2.0
/**
 * Coverage matrix for `applyQueryFilter` — the in-memory query evaluator
 * shared by `InMemoryStorageProvider.getDocs` / `count` / collection
 * listeners. Per SPEC-008 W-1 fix: parity with `compileToSql` (Postgres
 * reference) for every WhereOp + orderBy + limit + cursor combination.
 */
import { describe, expect, it } from 'vitest';

import { applyQueryFilter } from '../applyQueryFilter';
import type { StorageMetadata } from '@gertsai/storage-core';

interface UserData {
  readonly name: string;
  readonly age: number;
  readonly tags?: ReadonlyArray<string>;
}
type UserMeta = StorageMetadata<UserData, UserData, 'name' | 'age' | 'tags'>;

const users: ReadonlyArray<UserData> = [
  { name: 'Alice', age: 30, tags: ['admin', 'eu'] },
  { name: 'Bob', age: 25, tags: ['user', 'us'] },
  { name: 'Carol', age: 40, tags: ['admin', 'us'] },
  { name: 'Dave', age: 25, tags: ['user', 'eu'] },
  { name: 'Eve', age: 35 },
];

// Convenience: build a Query<UserMeta> from raw constraint objects without
// pulling `@gertsai/query-dsl` into entity-storage (per package boundaries).
function q(constraints: ReadonlyArray<unknown>): never {
  return constraints as never;
}

describe('applyQueryFilter — WhereOp parity', () => {
  it("'==' matches strict equality on indexed field", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'age', op: '==', value: 25 }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Bob', 'Dave']);
  });

  it("'!=' excludes the operand value", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'age', op: '!=', value: 25 }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Alice', 'Carol', 'Eve']);
  });

  it("'<' filters by strict less-than", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'age', op: '<', value: 30 }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Bob', 'Dave']);
  });

  it("'<=' filters by less-than-or-equal", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'age', op: '<=', value: 30 }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Alice', 'Bob', 'Dave']);
  });

  it("'>' filters by strict greater-than", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'age', op: '>', value: 30 }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Carol', 'Eve']);
  });

  it("'>=' filters by greater-than-or-equal", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'age', op: '>=', value: 30 }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Alice', 'Carol', 'Eve']);
  });

  it("'in' matches set membership", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'where', field: 'name', op: 'in', value: ['Alice', 'Eve'] }]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Alice', 'Eve']);
  });

  it("'not-in' excludes set members", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        {
          kind: 'where',
          field: 'name',
          op: 'not-in',
          value: ['Alice', 'Eve'],
        },
      ]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Bob', 'Carol', 'Dave']);
  });

  it("'array-contains' matches when field-array contains scalar", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'where', field: 'tags', op: 'array-contains', value: 'admin' },
      ]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Alice', 'Carol']);
  });

  it("'array-contains-any' matches when field-array intersects operand-array", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        {
          kind: 'where',
          field: 'tags',
          op: 'array-contains-any',
          value: ['admin', 'us'],
        },
      ]),
    );
    expect(out.map((u) => u.name).toSorted()).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

describe('applyQueryFilter — orderBy', () => {
  it('asc orders ascending on the field', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'orderBy', field: 'age', direction: 'asc' }]),
    );
    expect(out.map((u) => u.age)).toEqual([25, 25, 30, 35, 40]);
  });

  it('desc orders descending on the field', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'orderBy', field: 'age', direction: 'desc' }]),
    );
    expect(out.map((u) => u.age)).toEqual([40, 35, 30, 25, 25]);
  });

  it('multi-orderBy uses later clauses as tiebreakers', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'orderBy', field: 'name', direction: 'desc' },
      ]),
    );
    // Among age=25 ties, name desc → Dave before Bob.
    expect(out.map((u) => u.name)).toEqual([
      'Dave',
      'Bob',
      'Alice',
      'Eve',
      'Carol',
    ]);
  });
});

describe('applyQueryFilter — limit', () => {
  it('caps the result at N', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'limit', value: 2 },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([25, 25]);
  });

  it('limit larger than result is a no-op', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'limit', value: 100 }]),
    );
    expect(out.length).toBe(5);
  });
});

describe('applyQueryFilter — cursors', () => {
  it("'startAt' is inclusive on the orderBy field", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'startAt', values: [30] },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([30, 35, 40]);
  });

  it("'startAfter' is exclusive", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'startAfter', values: [30] },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([35, 40]);
  });

  it("'endAt' is inclusive", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'endAt', values: [30] },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([25, 25, 30]);
  });

  it("'endBefore' is exclusive", () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'endBefore', values: [30] },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([25, 25]);
  });

  it('cursor degrades to no-op when no orderBy is present', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([{ kind: 'startAt', values: [30] }]),
    );
    expect(out.length).toBe(5);
  });
});

describe('applyQueryFilter — offset (Wave 21 / EVID-076 FR-X3)', () => {
  it('skips the first N rows of the sorted set', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'offset', value: 2 },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([30, 35, 40]);
  });

  it('offset >= length yields empty result', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'offset', value: 100 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it('offset = 0 is a no-op (matches SQL semantics)', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'offset', value: 0 },
      ]),
    );
    expect(out.length).toBe(5);
  });

  it('offset applies AFTER orderBy + cursors but BEFORE limit', () => {
    // age asc: 25, 25, 30, 35, 40
    // startAt(25): 25, 25, 30, 35, 40
    // offset(1): 25, 30, 35, 40
    // limit(2): 25, 30
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'startAt', values: [25] },
        { kind: 'offset', value: 1 },
        { kind: 'limit', value: 2 },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([25, 30]);
  });
});

describe('applyQueryFilter — limitToLast (Wave 21 / EVID-076 FR-X4)', () => {
  it('returns trailing N rows of the sorted result', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'limitToLast', value: 2 },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([35, 40]);
  });

  it('limitToLast > result length is a no-op (returns full set)', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'limitToLast', value: 100 },
      ]),
    );
    expect(out.length).toBe(5);
  });

  it('limitToLast = 0 yields empty result', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'orderBy', field: 'age', direction: 'asc' },
        { kind: 'limitToLast', value: 0 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it('limitToLast combines with where + orderBy desc', () => {
    // age >= 25 desc: 40, 35, 30, 25, 25
    // limitToLast(2): 25, 25
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'where', field: 'age', op: '>=', value: 25 },
        { kind: 'orderBy', field: 'age', direction: 'desc' },
        { kind: 'limitToLast', value: 2 },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([25, 25]);
  });
});

describe('applyQueryFilter — combined where + orderBy + limit', () => {
  it('applies WHERE first, then ORDER BY, then LIMIT (matches SQL pipeline)', () => {
    const out = applyQueryFilter<UserMeta>(
      users,
      q([
        { kind: 'where', field: 'age', op: '>=', value: 30 },
        { kind: 'orderBy', field: 'age', direction: 'desc' },
        { kind: 'limit', value: 2 },
      ]),
    );
    expect(out.map((u) => u.age)).toEqual([40, 35]);
  });

  it('is pure — does not mutate the input array', () => {
    const input: ReadonlyArray<UserData> = users;
    const before = input.map((u) => u.name);
    applyQueryFilter<UserMeta>(
      input,
      q([{ kind: 'orderBy', field: 'age', direction: 'desc' }]),
    );
    expect(input.map((u) => u.name)).toEqual(before);
  });

  it('empty query returns a copy of all docs', () => {
    const out = applyQueryFilter<UserMeta>(users, undefined);
    expect(out.length).toBe(5);
    expect(out).not.toBe(users); // not the same reference
  });
});
