// SPDX-License-Identifier: Apache-2.0
import type { Document } from '../document';

/**
 * Lightweight summary projection used by admin CMS list views.
 *
 * Carries the same fields as `Document` plus `createdAt` (ISO-8601 string)
 * and the byte size of the raw text. Adapters MUST format `createdAt` as a
 * timezone-aware ISO string so the SvelteKit UI can render via
 * `Intl.DateTimeFormat` without backend-side locale concerns.
 *
 * Soft-deleted documents are EXCLUDED from `list()` results.
 *
 * Wave 10.B (PRD-019 FR-005).
 */
export interface DocumentSummary {
  readonly id: string;
  /** First 200 chars of `text` — admin UI further trims to 80. */
  readonly preview: string;
  /** Raw text byte length (UTF-8 byte count for display only). */
  readonly bytes: number;
  /** ISO-8601 timezone-aware timestamp string. */
  readonly createdAt: string;
}

/**
 * Pagination opts for {@link IDocumentStore.listSummaries}. `skip` defaults
 * to 0; `limit` defaults to 20 with a hard cap of 100 enforced by the
 * action layer (transport boundary).
 */
export interface ListDocumentsOpts {
  readonly skip?: number;
  readonly limit?: number;
}

/**
 * Outbound port for persisting documents.
 * Implemented by:
 *   - `DocumentRepository` (Wave 4 entity-storage backed; memory + Wave 4
 *     storage providers honour soft-delete via the `status` field).
 *   - `PgDocumentRepository` (Sprint 3.11 raw-SQL adapter; the migration
 *     schema does NOT include `deleted_at`, so `softDelete` falls back to
 *     a hard delete with a docstring caveat — see Wave 10.B FR-005).
 *
 * Use cases depend on this port — never on a concrete impl.
 */
export interface IDocumentStore {
  /**
   * Persist a document. Implementations MUST treat existing ids as upserts
   * (or throw a documented domain error if they choose not to).
   */
  save(doc: Document): Promise<void>;

  /**
   * Look up a document by id. Returns `null` when not found.
   */
  findById(id: string): Promise<Document | null>;

  /**
   * Page through non-deleted documents (newest first). The page window is
   * clamped at the adapter (callers may pass any non-negative integers, but
   * the action layer validates the range).
   *
   * Wave 10.B (PRD-019 FR-005).
   */
  listSummaries(opts?: ListDocumentsOpts): Promise<readonly DocumentSummary[]>;

  /**
   * Total count of non-deleted documents in the store. Used by the admin
   * UI to drive pagination boundaries.
   */
  count(): Promise<number>;

  /**
   * Soft-delete by id. The audit-aware adapter (`DocumentRepository`)
   * flips the entity status to `'deleted'` and stamps `deleted_*`; the
   * raw-SQL Pg adapter performs a hard delete because the schema lacks a
   * `deleted_at` column. Missing ids are a no-op (idempotent) so the admin
   * UI's optimistic flow survives double-clicks.
   */
  softDelete(id: string): Promise<void>;
}
