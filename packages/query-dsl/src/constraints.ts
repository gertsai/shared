// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/storage/src/operations/queryConstraints/*
// (Apache 2.0). The Firelord-typed factories are replaced with
// `StorageMetadata`-generic ones that compile-validate against `Meta['indexed']`.

import type { StorageMetadata } from '@gertsai/storage-core';
import type {
  Direction,
  EndAtConstraint,
  EndBeforeConstraint,
  LimitConstraint,
  LimitToLastConstraint,
  OffsetConstraint,
  OrderByConstraint,
  StartAfterConstraint,
  StartAtConstraint,
  WhereConstraint,
  WhereOp,
} from './types';

/* eslint-disable @typescript-eslint/unified-signatures -- overloads partition the WhereOp space by value shape so the array-typed ops are visible in autocomplete; merging would erase that distinction. */

/**
 * Build a `where` constraint on an indexed field. The operator overloads
 * partition {@link WhereOp} by the runtime shape its `value` requires:
 *
 * - scalar comparison (`==`, `!=`, `<`, `<=`, `>`, `>=`) → `unknown`
 *   single value;
 * - `in` / `not-in` → `ReadonlyArray<unknown>`;
 * - `array-contains` → `unknown` single value;
 * - `array-contains-any` → `ReadonlyArray<unknown>`.
 *
 * `value` itself is intentionally `unknown` (or `ReadonlyArray<unknown>`)
 * to avoid the exponential blowup of resolving `Meta['read'][F]` for deep
 * `Read` shapes, and to keep `Meta['read'] = unknown` usable. Callers
 * relying on shape-correct values should validate at runtime via
 * {@link validateQuery} and lean on DB-side constraint enforcement.
 */
export function whereField<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
>(
  field: F,
  op: '==' | '!=' | '<' | '<=' | '>' | '>=',
  value: unknown,
): WhereConstraint<Meta, F>;
export function whereField<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
>(
  field: F,
  op: 'in' | 'not-in',
  value: ReadonlyArray<unknown>,
): WhereConstraint<Meta, F>;
export function whereField<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
>(
  field: F,
  op: 'array-contains',
  value: unknown,
): WhereConstraint<Meta, F>;
export function whereField<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
>(
  field: F,
  op: 'array-contains-any',
  value: ReadonlyArray<unknown>,
): WhereConstraint<Meta, F>;
export function whereField<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
>(field: F, op: WhereOp, value: unknown): WhereConstraint<Meta, F> {
  return { kind: 'where', field, op, value };
}

/* eslint-enable @typescript-eslint/unified-signatures */

/**
 * Sort by an indexed field; `direction` defaults to `'asc'`.
 *
 * Mirrors `orderBy(fieldPath, directionStr?)` from Orchestra
 * `orchlab/storage` — the only deviation is that `field` is constrained to
 * `Meta['indexed']` instead of an open string.
 */
export function orderBy<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
>(field: F, direction: Direction = 'asc'): OrderByConstraint<Meta, F> {
  return { kind: 'orderBy', field, direction };
}

/**
 * Cap the number of rows returned by a query. Rejects non-integers and
 * negative values eagerly (mirrored by {@link validateQuery}).
 */
export function limit<Meta extends StorageMetadata>(
  n: number,
): LimitConstraint<Meta> {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('limit requires a non-negative integer');
  }
  return { kind: 'limit', value: n };
}

/**
 * Take the *last* `n` rows of the ordered result set — semantically a
 * mirror of `limit(n)` applied after a hypothetical sort reversal.
 * Requires at least one preceding `orderBy` clause to be meaningful;
 * the runtime validator does not enforce that pairing (matching how
 * `limit` is treated). The reference Postgres `compileToSql` does NOT
 * support this constraint — emit it only against backends that handle
 * `limitToLast` natively, or reverse the `orderBy` direction yourself
 * and use `limit(n)`.
 */
export function limitToLast<Meta extends StorageMetadata>(
  n: number,
): LimitToLastConstraint<Meta> {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('limitToLast requires a non-negative integer');
  }
  return { kind: 'limitToLast', value: n };
}

/**
 * Skip the first `n` rows of the ordered result set. Mirrors SQL
 * `OFFSET n` and is honoured by the reference Postgres compiler.
 */
export function offset<Meta extends StorageMetadata>(
  n: number,
): OffsetConstraint<Meta> {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('offset requires a non-negative integer');
  }
  return { kind: 'offset', value: n };
}

/**
 * Inclusive lower-bound cursor. The supplied `values` are matched in order
 * against the leading `orderBy` clauses of the query.
 */
export function startAt<Meta extends StorageMetadata>(
  ...values: ReadonlyArray<unknown>
): StartAtConstraint<Meta> {
  return { kind: 'startAt', values };
}

/** Exclusive lower-bound cursor; otherwise identical to {@link startAt}. */
export function startAfter<Meta extends StorageMetadata>(
  ...values: ReadonlyArray<unknown>
): StartAfterConstraint<Meta> {
  return { kind: 'startAfter', values };
}

/** Inclusive upper-bound cursor; otherwise identical to {@link startAt}. */
export function endAt<Meta extends StorageMetadata>(
  ...values: ReadonlyArray<unknown>
): EndAtConstraint<Meta> {
  return { kind: 'endAt', values };
}

