// SPDX-License-Identifier: Apache-2.0
/**
 * PgDocumentRepository — `IDocumentStore` implementation backed by Postgres
 * via `PgClient` raw SQL (Sprint 3.11 W-3-11-4).
 *
 * NOT `PgStorageProvider` (Sprint 3.5 W-4B-4). That adapter targets a
 * jsonb-blob `(id uuid, data jsonb)` shape and does NOT fit the normalised
 * schema documented in `migrations/001_init_documents_chunks.up.sql`
 * (`tenant_id`, `owner_uuid`, `vector(768)` columns) — see ADR-011 Decision
 * A revised by Amendment 2 §A2.5. We use `PgClient` directly here as a
 * teaching moment: real production schemas lean on column-level constraints
 * + indexes that a jsonb envelope would obscure.
 *
 * Authorisation side-effect — Amendment 2 §A2.3 (per-document tuple write):
 * after every successful INSERT (i.e. NOT on update of an existing row) we
 * write the OpenFGA tuple `(document:<id>, tenant, tenant:<tenantId>)` via
 * `@gertsai/auth-openfga.writeTuples`. The tuple is the production-grade
 * counterpart to the rejected `document:*` wildcard (per Amendment 2 §A2.3).
 * The import is lazy so a missing OpenFGA store cannot crash the data path
 * when `AUTH_GATE=allow-all` is in use; failures are logged and swallowed
 * (auth-gate denies access on missing tuples — eventual-correct, fail-closed).
 */
import { randomUUID } from 'node:crypto';

import type { PgClient } from '@gertsai/pg-client';
// Wave 37.A (PRD-071 — query-dsl) — typed builders for SELECT-by-id paths;
// see compileToSql call sites below. UPDATE/INSERT/aggregate/projection
// queries remain raw SQL per FR-A3 escape hatch (compileToSql v0.1 emits
// only `SELECT * FROM <t>`).
import { defineQueryConstraints } from '@gertsai/query-dsl';
import { compileToSql } from '@gertsai/query-dsl/sql';
import type { StorageMetadata } from '@gertsai/storage-core';
import type { TenantId } from '@gertsai/tenant';

import type { Document } from '../domain/document';
import type {
  DocumentSummary,
  IDocumentQuery,
  IDocumentStore,
  ISoftDeletableDocumentStore,
  ListDocumentsOpts,
} from '../domain/ports/IDocumentStore';

import { PgSoftDeleteNotSupportedError } from '../shared/errors';

import type { DocumentRow } from './document.meta';

// Wave 37.A (PRD-071 — query-dsl) — minimal `StorageMetadata` shape used by
// the typed builders below. `indexed` enumerates the columns the SELECT-by-id
// paths filter on. `read`/`write` are `unknown` because the type system only
// validates the indexed-field literal at the constraint call site (per
// query-dsl design note "value is `unknown` to avoid PathValue blowup").
type DocumentQueryMeta = StorageMetadata<
  unknown,
  unknown,
  'id' | 'tenant_id' | 'deleted_at'
>;

