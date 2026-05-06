// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/storage/src/operations/queryConstraints
// (Apache 2.0). Mirrors the Firestore-derived constraint shape 1:1 with the
// `@orchlab/firelord` coupling stripped per ADR-005 — every constraint is
// generic over `StorageMetadata<Read, Write, Indexed>` instead of a closed
// Firestore meta type.

import type { StorageMetadata } from '@gertsai/storage-core';

/**
 * Comparison and set-membership operators supported by `whereField`.
 *
 * - `==`, `!=`, `<`, `<=`, `>`, `>=` — scalar comparison, single value.
 * - `in`, `not-in` — set membership; value MUST be a `ReadonlyArray<unknown>`.
 * - `array-contains` — Firestore-style "field is an array containing value".
 * - `array-contains-any` — Firestore-style "field is an array intersecting
 *   the supplied list"; value MUST be a `ReadonlyArray<unknown>`.
 *
 * The runtime `value` type is intentionally `unknown` — see {@link WhereConstraint}
 * JSDoc for the rationale.
 */
export type WhereOp =
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

/** Sort direction for `orderBy`. */
export type Direction = 'asc' | 'desc';

/**
 * Equality / range / set-membership constraint on an indexed field.
 *
 * `value` is typed `unknown` — NOT `Meta['read'][F]` — to avoid the
 * exponential blowup that arises from PathValue-style indexed-access
 * resolution on deep `Read` shapes (and to keep `Meta['read'] = unknown`
 * usable). Runtime callers should rely on {@link validateQuery} +
 * DB-side constraint enforcement rather than compile-time value typing.
 */
export interface WhereConstraint<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
> {
  readonly kind: 'where';
  readonly field: F;
  readonly op: WhereOp;
  readonly value: unknown;
}

/** Sort by an indexed field. */
export interface OrderByConstraint<
  Meta extends StorageMetadata,
  F extends Meta['indexed'],
> {
  readonly kind: 'orderBy';
  readonly field: F;
  readonly direction: Direction;
}

/** Cap the number of returned rows to `n`. */
export interface LimitConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'limit';
  readonly value: number;
}

/**
 * Cap the number of rows returned to the *last* `n` of the ordered set.
 *
 * Semantically requires at least one preceding `orderBy` clause; the
 * runtime validator does not enforce that pairing (matching `limit`
 * which also relies on caller discipline). The reference Postgres
 * `compileToSql` rejects this constraint — callers can express the
 * same intent by reversing the leading `orderBy` direction and using
 * `limit(n)`. See `compileToSql` JSDoc for the exact error.
 */
export interface LimitToLastConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'limitToLast';
  readonly value: number;
}

/**
 * Skip the first `n` rows of the ordered result set. Mirrors SQL
 * `OFFSET n` and is supported by the reference Postgres compiler.
 */
export interface OffsetConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'offset';
  readonly value: number;
}

/** Inclusive lower-bound cursor — `values` line up with prior `orderBy` clauses. */
export interface StartAtConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'startAt';
  readonly values: ReadonlyArray<unknown>;
}

/** Exclusive lower-bound cursor — `values` line up with prior `orderBy` clauses. */
export interface StartAfterConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'startAfter';
  readonly values: ReadonlyArray<unknown>;
}

/** Inclusive upper-bound cursor — `values` line up with prior `orderBy` clauses. */
export interface EndAtConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'endAt';
  readonly values: ReadonlyArray<unknown>;
}

/** Exclusive upper-bound cursor — `values` line up with prior `orderBy` clauses. */
export interface EndBeforeConstraint<_Meta extends StorageMetadata> {
  readonly kind: 'endBefore';
  readonly values: ReadonlyArray<unknown>;
}

/**
 * Discriminated union of every constraint a `Query<Meta>` may carry.
 *
 * The where/orderBy variants are kept generic over `F = Meta['indexed']`
 * (single type variable, no distribution) to prevent the union from
 * exploding into one branch per indexed-field literal — per SPEC-008
 * Pre-Build audit fix F-T-6.
 */
export type QueryConstraint<Meta extends StorageMetadata> =
  | WhereConstraint<Meta, Meta['indexed']>
  | OrderByConstraint<Meta, Meta['indexed']>
  | LimitConstraint<Meta>
  | LimitToLastConstraint<Meta>
  | OffsetConstraint<Meta>
  | StartAtConstraint<Meta>
  | StartAfterConstraint<Meta>
  | EndAtConstraint<Meta>
  | EndBeforeConstraint<Meta>;

/**
 * A list of constraints applied to a storage query, in declaration order.
 *
 * `Query<Meta>` is a `ReadonlyArray` so consumers cannot mutate a query
 * mid-flight. Compose with `[...]` spread or use the constraint factories
 * directly inside an array literal.
 */
export type Query<Meta extends StorageMetadata> = ReadonlyArray<
  QueryConstraint<Meta>
>;
