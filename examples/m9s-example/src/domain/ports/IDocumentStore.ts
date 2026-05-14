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
 * Soft-deleted documents are EXCLUDED from `listSummaries()` results.
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
 * Pagination opts for {@link IDocumentQuery.listSummaries}. `skip` defaults
 * to 0; `limit` defaults to 20 with a hard cap of 100 enforced by the
 * action layer (transport boundary).
 */
export interface ListDocumentsOpts {
  readonly skip?: number;
  readonly limit?: number;
}

/**
 * Outbound port for the write side of document persistence (save + lookup
 * by id).
 *
 * EVID-036 audit fix (P3 / W-Arch-2 — ISP split): `IDocumentStore` was
 * widening from 2 → 5 methods over Waves 9 → 10.B. The Interface
 * Segregation Principle calls for splitting at the consumer boundary:
 * the ingest use case only needs save + findById, but it was forced to
 * type its dep as the 5-method god-interface. Now `IDocumentStore` is the
 * narrow write port; the admin CMS read projection lives in
 * {@link IDocumentQuery} and the soft-delete operation in
 * {@link ISoftDeletableDocumentStore}. Concrete adapters
 * (`DocumentRepository`, `PgDocumentRepository`) still implement all
 * three because they share the same backing store — but callers can
 * depend on the minimal interface they actually need.
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
   * Implementations MUST exclude soft-deleted rows from this lookup so
   * a tombstoned id reads as "not found" — keeps caller invariants
   * stable across the soft-delete boundary.
   */
  findById(id: string): Promise<Document | null>;
}

/**
 * Outbound port for the read projection used by the admin CMS list view.
 * Lives separately from {@link IDocumentStore} per ISP — list/count callers
 * (UI dashboard, admin pages) don't need `save`, and write-side callers
 * (ingest pipeline) don't need pagination.
 *
 * Wave 10.E (PRD-022 / closes audit W-Arch-2).
 */
export interface IDocumentQuery {
  /**
   * Page through non-deleted documents (newest first). The page window is
   * clamped at the adapter (callers may pass any non-negative integers, but
   * the action layer validates the range).
   */
  listSummaries(opts?: ListDocumentsOpts): Promise<readonly DocumentSummary[]>;

  /**
   * Total count of non-deleted documents in the store. Used by the admin
   * UI to drive pagination boundaries.
   */
  count(): Promise<number>;
}

/**
 * Outbound port for the soft-delete operation. Separate from
 * {@link IDocumentStore} per ISP — the ingest pipeline never deletes; only
 * the admin CMS does. Adapters that cannot honor soft-delete (e.g. PG
 * before migration 002) throw `PgSoftDeleteNotSupportedError` so the action
 * layer can map to HTTP 501 — preserving Liskov.
 *
 * Wave 10.E (PRD-022 / closes audit W-Arch-2 + CI-3).
 */
export interface ISoftDeletableDocumentStore {
  /**
   * Soft-delete by id. Tombstones the row so it disappears from read
   * paths but remains queryable for restore/audit. Idempotent — re-deleting
   * an already-tombstoned id is a no-op; missing ids are a no-op.
   */
  softDelete(id: string): Promise<void>;
}

/**
 * Convenience composition — the union every concrete adapter implements
 * and that the service context exposes. Service-level actions can still
 * declare the narrower interface they need (e.g. `IDocumentQuery` for the
 * list action) and rely on structural compatibility.
 *
 * Marked `@deprecated` because new code should depend on the narrowest
 * interface possible; existing call-sites can migrate gradually.
 */
export type FullDocumentStore = IDocumentStore & IDocumentQuery & ISoftDeletableDocumentStore;
