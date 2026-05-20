// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Query DSL capability matrix — Wave 21 / EVID-076 CP-2 closure.
 *
 * Background. Prior to Wave 21 three packages each held their own
 * opinion about which `QueryConstraint` kinds they honoured:
 *
 *   | Constraint              | validateQuery | compileToSql | applyQueryFilter |
 *   |-------------------------|---------------|--------------|------------------|
 *   | where (all ops)         | yes           | yes          | yes              |
 *   | orderBy                 | yes           | yes          | yes              |
 *   | limit                   | yes           | yes          | yes              |
 *   | limitToLast             | yes           | THROWS       | silently ignored |
 *   | offset                  | yes           | yes          | silently ignored |
 *   | start/end cursors       | yes           | silently no-op | yes            |
 *
 * The mismatch meant the same `Query<Meta>` returned different rows
 * depending on which backend executed it. Tests passed against
 * `InMemoryStorageProvider` (the dominant test fixture) but the
 * production path through `PgStorageProvider` produced different
 * shapes — a silent test-fidelity regression.
 *
 * This module restores a single source of truth. Each storage backend
 * advertises its own {@link QueryCapabilities}; consumers route or
 * validate against the advertised set, and the in-memory + Pg
 * adapters export their canonical constants
 * ({@link IN_MEMORY_QUERY_CAPABILITIES} and {@link POSTGRES_QUERY_CAPABILITIES}).
 *
 * The capability matrix is intentionally **descriptive, not
 * prescriptive** — adapters honour the contract by implementation,
 * and consumers can pass the matrix to {@link validateQuery} to
 * surface unsupported constraints **before** dispatch. The validator
 * never silently downgrades; on a mismatch it throws.
 *
 * Wave 21 — H-ENT-3/4 + CP-2 (FR-X3 + FR-X4 + FR-X5) are wired
 * through this module: `IN_MEMORY_QUERY_CAPABILITIES` enables
 * `offset` + `limitToLast` (now implemented in `applyQueryFilter`);
 * `POSTGRES_QUERY_CAPABILITIES` keeps `limitToLast: false` and
 * `cursors: 'unsupported'` to honestly reflect the reference
 * `compileToSql` behaviour. Future backends that wire cursors
 * server-side may upgrade `cursors` to `'native'`.
 */

/**
 * Per-backend declaration of which optional `Query<Meta>` constraints
 * the runtime honours. Each flag answers a single yes/no question
 * about a constraint kind that callers must NOT assume universal
 * support for.
 *
 * Stability contract: this interface is part of the `@gertsai/query-dsl`
 * public surface. Adding a new field is an additive change; flipping
 * the meaning of an existing field is breaking. Adapters declare
 * their `QueryCapabilities` with `as const satisfies QueryCapabilities`
 * so consumers can branch at the type level on the literal values.
 *
 * @public
 */
export interface QueryCapabilities {
  /**
   * Whether `OFFSET n` semantics are honoured.
   *
   * - `true` — the backend skips the first `n` rows of the sorted
   *   result set before applying `limit` (matches SQL semantics).
   * - `false` — `offset` constraints in the query are an ERROR
   *   condition; {@link validateQuery} throws on encounter.
   */
  readonly offset: boolean;

  /**
   * Whether `limitToLast n` semantics are honoured.
   *
   * - `true` — the backend returns the trailing `n` rows of the
   *   sorted result.
   * - `false` — `limitToLast` constraints in the query are an ERROR
   *   condition; {@link validateQuery} throws on encounter. The
   *   reference Postgres compiler is in this category (it has no
   *   portable SQL emission for "last N" without materialising the
   *   full result client-side).
   */
  readonly limitToLast: boolean;

  /**
   * How the backend handles cursor constraints (`startAt`,
   * `startAfter`, `endAt`, `endBefore`).
   *
   * - `'native'` — the backend implements cursor semantics
   *   server-side (the in-memory evaluator falls under this banner
   *   since the "server" is the same process — see
   *   `applyQueryFilter`).
   * - `'emulated'` — cursors are translated to client-side post-filtering
   *   over a wider server-side fetch. Functionally equivalent for
   *   small result sets but wastes bandwidth for large windows.
   * - `'unsupported'` — cursor constraints in the query are an ERROR
   *   condition; {@link validateQuery} throws on encounter. The
   *   reference Postgres compiler is `'unsupported'` (it documents
   *   the limitation in its JSDoc and silently no-ops at the SQL
   *   level — Wave 21 surfaces that asymmetry at the type level).
   */
  readonly cursors: 'native' | 'emulated' | 'unsupported';
}

/**
 * Capability declaration for `applyQueryFilter` (the in-memory
 * evaluator used by `InMemoryStorageProvider`). All optional
 * constraints are honoured.
 *
 * Wave 21 / EVID-076 FR-X3 + FR-X4: `offset` + `limitToLast` were
 * silently ignored prior to Wave 21; they are now implemented and
 * advertised here as `true`.
 *
 * @public
 */
export const IN_MEMORY_QUERY_CAPABILITIES: QueryCapabilities = Object.freeze({
  offset: true,
  limitToLast: true,
  cursors: 'native',
});

/**
 * Capability declaration for the reference `compileToSql` Postgres
 * compiler. `offset` is honoured; `limitToLast` and cursors are NOT
 * (the compiler throws and silently no-ops respectively — see
 * `sql.ts` for the rationale).
 *
 * Future SQL backends with `LIMIT ... OFFSET` + window functions for
 * `limitToLast` should ship their own subpath constant
 * (`@gertsai/query-dsl/sql-mysql`, `@gertsai/query-dsl/sql-spanner`,
 * ...) rather than mutating this constant.
 *
 * @public
 */
export const POSTGRES_QUERY_CAPABILITIES: QueryCapabilities = Object.freeze({
  offset: true,
  limitToLast: false,
  cursors: 'unsupported',
});

/**
 * "All true" capability matrix — useful for tests, mocks, and
 * backends that explicitly opt every constraint in. Equivalent to
 * {@link IN_MEMORY_QUERY_CAPABILITIES} today; kept separate so
 * future divergence (e.g. an in-memory evaluator that drops support
 * for some constraint) does not bleed into consumer code.
 *
 * @public
 */
export const FULL_QUERY_CAPABILITIES: QueryCapabilities = Object.freeze({
  offset: true,
  limitToLast: true,
  cursors: 'native',
});

/**
 * "All false" capability matrix — useful as a tightening default for
 * adapters that want every optional constraint to be opt-in. The
 * `where` / `orderBy` / `limit` triple remains mandatory and is not
 * gated by capabilities (every adapter MUST support them — they're
 * the universal constraint set).
 *
 * @public
 */
export const MINIMAL_QUERY_CAPABILITIES: QueryCapabilities = Object.freeze({
  offset: false,
  limitToLast: false,
  cursors: 'unsupported',
});
