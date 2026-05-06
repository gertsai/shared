// SPDX-License-Identifier: Apache-2.0
//
// Reference SQL compiler — DIALECT = POSTGRES.
// =============================================
//
// `compileToSql` translates a `Query<Meta>` into a parameterised
// `SELECT ... FROM <table>` string suitable for execution against
// PostgreSQL via a `pg`-compatible driver. The output is intentionally
// Postgres-flavoured:
//
//   * Parameter placeholders use the `$1`, `$2`, ... style (NOT `?`).
//   * Inequality is rendered as `<>` (not `!=`) to match canonical
//     Postgres SQL — both are accepted by the server, but `<>` is what
//     `EXPLAIN` and tooling consistently emit.
//   * `array-contains` / `array-contains-any` are rendered with the
//     jsonb `@>` containment operator. Callers persisting array-typed
//     fields with the native `text[]` / `int[]` types should layer their
//     own compiler — this reference compiler targets the schema produced
//     by the v0.1 PgStorageProvider, which stores variant payloads as
//     `jsonb`.
//
// The compiler is intentionally NOT generic across SQL dialects. A future
// MySQL / SQLite / SQLServer backend should ship its own subpath
// compiler (`@gertsai/query-dsl/sql-mysql`, etc.) rather than
// retrofitting parameter-style switches into this one.
//
// SERIALIZABLE-isolation note: callers wrapping the compiled SQL inside
// a `BEGIN ISOLATION LEVEL SERIALIZABLE` transaction must be ready to
// retry on `40001 serialization_failure` — the compiler itself emits no
// transaction control statements.

import type { StorageMetadata } from '@gertsai/storage-core';
import { validateQuery } from './validate';
import type { Query, QueryConstraint, WhereOp } from './types';

/** Quoted-string SQL identifier matcher — same charset Postgres allows for unquoted identifiers. */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Output of {@link compileToSql}: a single parameterised SELECT plus the
 * positional `params` array that lines up with `$1`, `$2`, ...
 */
export interface CompiledSql {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
}

/**
 * Compile a `Query<Meta>` into Postgres-flavoured SQL.
 *
 * @param query - the query to compile; runs through {@link validateQuery}
 *                first, so an empty / malformed query throws.
 * @param table - destination table name; MUST match `^[A-Za-z_][A-Za-z0-9_]*$`,
 *                otherwise a `TypeError` is thrown to prevent SQL injection
 *                (table names are not parameterisable in standard SQL).
 *
 * @returns `{ sql, params }` — `sql` always begins with `SELECT * FROM <table>`
 *          and contains placeholders `$1..$N`; `params` is a fresh array
 *          whose length matches `N`.
 */
export function compileToSql<Meta extends StorageMetadata>(
  query: Query<Meta>,
  table: string,
): CompiledSql {
  if (typeof table !== 'string' || !IDENT_RE.test(table)) {
    throw new TypeError(
      `compileToSql: table name '${String(table)}' is not a valid SQL identifier`,
    );
  }
  validateQuery(query);

  const params: unknown[] = [];
  const whereClauses: string[] = [];
  const orderClauses: string[] = [];
  let limitClause: string | null = null;

  for (const constraint of query) {
    compileConstraint(constraint, params, whereClauses, orderClauses, (l) => {
      limitClause = l;
    });
  }

  let sql = `SELECT * FROM ${table}`;
  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  if (orderClauses.length > 0) {
    sql += ` ORDER BY ${orderClauses.join(', ')}`;
  }
  if (limitClause !== null) {
    sql += ` ${limitClause}`;
  }
  return { sql, params };
}

function compileConstraint<Meta extends StorageMetadata>(
  c: QueryConstraint<Meta>,
  params: unknown[],
  whereClauses: string[],
  orderClauses: string[],
  setLimit: (clause: string) => void,
): void {
  switch (c.kind) {
    case 'where': {
      whereClauses.push(compileWhere(c.field, c.op, c.value, params));
      return;
    }
    case 'orderBy': {
      orderClauses.push(
        `${quoteIdent(c.field)} ${c.direction === 'desc' ? 'DESC' : 'ASC'}`,
      );
      return;
    }
    case 'limit': {
      const idx = pushParam(params, c.value);
      setLimit(`LIMIT $${idx}`);
      return;
    }
    case 'startAt':
    case 'startAfter':
    case 'endAt':
    case 'endBefore': {
      // Cursor semantics depend on the orderBy clauses preceding them and
      // are difficult to express portably without lexicographic
      // comparisons. The reference compiler intentionally treats them as
      // a no-op so callers fall back to client-side slicing for v0.1.0.
      // Documented as a limitation in README §SQL compiler.
      return;
    }
    default: {
      const exhaustive: never = c;
      throw new TypeError(
        `compileToSql: unknown constraint kind ${String(
          (exhaustive as { kind?: string }).kind,
        )}`,
      );
    }
  }
}

function compileWhere(
  field: string,
  op: WhereOp,
  value: unknown,
  params: unknown[],
): string {
  const col = quoteIdent(field);
  switch (op) {
    case '==': {
      const idx = pushParam(params, value);
      return `${col} = $${idx}`;
    }
    case '!=': {
      const idx = pushParam(params, value);
      return `${col} <> $${idx}`;
    }
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const idx = pushParam(params, value);
      return `${col} ${op} $${idx}`;
    }
    case 'in': {
      const placeholders = expandArrayParam(params, value, op);
      return `${col} IN (${placeholders.join(', ')})`;
    }
    case 'not-in': {
      const placeholders = expandArrayParam(params, value, op);
      return `${col} NOT IN (${placeholders.join(', ')})`;
    }
    case 'array-contains': {
      // jsonb containment: column must contain the singleton array
      // `[value]`. Stringify is delegated to the driver via $N parameters.
      const idx = pushParam(params, JSON.stringify([value]));
      return `${col} @> $${idx}::jsonb`;
    }
    case 'array-contains-any': {
      const idx = pushParam(params, JSON.stringify(value));
      return `${col} ?| (SELECT array_agg(value::text) FROM jsonb_array_elements($${idx}::jsonb))`;
    }
    default: {
      const exhaustive: never = op;
      throw new TypeError(
        `compileToSql: unknown WhereOp ${String(exhaustive)}`,
      );
    }
  }
}

function pushParam(params: unknown[], value: unknown): number {
  params.push(value);
  return params.length;
}

function expandArrayParam(
  params: unknown[],
  value: unknown,
  op: WhereOp,
): string[] {
  if (!Array.isArray(value)) {
    // Caller path was already validateQuery'd, but TS can't see that.
    throw new TypeError(`compileToSql: '${op}' expects an array value`);
  }
  if (value.length === 0) {
    throw new TypeError(`compileToSql: '${op}' array must be non-empty`);
  }
  const placeholders: string[] = [];
  for (const v of value) {
    const idx = pushParam(params, v);
    placeholders.push(`$${idx}`);
  }
  return placeholders;
}

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new TypeError(
      `compileToSql: column name '${name}' is not a valid SQL identifier`,
    );
  }
  return name;
}
