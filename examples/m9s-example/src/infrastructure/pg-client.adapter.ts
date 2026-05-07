// SPDX-License-Identifier: Apache-2.0
/**
 * PgClientAdapter — thin pg@^8.13 wrapper conforming to
 * `@gertsai/pg-client.PgClient` interface (Sprint 3.11 Amendment 2 §A2.6
 * LOCKED).
 *
 * The PgClient interface is Prisma-shaped (`$queryRaw` / `$executeRaw`
 * tagged-template) so consumers can swap concrete drivers without touching
 * call sites. This adapter rebuilds the SQL string into `$1, $2, ...`
 * positional placeholders and forwards values as the params array — which
 * is exactly what node-postgres expects.
 *
 * NOT Prisma. NOT postgres@3. node-postgres (`pg`) is the de-facto Node
 * Postgres driver and the easiest to reason about for an example.
 */
import { Pool, type PoolConfig } from 'pg';

import type { PgClient } from '@gertsai/pg-client';

export interface PgClientAdapterOptions {
  /** Postgres connection string, e.g. `postgres://user:pw@host:5432/db`. */
  readonly connectionString: string;
  /** Optional pool tuning. Forwarded to `pg.Pool`. */
  readonly poolOpts?: Omit<PoolConfig, 'connectionString'>;
}

/**
 * Build SQL with `$1, $2, ...` placeholders from a tagged template.
 *
 * Mirrors how `mockPgClient` in `@gertsai/pg-client` reconstructs SQL —
 * keeps recorded SQL shape consistent across mock + real adapters.
 */
function rebuildSql(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce<string>(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
    '',
  );
}

export class PgClientAdapter implements PgClient {
  readonly pool: Pool;

  constructor(opts: PgClientAdapterOptions) {
    this.pool = new Pool({ connectionString: opts.connectionString, ...opts.poolOpts });
  }

  async $queryRaw<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    const text = rebuildSql(strings, values);
    const res = await this.pool.query(text, values as unknown[]);
    return res.rows as T[];
  }

  async $executeRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number> {
    const text = rebuildSql(strings, values);
    const res = await this.pool.query(text, values as unknown[]);
    return res.rowCount ?? 0;
  }

  async $disconnect(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Factory — kept separate so tests can swap in `mockPgClient` without
 * importing `pg` at all.
 */
export function createPgClient(opts: PgClientAdapterOptions): PgClient {
  return new PgClientAdapter(opts);
}
