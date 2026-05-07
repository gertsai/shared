// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/pg-client — agnostic PostgreSQL client interface.
 *
 * Defines a minimal 3-method `PgClient` shape that any concrete client
 * (Prisma, Drizzle, raw `pg`, postgres.js, etc.) can satisfy. Consumers of
 * `@gertsai/*` packages depend on this interface, not on a specific ORM.
 *
 * Per ADR-004 I-3 + ADR-011 I-1/I-2: this package has ZERO dependencies on
 * any specific Postgres driver/ORM. Adapter to a concrete client is user
 * responsibility.
 */

/**
 * Minimal PostgreSQL client surface. Tagged template literal style for SQL
 * (matches Prisma's `$queryRaw` / `$executeRaw` shape — but other clients can
 * provide the same surface).
 */
export interface PgClient {
  /** Run a SELECT-style query; returns rows. */
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  /** Run a write query; returns affected row count. */
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  /** Release any pooled connections. */
  $disconnect(): Promise<void>;
}

/** Type-narrowing helper — `PgClientLike<T>` resolves to `T` if it implements `PgClient`. */
export type PgClientLike<T> = T extends PgClient ? T : never;

/** A single query recorded by {@link MockPgClient}. */
export interface RecordedQuery {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
  readonly kind: 'query' | 'execute';
}

/** Options accepted by {@link mockPgClient}. */
export interface MockPgClientOpts {
  /** Map of regex → result rows for $queryRaw. First matching pattern wins. */
  readonly queryResults?: ReadonlyArray<{ readonly pattern: RegExp; readonly result: unknown[] }>;
  /** Map of regex → affected count for $executeRaw. First matching pattern wins. */
  readonly executeResults?: ReadonlyArray<{ readonly pattern: RegExp; readonly result: number }>;
  /** Default rows when no queryResults pattern matches. Defaults to []. */
  readonly defaultQueryResult?: unknown[];
  /** Default count when no executeResults pattern matches. Defaults to 0. */
  readonly defaultExecuteResult?: number;
}

/** Test fixture client returned by {@link mockPgClient}. */
export interface MockPgClient extends PgClient {
  readonly recorded: ReadonlyArray<RecordedQuery>;
  reset(): void;
}

function rebuildSql(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce<string>(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
    '',
  );
}

/**
 * Test fixture factory — returns an in-memory PgClient that records all
 * queries and returns canned results based on regex matching. Useful for
 * unit/integration tests of consumers that depend on PgClient.
 *
 * @example
 *   const db = mockPgClient({
 *     queryResults: [{ pattern: /FROM users/i, result: [{ id: 1 }] }],
 *   });
 *   const rows = await db.$queryRaw`SELECT * FROM users WHERE id = ${1}`;
 *   // rows === [{ id: 1 }]
 *   // db.recorded[0] === { sql: 'SELECT * FROM users WHERE id = $1', params: [1], kind: 'query' }
 */
export function mockPgClient(opts: MockPgClientOpts = {}): MockPgClient {
  const recorded: RecordedQuery[] = [];
  const queryResults = opts.queryResults ?? [];
  const executeResults = opts.executeResults ?? [];
  const defaultQuery = opts.defaultQueryResult ?? [];
  const defaultExecute = opts.defaultExecuteResult ?? 0;

  return {
    get recorded() {
      return recorded.slice();
    },
    reset() {
      recorded.length = 0;
    },
    $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
      const sql = rebuildSql(strings, values);
      recorded.push({ sql, params: values, kind: 'query' });
      const match = queryResults.find((r) => r.pattern.test(sql));
      return Promise.resolve((match ? match.result : defaultQuery) as T[]);
    },
    $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
      const sql = rebuildSql(strings, values);
      recorded.push({ sql, params: values, kind: 'execute' });
      const match = executeResults.find((r) => r.pattern.test(sql));
      return Promise.resolve(match ? match.result : defaultExecute);
    },
    async $disconnect(): Promise<void> {
      // No-op for mocks.
    },
  };
}
