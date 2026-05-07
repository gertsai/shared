// SPDX-License-Identifier: Apache-2.0
/**
 * DocumentMeta — `defineStorageMetadata` envelope for the m9s-example
 * normalised `documents` table (Sprint 3.11 Amendment 2 §A2.10).
 *
 * Type-level documentation only. The Sprint 3.5 `BaseEntityStorageService`
 * generic envelope is jsonb-blob shaped (Read/Write share the same shape)
 * and DOES NOT FIT a normalised schema with `tenant_id` + `owner_uuid` +
 * `vector(768)` columns (per ADR-011 Decision A revised by Amendment 2
 * §A2.5). Therefore `pg-document.repository.ts` and `pg-vector.store.ts`
 * use `PgClient` raw SQL directly.
 *
 * `DocumentMeta` is exported as type-level reference for callers that
 * eventually layer a query DSL or generic batch runner on top of the
 * `documents` collection without re-implementing read/write shapes.
 */
import { defineStorageMetadata } from '@gertsai/storage-core';

/**
 * Read shape — what `SELECT * FROM documents` returns from pg.
 * Maps 1:1 to the column list in `migrations/001_init_documents_chunks.up.sql`.
 */
export interface DocumentRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly owner_uuid: string;
  readonly text: string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Write shape — payload accepted by `INSERT INTO documents`. `created_at` /
 * `updated_at` are server-side defaults (`now()`), so callers omit them.
 */
export interface DocumentWrite {
  readonly id: string;
  readonly tenant_id: string;
  readonly owner_uuid: string;
  readonly text: string;
  readonly metadata: Record<string, unknown>;
}

const documentMeta = defineStorageMetadata<DocumentRow, DocumentWrite>()({
  indexed: ['id', 'tenant_id', 'owner_uuid'] as const,
});

export type DocumentMeta = typeof documentMeta;
export { documentMeta };
