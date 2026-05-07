// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Pure in-memory query evaluator used by `InMemoryStorageProvider`.
 *
 * Applies the structural `Query<Meta>` carried over `IStorageProvider` against
 * an array of read-shaped documents. Per SPEC-008 W-1 fix the in-memory
 * provider previously ignored the query parameter (`_query`) on `getDocs` /
 * `count` / collection listeners, causing test fidelity divergence with
 * `PgStorageProvider` (which compiles the same `Query<Meta>` to SQL via
 * `compileToSql`).
 *
 * This module mirrors the constraint kinds emitted by `@gertsai/query-dsl`
 * factories WITHOUT importing that package — `entity-storage` deliberately
 * has no `query-dsl` peer to keep the test fixture self-contained. Any
 * change to query-dsl constraint shape MUST be reflected here.
 *
 * Supported semantics:
 *  - Where ops: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not-in`,
 *    `array-contains`, `array-contains-any`.
 *  - OrderBy: stable sort over indexed field, asc/desc.
 *  - Limit: trailing slice.
 *  - Cursors (`startAt` / `startAfter` / `endAt` / `endBefore`): lexicographic
 *    over the values aligned to the preceding `orderBy` clauses. When no
 *    `orderBy` is present the cursors degrade to no-ops (mirrors the
 *    reference `compileToSql` behaviour where cursors are documented as
 *    "no-op for v0.1.0").
 *
 * Constraint application order matches the SQL pipeline implied by
 * `compileToSql`: WHERE → ORDER BY → cursors → LIMIT.
 */

import type { Query, StorageMetadata } from '@gertsai/storage-core';

type Direction = 'asc' | 'desc';
type WhereOp =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'not-in'
  | 'array-contains'
  | 'array-contains-any';

interface WhereC {
  readonly kind: 'where';
  readonly field: string;
  readonly op: WhereOp;
  readonly value: unknown;
}

interface OrderByC {
  readonly kind: 'orderBy';
  readonly field: string;
  readonly direction: Direction;
}

interface LimitC {
  readonly kind: 'limit';
  readonly value: number;
}

interface CursorC {
  readonly kind: 'startAt' | 'startAfter' | 'endAt' | 'endBefore';
  readonly values: ReadonlyArray<unknown>;
}

type AnyConstraint = WhereC | OrderByC | LimitC | CursorC;

function readField(doc: unknown, field: string): unknown {
  if (doc === null || typeof doc !== 'object') return undefined;
  return (doc as Record<string, unknown>)[field];
}

function compareLex(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  // Fallback: lexicographic over String() coercion.
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function evalWhere(value: unknown, op: WhereOp, operand: unknown): boolean {
  switch (op) {
    case '==':
      return value === operand;
    case '!=':
      return value !== operand;
    case '<':
      return compareLex(value, operand) < 0;
    case '<=':
      return compareLex(value, operand) <= 0;
    case '>':
      return compareLex(value, operand) > 0;
    case '>=':
      return compareLex(value, operand) >= 0;
    case 'in': {
      if (!Array.isArray(operand)) return false;
      return operand.some((v) => v === value);
    }
    case 'not-in': {
      if (!Array.isArray(operand)) return true;
      return !operand.some((v) => v === value);
    }
    case 'array-contains': {
      if (!Array.isArray(value)) return false;
      return value.some((v) => v === operand);
    }
    case 'array-contains-any': {
      if (!Array.isArray(value) || !Array.isArray(operand)) return false;
      return operand.some((needle) => value.some((v) => v === needle));
    }
    default: {
      const exhaustive: never = op;
      void exhaustive;
      return false;
    }
  }
}

/**
 * Compare two docs by a list of `(field, direction)` keys, stable
 * lexicographic — i.e. order-by-N is the tiebreaker for ties on order-by-(N-1).
 */
function makeOrderComparator(
  orders: ReadonlyArray<OrderByC>,
): (a: unknown, b: unknown) => number {
  return (a, b): number => {
    for (const o of orders) {
      const av = readField(a, o.field);
      const bv = readField(b, o.field);
      const cmp = compareLex(av, bv);
      if (cmp !== 0) {
        return o.direction === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  };
}

/**
 * Lexicographic comparison of a doc's order-by-aligned values against a
 * cursor's `values` tuple. Returns negative, zero, positive matching the
 * sort order produced by `makeOrderComparator`.
 */
function cursorCompare(
  doc: unknown,
  values: ReadonlyArray<unknown>,
  orders: ReadonlyArray<OrderByC>,
): number {
  const len = Math.min(values.length, orders.length);
  for (let i = 0; i < len; i++) {
    const o = orders[i]!;
    const dv = readField(doc, o.field);
    const cv = values[i];
    const cmp = compareLex(dv, cv);
    if (cmp !== 0) {
      return o.direction === 'desc' ? -cmp : cmp;
    }
  }
  return 0;
}

/**
 * Apply a `Query<Meta>` against a snapshot of read-shaped documents.
 *
 * Pure function — never mutates the input array. Order of operations
 * mirrors the SQL pipeline (`WHERE → ORDER BY → cursors → LIMIT`) so that
 * results match `PgStorageProvider` for the same query/dataset.
 *
 * Unknown constraint kinds are silently ignored to avoid coupling this
 * test fixture to the exact set of constraint kinds the DSL ships at any
 * given time.
 */
export function applyQueryFilter<Meta extends StorageMetadata>(
  docs: ReadonlyArray<Meta['read']>,
  query: Query<Meta> | undefined,
): Meta['read'][] {
  if (!query || query.length === 0) {
    return [...docs];
  }

  const constraints = query as unknown as ReadonlyArray<AnyConstraint>;

  let result: Meta['read'][] = [...docs];

  // 1. WHERE
  for (const c of constraints) {
    if (c.kind !== 'where') continue;
    result = result.filter((doc) =>
      evalWhere(readField(doc, c.field), c.op, c.value),
    );
  }

  // 2. ORDER BY (collect all in declaration order)
  const orders = constraints.filter((c): c is OrderByC => c.kind === 'orderBy');
  if (orders.length > 0) {
    result = [...result].sort(makeOrderComparator(orders));
  }

  // 3. Cursors (require orderBy to be meaningful — degrade to no-op otherwise,
  //    matching the v0.1.0 reference compileToSql behaviour).
  if (orders.length > 0) {
    for (const c of constraints) {
      switch (c.kind) {
        case 'startAt':
          result = result.filter(
            (doc) => cursorCompare(doc, c.values, orders) >= 0,
          );
          break;
        case 'startAfter':
          result = result.filter(
            (doc) => cursorCompare(doc, c.values, orders) > 0,
          );
          break;
        case 'endAt':
          result = result.filter(
            (doc) => cursorCompare(doc, c.values, orders) <= 0,
          );
          break;
        case 'endBefore':
          result = result.filter(
            (doc) => cursorCompare(doc, c.values, orders) < 0,
          );
          break;
        default:
          break;
      }
    }
  }

  // 4. LIMIT (last `limit` wins if multiple are declared — matches Firestore).
  let limit: number | null = null;
  for (const c of constraints) {
    if (c.kind === 'limit') limit = c.value;
  }
  if (limit !== null && limit >= 0 && result.length > limit) {
    result = result.slice(0, limit);
  }

  return result;
}
