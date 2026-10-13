// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Safe-query policy — the port of Orchestra `buildSafeQuery`.
 *
 * Client-supplied `QueryConstraint`s are hostile input: an unrestricted
 * `where` lets a subscriber probe fields it has no business reading, and
 * an unbounded `limit` turns a typo into a full-table scan. Orchestra's
 * `buildSafeQuery` (sdk-admin/entityQueries) sanitises by whitelisting
 * operators, pinning the scope field, and capping `limit` — all before
 * the query ever reaches the provider.
 *
 * This module does the same over the structural `QueryConstraint` shape
 * from `@gertsai/query-dsl` (`validateQuery` already covers raw shape
 * and per-backend capabilities — this layer adds the *authorization*
 * checks the capability matrix deliberately does not own).
 */
import { validateQuery } from '@gertsai/query-dsl';
import type {
  Query,
  QueryConstraint,
  WhereOp,
} from '@gertsai/query-dsl';
import type { StorageMetadata } from '@gertsai/storage-core';

/**
 * Every `WhereOp` the DSL defines — the permissive default for
 * {@link SafeQueryPolicy.allowedOps}.
 */
export const ALL_WHERE_OPS: ReadonlySet<WhereOp> = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'not-in',
  'array-contains',
  'array-contains-any',
]);

/** Scalar comparison ops only — a sane default for untrusted input. */
export const SCALAR_WHERE_OPS: ReadonlySet<WhereOp> = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
]);

/**
 * Server-side policy applied to client-supplied constraints.
 *
 * All fields optional; an empty policy validates shape only (still
 * worth it — a malformed constraint throws here, not inside SQL
 * compilation).
 */
export interface SafeQueryPolicy {
  /**
   * Whitelist of permitted `where` operators. Constraints using any
   * other op are rejected (throw). Default: {@link ALL_WHERE_OPS}.
   */
  readonly allowedOps?: ReadonlySet<WhereOp>;
  /**
   * Whitelist of fields usable in `where`/`orderBy`. Constraints
   * touching any other field are rejected. Pinned fields (below) are
   * always permitted regardless of this list — they are server-owned.
   */
  readonly allowedFields?: ReadonlySet<string>;
  /**
   * Scope pins appended as `where field == value` AFTER validation —
   * the client cannot remove them (they are not part of its input)
   * and cannot contradict them safely: a conflicting pin simply
   * yields zero rows, never widened access. This is the
   * `space_uid`-pin equivalent from Orchestra.
   */
  readonly pinnedFields?: Readonly<Record<string, unknown>>;
  /**
   * Hard cap on `limit`. A client `limit` above the cap is clamped;
   * no client `limit` at all gets one injected. Default 1000
   * (Orchestra uses 2000; 1000 keeps the first page comfortably
   * under websocket frame pressure).
   */
  readonly maxLimit?: number;
}

/** Default cap when the policy does not name one. */
export const DEFAULT_MAX_LIMIT = 1000;

/** Structural alias — the policy layer is Meta-agnostic by design. */
type AnyConstraint = QueryConstraint<StorageMetadata>;

/**
 * Validate + constrain a client-supplied query against `policy`.
 *
 * Order matters:
 * 1. `validateQuery` — shape/op/arity (throws `TypeError` on garbage);
 * 2. policy whitelists — ops + fields (throws `TypeError` naming the
 *    rejected constraint index);
 * 3. limit clamp/inject (never throws — a too-big limit is a clamp,
 *    not an error);
 * 4. pinned fields appended last — server-owned, invisible to the
 *    client's own constraints.
 *
 * The returned array is a fresh list — caller input is never mutated.
 */
export function sanitizeConstraints(
  input: unknown,
  policy: SafeQueryPolicy = {},
): AnyConstraint[] {
  if (input === undefined || input === null) {
    return finalizeConstraints([], policy);
  }
  if (!Array.isArray(input)) {
    // `validateQuery` throws TypeError for non-arrays — same vocabulary
    // the DSL's own validator uses, so error handling stays uniform.
    validateQuery(input as Query<StorageMetadata>);
  }
  const constraints = [...(input as AnyConstraint[])];
  if (constraints.length > 0) {
    // An empty list is a legitimate "all rows in scope" — the DSL
    // validator rejects it, so validate only non-empty input.
    validateQuery(constraints as Query<StorageMetadata>);
  }

  const ops = policy.allowedOps ?? ALL_WHERE_OPS;
  for (const [i, c] of constraints.entries()) {
    if (c.kind === 'where') {
      if (!ops.has(c.op)) {
        throw new TypeError(
          `sanitizeConstraints[${i}]: where.op '${c.op}' is not allowed by policy`,
        );
      }
      checkField(policy, c.field, i);
    } else if (c.kind === 'orderBy') {
      checkField(policy, c.field, i);
    }
  }
  return finalizeConstraints(constraints, policy);
}

function checkField(
  policy: SafeQueryPolicy,
  field: unknown,
  index: number,
): void {
  const fields = policy.allowedFields;
  if (fields !== undefined && typeof field === 'string' && !fields.has(field)) {
    throw new TypeError(
      `sanitizeConstraints[${index}]: field '${field}' is not allowed by policy`,
    );
  }
}

function finalizeConstraints(
  constraints: AnyConstraint[],
  policy: SafeQueryPolicy,
): AnyConstraint[] {
  const out = [...constraints];
  const maxLimit = policy.maxLimit ?? DEFAULT_MAX_LIMIT;

  const limitIdx = out.findIndex((c) => c.kind === 'limit');
  if (limitIdx === -1) {
    out.push({ kind: 'limit', value: maxLimit });
  } else {
    const existing = out[limitIdx] as { kind: 'limit'; value: number };
    if (existing.value > maxLimit) {
      out[limitIdx] = { kind: 'limit', value: maxLimit };
    }
  }

  if (policy.pinnedFields !== undefined) {
    for (const [field, value] of Object.entries(policy.pinnedFields)) {
      out.push({ kind: 'where', field, op: '==', value });
    }
  }
  return out;
}
