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

import type { Document } from '../domain/document';
import type {
  DocumentSummary,
  IDocumentStore,
  ListDocumentsOpts,
} from '../domain/ports/IDocumentStore';

import { PgSoftDeleteNotSupportedError } from '../shared/errors';

import type { DocumentRow } from './document.meta';

export interface PgDocumentRepositoryOptions {
  /** PgClient instance — typically `PgClientAdapter` in production. */
  readonly client: PgClient;
  /**
   * Tenant id used when persisting documents. m9s-example demos a single
   * tenant per process; a production deployment would scope this per
   * request via `@gertsai/runtime-context` (see TODO at composition root).
   */
  readonly tenantId: string;
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

export class PgDocumentRepository implements IDocumentStore {
  private readonly client: PgClient;
  private readonly tenantId: string;
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

    const existing = await this.client.$queryRaw<{ id: string }>`
      SELECT id FROM documents WHERE id = ${id} AND tenant_id = ${this.tenantId}
    `;

    if (existing.length > 0) {
      await this.client.$executeRaw`
        UPDATE documents
           SET text = ${doc.text},
               metadata = ${metadataJson}::jsonb,
               updated_at = now()
         WHERE id = ${id} AND tenant_id = ${this.tenantId}
      `;
      return;
    }

    await this.client.$executeRaw`
      INSERT INTO documents (id, tenant_id, owner_uuid, text, metadata)
      VALUES (${id}, ${this.tenantId}, ${this.ownerUuid}, ${doc.text}, ${metadataJson}::jsonb)
    `;

    if (this.writeFgaTuples) {
      await this.tryWriteTenantTuple(id);
    }
  }

  async findById(id: string): Promise<Document | null> {
    const rows = await this.client.$queryRaw<DocumentRow>`
      SELECT id, tenant_id, owner_uuid, text, metadata, created_at, updated_at
        FROM documents
       WHERE id = ${coerceUuid(id)} AND tenant_id = ${this.tenantId}
       LIMIT 1
    `;
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
    const rows = await this.client.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text AS count
        FROM documents
       WHERE tenant_id = ${this.tenantId}
    `;
    const raw = rows[0]?.count ?? '0';
    return Number(raw);
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — soft-delete.
   *
   * EVID-036 audit fix (P1 / CI-3 — Liskov violation): the Sprint 3.11
   * `documents` schema lacks a `deleted_at` column, so this adapter cannot
   * honor the `IDocumentStore.softDelete` contract — historically it
   * silently degraded to a HARD delete, which broke caller assumptions
   * (admin-restore path, audit trail). The correct fix is a migration that
   * adds `deleted_at TIMESTAMPTZ NULL` and updates `listSummaries`/`count`
   * to filter `WHERE deleted_at IS NULL`; tracked in the m9s-example
   * backlog.
   *
   * Until that migration ships, we fail loud: throw a clearly-typed error
   * the action layer can map to HTTP 501 (Not Implemented). This honors
   * Liskov — both adapters either succeed identically or fail explicitly,
   * never silently diverge.
   */
  async softDelete(_id: string): Promise<void> {
    throw new PgSoftDeleteNotSupportedError(
      'PgDocumentRepository.softDelete is not supported: the documents ' +
        'schema lacks a deleted_at column. Apply the deleted_at migration ' +
        'or switch the example to memory mode.',
    );
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
