// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/pg-client/storage — additive adapter wiring `PgClient` (this
 * package's 3-method interface) to `IStorageProvider<Meta>` from
 * `@gertsai/storage-core`. Per ADR-005 Decision A + I-3, ADR-011 I-1/I-2:
 *
 * - This module is **additive**. The root `@gertsai/pg-client` surface
 *   (`PgClient`, `mockPgClient`) is unchanged.
 * - Capabilities: `{ listeners: false, transactions: true, batches: true }`.
 *   Postgres LISTEN/NOTIFY listener support deferred to a future enhancement.
 * - Listener methods throw `ListenersNotSupportedError` per ADR-005 I-4.
 * - Transactions wrap `BEGIN ... COMMIT;`. Serialization failures
 *   (SQLSTATE 40001) are mapped to `TransactionConflictError`.
 * - Batches are atomic: ops apply inside `BEGIN ... COMMIT;`, with `ROLLBACK`
 *   on any failure (Wave 12.B per EVID-044). Empty batches short-circuit.
 *
 * `compileToSql` from `@gertsai/query-dsl/sql` produces the WHERE/ORDER/LIMIT
 * fragment given a `Query<Meta>`. `TableMap` allows path → table-name overrides;
 * default is identity mapping (`path → path`). Invalid identifiers
 * (non-`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) throw at constructor.
 */

import type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageCapabilities,
  StorageMetadata,
} from '@gertsai/storage-core';
import {
  ListenersNotSupportedError,
  TransactionConflictError,
} from '@gertsai/storage-core';
import { compileToSql } from '@gertsai/query-dsl/sql';

import type { PgClient } from './index';

/**
 * Optional path → table-name overrides. Default: identity mapping.
 *
 * @example
 *   const provider = new PgStorageProvider({
 *     client,
 *     tableMap: { 'users': 'app_users', 'orgs/members': 'org_members' },
 *   });
 */
export interface TableMap {
  readonly [path: string]: string;
}

const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const POSTGRES_SERIALIZATION_FAILURE_SQLSTATE = '40001';
const POSTGRES_DEADLOCK_SQLSTATE = '40P01';

function assertSqlIdentifier(name: string, label: string): void {
  if (!SQL_IDENTIFIER_PATTERN.test(name)) {
    throw new Error(
      `[@gertsai/pg-client/storage] Invalid SQL identifier for ${label}: ${JSON.stringify(name)}. Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
}

/**
 * Resolve a logical path to a SQL table name. Default identity. Invalid
 * identifiers (path or override) throw immediately.
 */
function resolveTable(path: string, tableMap: TableMap | undefined): string {
  const override = tableMap?.[path];
  const name = override ?? path;
  assertSqlIdentifier(name, `path "${path}"`);
  return name;
}

/**
 * Tagged-template wrapper that turns a literal SQL string + values into the
 * `(strings, ...values)` shape `PgClient.$queryRaw` / `$executeRaw` expect.
 * Used internally by `PgStorageProvider` so we never construct unsafe
 * SQL at the call site.
 */
