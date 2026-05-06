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
 * Cap the number of rows returned by a query. Negative or non-integer
 * values are passed through to {@link validateQuery} for runtime rejection.
 */
export function limit<Meta extends StorageMetadata>(
  n: number,
): LimitConstraint<Meta> {
  return { kind: 'limit', value: n };
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