/** Exclusive upper-bound cursor; otherwise identical to {@link startAt}. */
export function endBefore<Meta extends StorageMetadata>(
  ...values: ReadonlyArray<unknown>
): EndBeforeConstraint<Meta> {
  return { kind: 'endBefore', values };
}

/**
 * Bound set of constraint factories — see {@link defineQueryConstraints}.
 * Returned shape; the generic over `Meta` is captured at the curry site so
 * each method only takes the field literal at the call site.
 *
 * @public
 */
export interface BoundQueryConstraints<Meta extends StorageMetadata> {
  /** `where` constraint on an indexed field. See {@link whereField}. */
  where<F extends Meta['indexed']>(
    field: F,
    op: '==' | '!=' | '<' | '<=' | '>' | '>=',
    value: unknown,
  ): WhereConstraint<Meta, F>;
  where<F extends Meta['indexed']>(
    field: F,
    op: 'in' | 'not-in',
    value: ReadonlyArray<unknown>,
  ): WhereConstraint<Meta, F>;
  where<F extends Meta['indexed']>(
    field: F,
    op: 'array-contains',
    value: unknown,
  ): WhereConstraint<Meta, F>;
  where<F extends Meta['indexed']>(
    field: F,
    op: 'array-contains-any',
    value: ReadonlyArray<unknown>,
  ): WhereConstraint<Meta, F>;
  /** Sort by an indexed field. See {@link orderBy}. */
  orderBy<F extends Meta['indexed']>(
    field: F,
    direction?: Direction,
  ): OrderByConstraint<Meta, F>;
  /** Cap the number of returned rows. See {@link limit}. */
  limit(n: number): LimitConstraint<Meta>;
  /** Take the last `n` rows of the ordered set. See {@link limitToLast}. */
  limitToLast(n: number): LimitToLastConstraint<Meta>;
  /** Skip the first `n` rows of the ordered set. See {@link offset}. */
  offset(n: number): OffsetConstraint<Meta>;
  /** Inclusive lower-bound cursor. See {@link startAt}. */
  startAt(...values: ReadonlyArray<unknown>): StartAtConstraint<Meta>;
  /** Exclusive lower-bound cursor. See {@link startAfter}. */
  startAfter(...values: ReadonlyArray<unknown>): StartAfterConstraint<Meta>;
  /** Inclusive upper-bound cursor. See {@link endAt}. */
  endAt(...values: ReadonlyArray<unknown>): EndAtConstraint<Meta>;
  /** Exclusive upper-bound cursor. See {@link endBefore}. */
  endBefore(...values: ReadonlyArray<unknown>): EndBeforeConstraint<Meta>;
}

/**
 * Curried factory bundle that captures `Meta` once so subsequent constraint
 * calls infer the field generic from the literal alone — no per-call
 * `<UserMeta, 'email'>` dance.
 *
 * Per SPEC-008.1 audit fix F3: prior usage required the consumer to pass
 * both `Meta` and `F` on every `whereField<Meta, F>(...)` call. With this
 * factory, the field literal is the only generic argument inferred at the
 * call site:
 *
 * ```ts
 * const q = defineQueryConstraints<UserMeta>();
 * repo.list([
 *   q.where('email', '==', 'a@b.com'),       // ok
 *   q.orderBy('email'),                       // ok
 *   q.limit(10),
 * ]);
 * // q.where('description', '==', 'x')        // compile error: 'description' not in Meta['indexed']
 * ```
 *
 * The standalone factories (`whereField`, `orderBy`, etc.) remain available
 * for callers who prefer the explicit generic form.
 *
 * @template Meta - The {@link StorageMetadata} the constraints bind to.
 * @returns Factory bundle whose methods produce constraints typed against
 *   the supplied `Meta`.
 *
 * @public
 */
export function defineQueryConstraints<
  Meta extends StorageMetadata,
>(): BoundQueryConstraints<Meta> {
  return {
    where<F extends Meta['indexed']>(
      field: F,
      op: WhereOp,
      value: unknown,
    ): WhereConstraint<Meta, F> {
      return { kind: 'where', field, op, value };
    },
    orderBy<F extends Meta['indexed']>(
      field: F,
      direction: Direction = 'asc',
    ): OrderByConstraint<Meta, F> {
      return { kind: 'orderBy', field, direction };
    },
    limit(n: number): LimitConstraint<Meta> {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error('limit requires a non-negative integer');
      }
      return { kind: 'limit', value: n };
    },
    limitToLast(n: number): LimitToLastConstraint<Meta> {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error('limitToLast requires a non-negative integer');
      }
      return { kind: 'limitToLast', value: n };
    },
    offset(n: number): OffsetConstraint<Meta> {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error('offset requires a non-negative integer');
      }
      return { kind: 'offset', value: n };
    },
    startAt(...values: ReadonlyArray<unknown>): StartAtConstraint<Meta> {
      return { kind: 'startAt', values };
    },
    startAfter(
      ...values: ReadonlyArray<unknown>
    ): StartAfterConstraint<Meta> {
      return { kind: 'startAfter', values };
    },
    endAt(...values: ReadonlyArray<unknown>): EndAtConstraint<Meta> {
      return { kind: 'endAt', values };
    },
    endBefore(...values: ReadonlyArray<unknown>): EndBeforeConstraint<Meta> {
      return { kind: 'endBefore', values };
    },
  };
}