function rawQuery<T = unknown>(
  client: PgClient,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<T[]> {
  // Build TemplateStringsArray-shaped object from the (already-parameterized)
  // SQL fragment. We re-split on $1/$2/... markers so the underlying client
  // receives positional parameters (PgClient implementations rebuild their
  // own SQL from the strings + values).
  const parts = sql.split(/\$\d+/g);
  const template = Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
  return client.$queryRaw<T>(template, ...params);
}

function rawExecute(
  client: PgClient,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<number> {
  const parts = sql.split(/\$\d+/g);
  const template = Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
  return client.$executeRaw(template, ...params);
}

function isTransactionConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return (
    code === POSTGRES_SERIALIZATION_FAILURE_SQLSTATE ||
    code === POSTGRES_DEADLOCK_SQLSTATE
  );
}

interface BatchOp<Meta extends StorageMetadata> {
  readonly kind: 'set' | 'update' | 'delete';
  readonly table: string;
  readonly id: string;
  readonly data?: Meta['write'] | Partial<Meta['write']>;
}

/**
 * Postgres batch runner. Collects ops in memory; on `_apply()` runs them
 * inside an atomic `BEGIN ... COMMIT;` block via the provided client. If any
 * op fails the runner issues `ROLLBACK` and rethrows the original error, so
 * no partial state is committed (Wave 12.B fix per EVID-044). Empty batches
 * short-circuit without emitting BEGIN/COMMIT.
 *
 * `capabilities.batches: true` therefore honestly means "atomic batch": all
 * ops apply, or none do. Callers must NOT invoke `_apply` from inside an
 * already-open transaction — `PgStorageProvider.runTransaction` uses its own
 * `_flush` path; `_apply` is reserved for `runBatch`.
 */
export class PgBatchRunner<Meta extends StorageMetadata>
  implements IBatchRunner<Meta>
{
  private readonly _ops: Array<BatchOp<Meta>> = [];

  constructor(
    private readonly _client: PgClient,
    private readonly _resolveTable: (path: string) => string,
  ) {}

  set(path: string, id: string, data: Meta['write']): void {
    this._ops.push({ kind: 'set', table: this._resolveTable(path), id, data });
  }

  update(path: string, id: string, partial: Partial<Meta['write']>): void {
    this._ops.push({
      kind: 'update',
      table: this._resolveTable(path),
      id,
      data: partial,
    });
  }

  delete(path: string, id: string): void {
    this._ops.push({ kind: 'delete', table: this._resolveTable(path), id });
  }

  /**
   * Internal — invoked by `PgStorageProvider.runBatch` after the user's fn.
   * Atomic: wraps queued ops in `BEGIN ... COMMIT;`. On any op failure issues
   * `ROLLBACK` and rethrows; if `ROLLBACK` itself fails the inner error is
   * attached as `rollbackError` on the thrown error (additive, non-breaking).
   * Empty batches return immediately without emitting BEGIN/COMMIT.
   */
  async _apply(): Promise<void> {
    if (this._ops.length === 0) return;

    await rawExecute(this._client, 'BEGIN', []);
    try {
      for (const op of this._ops) {
        if (op.kind === 'set') {
          await rawExecute(
            this._client,
            `INSERT INTO ${op.table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
            [op.id, op.data],
          );
        } else if (op.kind === 'update') {
          await rawExecute(
            this._client,
            `UPDATE ${op.table} SET data = data || $2 WHERE id = $1`,
            [op.id, op.data],
          );
        } else {
          await rawExecute(this._client, `DELETE FROM ${op.table} WHERE id = $1`, [
            op.id,
          ]);
        }
      }
      await rawExecute(this._client, 'COMMIT', []);
    } catch (err) {
      try {
        await rawExecute(this._client, 'ROLLBACK', []);
      } catch (rollbackErr) {
        if (err && typeof err === 'object') {
          (err as { rollbackError?: unknown }).rollbackError = rollbackErr;
        }
      }
      throw err;
    }
  }
}

/**
 * Postgres transaction runner. Operates on the same client as the
 * surrounding transaction; performs read-then-write within `BEGIN; COMMIT;`.
 * Conflicting writes (SQLSTATE 40001) are mapped to
 * {@link TransactionConflictError} by `PgStorageProvider.runTransaction`.
 */
export class PgTransactionRunner<Meta extends StorageMetadata>
  implements ITransactionRunner<Meta>
{
  private readonly _ops: Array<BatchOp<Meta>> = [];

  constructor(
    private readonly _client: PgClient,
    private readonly _resolveTable: (path: string) => string,
  ) {}

  async get(path: string, id: string): Promise<Meta['read'] | null> {
    const rows = await rawQuery<{ data: Meta['read'] }>(
      this._client,
      `SELECT data FROM ${this._resolveTable(path)} WHERE id = $1 LIMIT 1`,
      [id],
    );
    const first = rows[0];
    return first ? first.data : null;
  }

  set(path: string, id: string, data: Meta['write']): void {
    this._ops.push({ kind: 'set', table: this._resolveTable(path), id, data });
  }

  update(path: string, id: string, partial: Partial<Meta['write']>): void {
    this._ops.push({
      kind: 'update',
      table: this._resolveTable(path),
      id,
      data: partial,
    });
  }

  delete(path: string, id: string): void {
    this._ops.push({ kind: 'delete', table: this._resolveTable(path), id });
  }

  /** Internal — flush queued writes inside the surrounding tx. */
  async _flush(): Promise<void> {
    for (const op of this._ops) {
      if (op.kind === 'set') {
        await rawExecute(
          this._client,
          `INSERT INTO ${op.table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
          [op.id, op.data],
        );
      } else if (op.kind === 'update') {
        await rawExecute(
          this._client,
          `UPDATE ${op.table} SET data = data || $2 WHERE id = $1`,
          [op.id, op.data],
        );
      } else {
        await rawExecute(this._client, `DELETE FROM ${op.table} WHERE id = $1`, [
          op.id,
        ]);
      }
    }
  }
}

/** Constructor options for {@link PgStorageProvider}. */
export interface PgStorageProviderOpts {
  readonly client: PgClient;
  readonly tableMap?: TableMap;
}

/**
 * Postgres-backed `IStorageProvider`. Wraps an existing `@gertsai/pg-client`
 * `PgClient` (any concrete impl — Prisma, postgres.js, raw `pg`, mockPgClient,
 * ...). Listener methods throw {@link ListenersNotSupportedError}; transaction
 * conflicts are mapped to {@link TransactionConflictError}.
 *
 * @example
 *   const client = new PrismaClient(); // or mockPgClient(...) for tests
 *   const provider = new PgStorageProvider<UserMeta>({ client });
 *   await provider.set('users', 'user-1', { name: 'Alice' });
 */
export class PgStorageProvider<Meta extends StorageMetadata>
  implements IStorageProvider<Meta>
{
  /**
   * Wave 6.5 / PRD-007 + Wave 7.2 audit-aware upsert.
   *
   * `set()` (above) uses a naive `ON CONFLICT DO UPDATE SET data =
   * EXCLUDED.data` — correct for `set()` semantics (overwrite).
   * `upsertDoc()` BELOW uses a surgical jsonb merge that strips
   * `creator_uuid` + `created_at` from the incoming EXCLUDED payload
   * before merging, so create-time audit is preserved across UPDATE.
   * That makes `preservesCreatorAudit: true` honest and lets
   * `BaseEntityStorageService.upsert()` use the 1-RTT fast path.
   */
  readonly capabilities = {
    listeners: false,
    transactions: true,
    batches: true,
    upsert: { supported: true, preservesCreatorAudit: true },
  } as const satisfies StorageCapabilities;

  private readonly _client: PgClient;
  private readonly _tableMap: TableMap | undefined;

  constructor(opts: PgStorageProviderOpts) {
    this._client = opts.client;
    this._tableMap = opts.tableMap;
    // Eagerly validate every override identifier — surface bad config at
    // construction time, not on first query.
    if (opts.tableMap) {
      for (const [path, table] of Object.entries(opts.tableMap)) {
        assertSqlIdentifier(table, `tableMap[${JSON.stringify(path)}]`);
      }
    }
  }

  private _table(path: string): string {
    return resolveTable(path, this._tableMap);
  }

  async set(path: string, id: string, data: Meta['write']): Promise<void> {
    await rawExecute(
      this._client,
      `INSERT INTO ${this._table(path)} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [id, data],
    );
  }

  /**
   * Wave 6.5 / PRD-007 + Wave 7.2 audit-aware native 1-RTT upsert.
   *
   * SQL contract:
   *
   * ```sql
   * INSERT INTO <table> (id, data) VALUES ($1, $2)
   * ON CONFLICT (id) DO UPDATE
   *   SET data = <table>.data || (EXCLUDED.data - 'creator_uuid' - 'created_at')
   * ```
   *
   * On INSERT: the row is created with the full incoming payload (incl.
   * `creator_uuid` + `created_at` stamped by the service via
   * `buildDataForSet`).
   *
   * On UPDATE: jsonb operator `-` strips `creator_uuid` and `created_at`
   * from the incoming EXCLUDED payload, then `||` merges the remaining
   * fields onto the existing row's jsonb. Result: existing row keeps its
   * original `creator_uuid` + `created_at`, while modify-time fields
   * (`last_modified_uuid`, `last_modified_at`) are overwritten by the
   * incoming values — exactly the audit semantic that the Sprint 3.5
   * 2-RTT `update()` path produces.
   *
   * One round-trip vs. the Sprint 3.5 `getDoc → update` two-RTT path,
   * audit-correct.
   *
   * Field names match the `@gertsai/entity-audit` convention. If the
   * convention changes, update both this method AND the matching
   * `InMemoryStorageProvider.upsertDoc`.
   */
  async upsertDoc(
    path: string,
    id: string,
    data: Meta['write'],
  ): Promise<{ id: string }> {
    const table = this._table(path);
    await rawExecute(
      this._client,
      `INSERT INTO ${table} (id, data) VALUES ($1, $2) ` +
        `ON CONFLICT (id) DO UPDATE SET ` +
        `data = ${table}.data || (EXCLUDED.data - 'creator_uuid' - 'created_at')`,
      [id, data],
    );
    return { id };
  }

  async getDoc(path: string, id: string): Promise<Meta['read'] | null> {
    const rows = await rawQuery<{ data: Meta['read'] }>(
      this._client,
      `SELECT data FROM ${this._table(path)} WHERE id = $1 LIMIT 1`,
      [id],
    );
    const first = rows[0];
    return first ? first.data : null;
  }

  async getDocs(path: string, query?: Query<Meta>): Promise<Meta['read'][]> {
    const table = this._table(path);
    if (!query || query.length === 0) {
      const rows = await rawQuery<{ data: Meta['read'] }>(
        this._client,
        `SELECT data FROM ${table}`,
        [],
      );
      return rows.map((r) => r.data);
    }
    // Adapter boundary cast: storage-core ships a loose `Query<Meta>` shape
    // (no forward dep on query-dsl); query-dsl's `compileToSql` expects its
    // strict `QueryConstraint` union. In practice consumers build queries
    // via query-dsl factories so the structural shape matches at runtime.
    // Justified single `as` per ADR-005 adapter-boundary policy.
    const compiled = compileToSql(query as never, table);
    const rows = await rawQuery<{ data: Meta['read'] }>(
      this._client,
      compiled.sql,
      compiled.params,
    );
    return rows.map((r) => r.data);
  }

  async count(path: string, query?: Query<Meta>): Promise<number> {
    const table = this._table(path);
    if (!query || query.length === 0) {
      const rows = await rawQuery<{ count: number | bigint | string }>(
        this._client,
        `SELECT COUNT(*)::bigint AS count FROM ${table}`,
        [],
      );
      const first = rows[0];
      return first ? Number(first.count) : 0;
    }
    // Adapter boundary cast: storage-core ships a loose `Query<Meta>` shape
    // (no forward dep on query-dsl); query-dsl's `compileToSql` expects its
    // strict `QueryConstraint` union. In practice consumers build queries
    // via query-dsl factories so the structural shape matches at runtime.
    // Justified single `as` per ADR-005 adapter-boundary policy.
    const compiled = compileToSql(query as never, table);
    // Wrap the SELECT data ... in a count subquery; preserves WHERE/limit.
    const wrapped = `SELECT COUNT(*)::bigint AS count FROM (${compiled.sql}) AS _q`;
    const rows = await rawQuery<{ count: number | bigint | string }>(
      this._client,
      wrapped,
      compiled.params,
    );
    const first = rows[0];
    return first ? Number(first.count) : 0;
  }

  async update(
    path: string,
    id: string,
    partial: Partial<Meta['write']>,
  ): Promise<void> {
    await rawExecute(
      this._client,
      `UPDATE ${this._table(path)} SET data = data || $2 WHERE id = $1`,
      [id, partial],
    );
  }

  async delete(path: string, id: string): Promise<void> {
    await rawExecute(
      this._client,
      `DELETE FROM ${this._table(path)} WHERE id = $1`,
      [id],
    );
  }

  async runBatch<R>(fn: (batch: IBatchRunner<Meta>) => Promise<R>): Promise<R> {
    const runner = new PgBatchRunner<Meta>(this._client, (p) => this._table(p));
    const result = await fn(runner);
    await runner._apply();
    return result;
  }

  async runTransaction<R>(
    fn: (tx: ITransactionRunner<Meta>) => Promise<R>,
  ): Promise<R> {
    await rawExecute(this._client, 'BEGIN', []);
    try {
      const runner = new PgTransactionRunner<Meta>(
        this._client,
        (p) => this._table(p),
      );
      const result = await fn(runner);
      await runner._flush();
      await rawExecute(this._client, 'COMMIT', []);
      return result;
    } catch (err) {
      // Best-effort rollback. Ignore errors from ROLLBACK itself; the original
      // error is the one we want to surface.
      try {
        await rawExecute(this._client, 'ROLLBACK', []);
      } catch {
        // swallow
      }
      if (isTransactionConflict(err)) {
        const cause = err instanceof Error ? err : undefined;
        const conflict = new TransactionConflictError(
          `Transaction conflict (SQLSTATE ${
            (err as { code?: string }).code ?? 'unknown'
          })`,
        );
        if (cause) {
          (conflict as Error & { cause?: unknown }).cause = cause;
        }
        throw conflict;
      }
      throw err;
    }
  }

  // F-A-1 / ADR-005 I-4: listener methods are non-optional in IStorageProvider;
  // adapters with capabilities.listeners=false MUST throw.
  onDocumentSnapshot(): () => void {
    throw new ListenersNotSupportedError(
      '[@gertsai/pg-client/storage] PgStorageProvider does not support listeners. Use a backend with capabilities.listeners=true (e.g. InMemoryStorageProvider) or an adapter that wires Postgres LISTEN/NOTIFY.',
    );
  }

  onCollectionSnapshot(): () => void {
    throw new ListenersNotSupportedError(
      '[@gertsai/pg-client/storage] PgStorageProvider does not support listeners. Use a backend with capabilities.listeners=true (e.g. InMemoryStorageProvider) or an adapter that wires Postgres LISTEN/NOTIFY.',
    );
  }
}