export interface PgDocumentRepositoryOptions {
  /** PgClient instance — typically `PgClientAdapter` in production. */
  readonly client: PgClient;
  /**
   * Tenant id used when persisting documents. m9s-example demos a single
   * tenant per process; a production deployment would scope this per
   * request via `@gertsai/runtime-context` (see TODO at composition root).
   *
   * Wave 37.B (PRD-071 — tenant brand) — TenantId enforces tenant resolution
   * at compile time; plain `string` is rejected so callers must route through
   * `asTenantId` / `getTenantIdStrict` at the composition boundary.
   */
  readonly tenantId: TenantId;
  /**
   * Owner uuid used when persisting documents. Same per-process caveat as
   * `tenantId` applies.
   */
  readonly ownerUuid: string;
  /**
   * Toggle the per-document OpenFGA tuple write at INSERT time. Defaults
   * to `true`. Tests + memory-mode runs flip this off to avoid hitting an
   * unconfigured FGA store.
   */
  readonly writeFgaTuples?: boolean;
  /** Optional logger. Defaults to `console`. */
  readonly logger?: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export class PgDocumentRepository implements IDocumentStore, IDocumentQuery, ISoftDeletableDocumentStore {
  private readonly client: PgClient;
  private readonly tenantId: TenantId;
  private readonly ownerUuid: string;
  private readonly writeFgaTuples: boolean;
  private readonly logger: NonNullable<PgDocumentRepositoryOptions['logger']>;

  constructor(opts: PgDocumentRepositoryOptions) {
    this.client = opts.client;
    this.tenantId = opts.tenantId;
    this.ownerUuid = opts.ownerUuid;
    this.writeFgaTuples = opts.writeFgaTuples ?? true;
    this.logger = opts.logger ?? console;
  }

  async save(doc: Document): Promise<void> {
    const id = coerceUuid(doc.id);
    const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
    const metadataJson = JSON.stringify(metadata);

    // Wave 37.A (PRD-071 — query-dsl) — migrated from raw SQL line 84-86.
    // Pure SELECT-by-id with tenant filter — fits compileToSql's `SELECT * FROM <t>`
    // emission perfectly. tenant_id WHERE filter preserved (security invariant FR-A4).
    const existingQuery = [
      q.where('id', '==', id),
      q.where('tenant_id', '==', this.tenantId),
      q.limit(1),
    ] as const;
    const existingCompiled = compileToSql(existingQuery, 'documents');
    const existing = await rawQuery<{ id: string }>(
      this.client,
      existingCompiled.sql,
      existingCompiled.params,
    );

    if (existing.length > 0) {
      // Wave 37.A (PRD-071 — query-dsl) — UPDATE not supported by compileToSql v0.1
      // (emits only `SELECT * FROM <t>`); kept as raw SQL per FR-A3 escape hatch.
      // tenant_id WHERE filter preserved (security invariant FR-A4).
      await this.client.$executeRaw`
        UPDATE documents
           SET text = ${doc.text},
               metadata = ${metadataJson}::jsonb,
               updated_at = now()
         WHERE id = ${id} AND tenant_id = ${this.tenantId}
      `;
      return;
    }

    // Wave 37.A (PRD-071 — query-dsl) — INSERT not supported by compileToSql v0.1
    // (emits only `SELECT * FROM <t>`); kept as raw SQL per FR-A3 escape hatch.
    // tenant_id column written explicitly (security invariant FR-A4).
    await this.client.$executeRaw`
      INSERT INTO documents (id, tenant_id, owner_uuid, text, metadata)
      VALUES (${id}, ${this.tenantId}, ${this.ownerUuid}, ${doc.text}, ${metadataJson}::jsonb)
    `;

    if (this.writeFgaTuples) {
      await this.tryWriteTenantTuple(id);
    }
  }

  async findById(id: string): Promise<Document | null> {
    // Wave 10.E (PRD-022): exclude soft-deleted rows so callers honor the
    // soft-delete contract — a tombstoned doc is invisible to read paths
    // (matching the in-memory adapter's `status === 'deleted'` filter).
    //
    // Wave 37.A (PRD-071 — query-dsl) — migrated from raw SQL line 113-120.
    // Equality + LIMIT compose cleanly; the `deleted_at IS NULL` predicate
    // is the only piece the DSL cannot model (no IS-NULL operator), so we
    // splice the fragment after compileToSql via safe SQL string `.replace()`
    // — compileToSql guarantees `$N`-only placeholders and the fragment
    // carries no user input. tenant_id WHERE filter preserved (security
    // invariant FR-A4).
    const findQuery = [
      q.where('id', '==', coerceUuid(id)),
      q.where('tenant_id', '==', this.tenantId),
      q.limit(1),
    ] as const;
    const findCompiled = compileToSql(findQuery, 'documents');
    // Wave 37.A (PRD-071 — query-dsl FR-A3 follow-up, code-reviewer T4-A1 #1) —
    // fail-loud guard: the `.replace()` below is a no-op if compileToSql emits
    // no `LIMIT` clause, which would silently bypass the soft-delete tombstone
    // filter and return deleted rows. Future maintenance that drops
    // `q.limit(1)` from `findQuery` must restore it before this splice can
    // run; the assertion catches that regression at runtime instead of
    // shipping a soft-delete bypass.
    if (!findCompiled.sql.includes(' LIMIT ')) {
      throw new Error(
        'pg-document.repository.ts:findById: compileToSql output missing LIMIT clause; ' +
          'tombstone splice would silently no-op. Restore q.limit(1) in findQuery.',
      );
    }
    const findSqlWithTombstone = findCompiled.sql.replace(
      ' LIMIT ',
      ' AND deleted_at IS NULL LIMIT ',
    );
    // SELECT * returns all DocumentRow columns; cast is documented at the
    // query-dsl boundary (`SELECT *` semantics — see README §SQL compiler).
    const rows = await rawQuery<DocumentRow>(
      this.client,
      findSqlWithTombstone,
      findCompiled.params,
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    const rowMetadata = row.metadata as Document['metadata'];
    return {
      id: row.id,
      text: row.text,
      ...(rowMetadata !== undefined && { metadata: rowMetadata }),
    };
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — paginated list, newest first.
   * Tenant-scoped via the constructor-supplied `tenantId`. Bytes column
   * comes from `octet_length(text)` so the UI sees the on-disk size
   * (UTF-8) without re-reading the body.
   */
  async listSummaries(opts: ListDocumentsOpts = {}): Promise<readonly DocumentSummary[]> {
    const skip = Math.max(0, opts.skip ?? 0);
    const requested = opts.limit ?? 20;
    const limit = Math.min(100, Math.max(1, requested));

    // Wave 10.E (PRD-022): filter tombstones; uses the partial index
    // `idx_documents_active` added in migration 002.
    //
    // Wave 37.A (PRD-071 — query-dsl) — expression-list (LEFT/octet_length)
    // + aliases not supported by compileToSql v0.1 (always emits `SELECT *`);
    // kept as raw SQL per FR-A3 escape hatch. tenant_id WHERE filter
    // preserved (security invariant FR-A4).
    const rows = await this.client.$queryRaw<{
      id: string;
      preview: string;
      bytes: number;
      created_at: Date;
    }>`
      SELECT id,
             LEFT(text, 200)         AS preview,
             octet_length(text)::int AS bytes,
             created_at
        FROM documents
       WHERE tenant_id = ${this.tenantId}
         AND deleted_at IS NULL
       ORDER BY created_at DESC, id ASC
       LIMIT ${limit} OFFSET ${skip}
    `;
    return rows.map((row) => ({
      id: row.id,
      preview: row.preview,
      bytes: Number(row.bytes),
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — total count (tenant-scoped). Pg returns
   * `count(*)` as a bigint; we coerce to JS number which is safe for the
   * demo cardinality (< 2^53 rows is generous).
   */
  async count(): Promise<number> {
    // Wave 10.E (PRD-022): tombstones excluded so list + count stay in sync.
    //
    // Wave 37.A (PRD-071 — query-dsl) — COUNT aggregate not supported by
    // compileToSql v0.1 (always emits `SELECT *`); kept as raw SQL per FR-A3
    // escape hatch. tenant_id WHERE filter preserved (security invariant FR-A4).
    const rows = await this.client.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text AS count
        FROM documents
       WHERE tenant_id = ${this.tenantId}
         AND deleted_at IS NULL
    `;
    const raw = rows[0]?.count ?? '0';
    return Number(raw);
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — soft-delete.
   *
   * Wave 10.E (PRD-022): now honors the soft-delete contract via the
   * `deleted_at TIMESTAMPTZ NULL` column added in migration 002. Tombstones
   * stay queryable for an admin "restore" path (out of scope here) and for
   * audit trails. Idempotent: re-deleting an already-tombstoned row is a
   * no-op; missing ids match zero rows.
   *
   * If the migration has NOT been applied (deleted_at column missing), the
   * UPDATE throws a PostgreSQL error which we translate to the same
   * PgSoftDeleteNotSupportedError the action layer maps to HTTP 501 — keeps
   * fail-loud Liskov discipline for un-migrated deployments.
   */
  async softDelete(id: string): Promise<void> {
    try {
      // Wave 37.A (PRD-071 — query-dsl) — UPDATE not supported by compileToSql
      // v0.1 (emits only `SELECT * FROM <t>`); kept as raw SQL per FR-A3 escape
      // hatch. tenant_id WHERE filter preserved (security invariant FR-A4).
      await this.client.$executeRaw`
        UPDATE documents
           SET deleted_at = now()
         WHERE id = ${coerceUuid(id)}
           AND tenant_id = ${this.tenantId}
           AND deleted_at IS NULL
      `;
    } catch (err) {
      // PostgreSQL error 42703 (undefined_column) signals the migration is
      // missing. Surface as the typed error so action → HTTP 501 mapping
      // stays correct rather than leaking a raw pg error string.
      const msg = (err as Error).message ?? '';
      if (msg.includes('deleted_at') || msg.includes('42703')) {
        throw new PgSoftDeleteNotSupportedError(
          'PgDocumentRepository.softDelete failed: deleted_at column is ' +
            'missing. Apply migration 002_add_documents_deleted_at.up.sql.',
        );
      }
      throw err;
    }
  }

  /**
   * Per-document tuple write (Amendment 2 §A2.3). Lazy-imports
   * `@gertsai/auth-openfga` so a memory-mode boot without an FGA store
   * does not pull the package's runtime dependencies into the hot path.
   *
   * Errors are logged and swallowed: the gate is fail-closed by design
   * (missing tuple → DENIED), so a transient FGA outage during INSERT
   * surfaces later as a denied search rather than a corrupt data path.
   */
  private async tryWriteTenantTuple(documentId: string): Promise<void> {
    try {
      const mod = await import('@gertsai/auth-openfga');
      await mod.writeTuples([
        {
          user: `tenant:${this.tenantId}`,
          relation: 'tenant',
          object: `document:${documentId}`,
        },
      ]);
    } catch (err) {
      this.logger.warn(
        '[PgDocumentRepository] writeTuples failed — searches for this document will be denied until the tuple lands',
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Postgres `uuid` columns reject arbitrary strings. Tests + the e2e suite
 * pass UUIDs already, but defensive callers may hand raw caller-supplied
 * ids. We accept canonical UUIDs verbatim; anything else is rejected so
 * the Postgres layer surfaces a clean error rather than a 22P02.
 */
function coerceUuid(id: string): string {
  if (UUID_RE.test(id)) return id;
  throw new Error(
    `PgDocumentRepository: id '${id}' is not a canonical UUID. Use crypto.randomUUID() or pass an existing UUID.`,
  );
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Re-export so test fixtures can reuse the same UUID generator the
 * repository would otherwise require callers to bring themselves.
 */
export const newDocumentId = (): string => randomUUID();

// Wave 37.A (PRD-071 — query-dsl) — bound constraint factory captured at
// module-load time so the SELECT-by-id call sites stay terse and type-safe
// (TypeScript validates each `field` against DocumentQueryMeta['indexed']).
const q = defineQueryConstraints<DocumentQueryMeta>();

/**
 * Wave 37.A (PRD-071 — query-dsl): bridge from compileToSql's positional
 * `(sql, params)` shape to PgClient's `(strings, ...values)` tagged-template
 * shape. Mirrors the helper inside `@gertsai/pg-client/src/storage-provider.ts`
 * (lines 93-105) — the same approach that backs `PgStorageProvider` since
 * Sprint 3.5 W-4B-4. The fragment carries no user input; compileToSql
 * guarantees `$N`-only placeholders.
 */
function rawQuery<T = unknown>(
  client: PgClient,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<T[]> {
  const parts = sql.split(/\$\d+/g);
  const template = Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
  return client.$queryRaw<T>(template, ...params);
}
