// SPDX-License-Identifier: Apache-2.0

import type { StorageMetadata } from '@gertsai/storage-core';
import type { QueryCapabilities } from './capabilities';
import type { Query, QueryConstraint, WhereOp } from './types';

const ARRAY_OPS: ReadonlySet<WhereOp> = new Set([
  'in',
  'not-in',
  'array-contains-any',
]);

const SCALAR_OPS: ReadonlySet<WhereOp> = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'array-contains',
]);

const ALL_OPS: ReadonlySet<WhereOp> = new Set<WhereOp>([
  ...ARRAY_OPS,
  ...SCALAR_OPS,
]);

/**
 * Runtime sanity check for a {@link Query}. Catches the malformed inputs
 * that the type system intentionally lets through (per SPEC-008
 * F-T-1 — `value` is `unknown` so the type checker cannot enforce
 * scalar-vs-array operands).
 *
 * Throws `TypeError` on the first violation; otherwise returns silently.
 *
 * Validations (always-on):
 *  - the query is a non-empty `ReadonlyArray`;
 *  - every constraint has a known `kind`;
 *  - `where.field` is a non-empty string;
 *  - `where.op` is one of {@link WhereOp};
 *  - array-shaped operators (`in`, `not-in`, `array-contains-any`) are
 *    paired with an array `value`;
 *  - `limit.value` is a finite non-negative integer;
 *  - cursor constraints (`startAt`/`startAfter`/`endAt`/`endBefore`) carry
 *    a non-empty `values` array.
 *
 * Capability validation (Wave 21 / EVID-076 FR-X5 — opt-in via the
 * second argument). When `capabilities` is supplied the validator
 * also refuses constraints the target backend cannot honour:
 *  - `offset` requires `capabilities.offset === true`;
 *  - `limitToLast` requires `capabilities.limitToLast === true`;
 *  - cursors (`startAt`/`startAfter`/`endAt`/`endBefore`) require
 *    `capabilities.cursors !== 'unsupported'`.
 *
 * Omitting `capabilities` preserves the pre-Wave 21 behaviour (no
 * capability gating) for backwards compatibility — every existing
 * caller that does not pass the second argument keeps working.
 *
 * Note: this function does NOT enforce semantic rules (e.g. "limitToLast
 * requires orderBy") — those belong to a higher-level type-level validator
 * (`ValidQueryConstraints` in Orchestra) which is out of scope for v0.1.0.
 */
export function validateQuery<Meta extends StorageMetadata>(
  query: Query<Meta>,
  capabilities?: QueryCapabilities,
): void {
  if (!Array.isArray(query)) {
    throw new TypeError('validateQuery: query must be an array of constraints');
  }
  if (query.length === 0) {
    throw new TypeError('validateQuery: query must contain at least one constraint');
  }

  for (let i = 0; i < query.length; i++) {
    const c = query[i] as QueryConstraint<Meta> | undefined;
    if (c === undefined || c === null || typeof c !== 'object') {
      throw new TypeError(
        `validateQuery: constraint at index ${i} is not an object`,
      );
    }
    validateConstraint(c, i);
    if (capabilities) {
      validateCapability(c, i, capabilities);
    }
  }
}

function validateConstraint<Meta extends StorageMetadata>(
  c: QueryConstraint<Meta>,
  i: number,
): void {
  switch (c.kind) {
    case 'where': {
      if (typeof c.field !== 'string' || c.field.length === 0) {
        throw new TypeError(
          `validateQuery[${i}]: where.field must be a non-empty string`,
        );
      }
      if (!ALL_OPS.has(c.op)) {
        throw new TypeError(
          `validateQuery[${i}]: where.op '${String(c.op)}' is not a known WhereOp`,
        );
      }
      if (ARRAY_OPS.has(c.op) && !Array.isArray(c.value)) {
        throw new TypeError(
          `validateQuery[${i}]: where.op '${c.op}' requires an array value`,
        );
      }
      return;
    }
    case 'orderBy': {
      if (typeof c.field !== 'string' || c.field.length === 0) {
        throw new TypeError(
          `validateQuery[${i}]: orderBy.field must be a non-empty string`,
        );
      }
      if (c.direction !== 'asc' && c.direction !== 'desc') {
        throw new TypeError(
          `validateQuery[${i}]: orderBy.direction must be 'asc' or 'desc'`,
        );
      }
      return;
    }
    case 'limit':
    case 'limitToLast':
    case 'offset': {
      if (
        typeof c.value !== 'number' ||
        !Number.isFinite(c.value) ||
        !Number.isInteger(c.value) ||
        c.value < 0
      ) {
        throw new TypeError(
          `validateQuery[${i}]: ${c.kind}.value must be a finite non-negative integer`,
        );
      }
      return;
    }
    case 'startAt':
    case 'startAfter':
    case 'endAt':
    case 'endBefore': {
      if (!Array.isArray(c.values) || c.values.length === 0) {
        throw new TypeError(
          `validateQuery[${i}]: ${c.kind}.values must be a non-empty array`,
        );
      }
      return;
    }
    default: {
      // Exhaustiveness — `c` should be `never` here.
      const exhaustive: never = c;
      throw new TypeError(
        `validateQuery[${i}]: unknown constraint kind ${String(
          (exhaustive as { kind?: string }).kind,
        )}`,
      );
    }
  }
}

/**
 * Wave 21 / EVID-076 FR-X5 — capability gate. Runs alongside the
 * shape-only {@link validateConstraint} when the caller passes a
 * {@link QueryCapabilities} matrix. Throws `TypeError` with a
 * descriptive message naming the constraint kind + missing capability
 * so callers can either downgrade their query or pick a different
 * backend.
 *
 * Mandatory constraints (`where` / `orderBy` / `limit`) are NOT gated —
 * every storage adapter is required to honour them. Only the optional
 * extensions are validated against the matrix.
 */
function validateCapability<Meta extends StorageMetadata>(
  c: QueryConstraint<Meta>,
  i: number,
  capabilities: QueryCapabilities,
): void {
  switch (c.kind) {
    case 'offset': {
      if (!capabilities.offset) {
        throw new TypeError(
          `validateQuery[${i}]: 'offset' constraint is not supported by the target backend (capabilities.offset === false)`,
        );
      }
      return;
    }
    case 'limitToLast': {
      if (!capabilities.limitToLast) {
        throw new TypeError(
          `validateQuery[${i}]: 'limitToLast' constraint is not supported by the target backend (capabilities.limitToLast === false)`,
        );
      }
      return;
    }
    case 'startAt':
    case 'startAfter':
    case 'endAt':
    case 'endBefore': {
      if (capabilities.cursors === 'unsupported') {
        throw new TypeError(
          `validateQuery[${i}]: '${c.kind}' cursor constraint is not supported by the target backend (capabilities.cursors === 'unsupported')`,
        );
      }
      return;
    }
    case 'where':
    case 'orderBy':
    case 'limit':
      // Universal — every adapter MUST honour these.
      return;
    default: {
      // Exhaustiveness — `c` should be `never` here.
      const exhaustive: never = c;
      void exhaustive;
      return;
    }
  }
}
