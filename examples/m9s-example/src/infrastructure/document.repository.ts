// SPDX-License-Identifier: Apache-2.0
/**
 * DocumentRepository — Wave 4 storage adapter for the m9s-example Document
 * port. Bridges the hexagonal `IDocumentStore` contract to
 * `@gertsai/entity-storage`'s `BaseEntityStorageService` so the example
 * gains audit-trail propagation (creator_uuid, created_at, _uid, status)
 * without changing the domain layer.
 *
 * Per SPEC-010 Sprint 3.5.2 (Wave 4 m9s-example migration):
 *   - The domain `Document` shape (id/text/metadata) stays UNCHANGED.
 *   - The Wave 4 storage envelope (`DocumentReadShape` with MutationMarks)
 *     lives entirely INSIDE this file as an internal storage type.
 *   - `IDocumentStore` port contract preserved → existing use-case tests
 *     (which mock `IDocumentStore` via `vi.fn()`) need ZERO changes.
 *
 * Replaces `MemoryDocumentStore` (deleted same sprint). The composition
 * root now constructs `new DocumentRepository(provider, session)` instead
 * of `new MemoryDocumentStore()`.
 */
import {
  BaseEntityStorageService,
  type IStorageProvider,
} from '@gertsai/entity-storage';
import type { Session } from '@gertsai/session';
import {
  timestampToMillis,
  type EntityBasicStatus,
  type MutationMarks,
  type UpdateAction,
} from '@gertsai/entity-audit';
import type {
  StorageCapabilities,
  StorageMetadata,
} from '@gertsai/storage-core';

import type { Document, DocumentMetadata } from '../domain/document';
import type {
  DocumentSummary,
  IDocumentStore,
  ListDocumentsOpts,
} from '../domain/ports/IDocumentStore';

// =============================================================================
// Internal Wave 4 storage types — never leak into the domain layer.
// =============================================================================

/**
 * Write-side shape — what `repository.set()` accepts. Strips domain-layer
 * `id` (mapped to `_uid` by Wave 4) and ANY audit fields (those are stamped
 * by `BaseEntityStorageService` via `entity-audit` builders).
 */
interface DocumentWriteShape {
  readonly text: string;
  readonly metadata?: DocumentMetadata;
}

/**
 * Read-side shape — what `repository.get()` returns from storage. Adds the
 * audit envelope on top of the write shape: `_uid` (Wave 4 identity),
 * `status` (soft-delete state machine), full `MutationMarks` triplet
 * (created_, updated_, deleted_ field groups), and optional `update_action`.
 */
interface DocumentReadShape extends DocumentWriteShape, MutationMarks {
  readonly _uid: string;
  readonly status: EntityBasicStatus;
  readonly update_action?: UpdateAction;
}

/**
 * Storage metadata bound to the `documents` collection. Indexed fields
 * are limited to those any future query DSL would need to filter on
 * (`_uid` for direct lookup, `status` for soft-delete filtering).
 */
type DocumentMeta = StorageMetadata<
  DocumentReadShape,
  DocumentWriteShape,
  '_uid' | 'status'
>;

export type { DocumentMeta };

// =============================================================================
// Repository
// =============================================================================

/**
 * Hex-boundary adapter — implements `IDocumentStore` (domain port) by
 * extending `BaseEntityStorageService<DocumentMeta>` (Wave 4 base).
 *
 * Caller-supplied `doc.id` is threaded into Wave 4 as the `_uid` field;
 * `findById` strips the audit envelope back to the domain shape so callers
 * never see Wave 4 internals.
 *
 * Upsert semantic preserved (matches the previous `MemoryDocumentStore`)
 * by branching on existence: an existing row uses `update` (refreshes
 * `updated_*` only); a new row uses `set` (stamps `created_*`).
 */
export class DocumentRepository
  extends BaseEntityStorageService<DocumentMeta>
  implements IDocumentStore
{
  /**
   * Memoised capability object — built once at construction time and
   * frozen. Wave 8.2 audit Perf#2: previous implementation allocated a
   * fresh `{ ...super.capabilities, upsert: {...} }` on every read,
   * which `BaseEntityStorageService.upsert()` may consult on every call.
   */
  private readonly _capabilities: StorageCapabilities;

  constructor(provider: IStorageProvider<DocumentMeta>, session: Session) {
    super({ provider, session, path: 'documents' });
    // Snapshot the base capabilities here so any future provider that
    // computes capabilities dynamically still sees a consistent value
    // through this repository's lifetime.
    this._capabilities = Object.freeze({
      ...super.capabilities,
      upsert: Object.freeze({ supported: true, preservesCreatorAudit: true }),
    });
  }

  /**
   * Wave 8.1 / PRD-013 G-1 + FR-1 — explicit capability declaration.
   *
   * Both shipped providers handle audit-aware upsert per ADR-013
   * §Decision-A1: `InMemoryStorageProvider` pre-checks `Map.has(id)`
   * before stamping create-time fields, and `PgStorageProvider` uses a
   * surgical jsonb merge
   * (`data || (EXCLUDED.data - 'creator_uuid' - 'created_at')`) that
   * preserves the original creator on conflict. Advertising
   * `preservesCreatorAudit: true` is therefore a contract guarantee
   * across mock and real-infra modes — it lets
   * `BaseEntityStorageService.upsert()` take the 1-RTT fast path.
   *
   * Wave 8.2 audit Perf#2: getter returns the frozen `_capabilities`
   * computed in the constructor (no per-read allocation).
   */
  override get capabilities(): StorageCapabilities {
    return this._capabilities;
  }

  /**
   * Persist a document via Wave 4 with explicit upsert semantic. Existing
   * id → `update` (preserves `created_at`, refreshes `updated_*`).
   * Missing id → `set` (stamps fresh `created_*` triplet).
   */
  async save(doc: Document): Promise<void> {
    const existing = await this.get(doc.id);
    if (existing) {
      await this.update(doc.id, {
        text: doc.text,
        ...(doc.metadata !== undefined && { metadata: doc.metadata }),
      });
      return;
    }
    await this.set({
      _uid: doc.id,
      text: doc.text,
      ...(doc.metadata !== undefined && { metadata: doc.metadata }),
    });
  }

  /**
   * Look up by domain id. Returns plain `Document` — audit envelope
   * stripped so the domain layer never sees `MutationMarks`.
   */
  async findById(id: string): Promise<Document | null> {
    const stored = await this.get(id);
    if (!stored) return null;
    return {
      id: stored._uid,
      text: stored.text,
      ...(stored.metadata !== undefined && { metadata: stored.metadata }),
    };
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — page through non-deleted documents,
   * newest first. Excludes soft-deleted entities by filtering on
   * `status !== 'deleted'` in memory (cheap for the demo scale; a
   * production adapter would push the filter into a `WhereConstraint`
   * once `status` is in `Meta['indexed']`).
   *
   * Sort key is `created_at` (audit-stamped); ties broken by `_uid` for
   * determinism. `Timestamp → millis` via `audit-primitives.timestampToMillis`.
   *
   * Returns a projection (`DocumentSummary`) that never exposes audit
   * envelope or raw metadata — UI-shaped only.
   */
  async listSummaries(opts: ListDocumentsOpts = {}): Promise<readonly DocumentSummary[]> {
    const skip = Math.max(0, opts.skip ?? 0);
    const requested = opts.limit ?? 20;
    const limit = Math.min(100, Math.max(1, requested));

    // Fetch everything (no query → InMemoryStorageProvider returns all rows).
    const all = await this.list();
    const live = all.filter((row) => row.status !== 'deleted');

    // Sort newest first by `created_at`; deterministic tie-break on `_uid`.
    const sorted = [...live].sort((a, b) => {
      const aMs = timestampToMillis(a.created_at);
      const bMs = timestampToMillis(b.created_at);
      if (aMs !== bMs) return bMs - aMs;
      return a._uid.localeCompare(b._uid);
    });

    return sorted.slice(skip, skip + limit).map(toSummary);
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — count non-deleted documents (the
   * `total` used by the admin pagination control).
   */
  async count(): Promise<number> {
    const all = await this.list();
    return all.filter((row) => row.status !== 'deleted').length;
  }

  /**
   * Wave 10.B (PRD-019 FR-005) — soft-delete via the Wave 4 audit-aware
   * `delete()` (flips `status` to `'deleted'`, stamps `deleted_*`). Missing
   * ids are a no-op (idempotent) so the admin UI's optimistic flow survives
   * a double-clicked Delete button.
   */
  async softDelete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing || existing.status === 'deleted') return;
    await this.delete(id);
  }
}

/**
 * Pure projection — converts the Wave 4 storage shape to the
 * `DocumentSummary` exposed by the admin port. Keeps the conversion
 * branch-free and outside the repository class for ease of unit test.
 *
 * `preview` is the first 200 chars of `text`; the admin UI further trims
 * to 80 for the table cell. `bytes` is the UTF-8 byte length (computed
 * via `Buffer.byteLength` — Node-only, which matches the m9s-example
 * runtime, not browser-shipped).
 */
function toSummary(row: DocumentReadShape): DocumentSummary {
  return {
    id: row._uid,
    preview: row.text.length > 200 ? row.text.slice(0, 200) : row.text,
    bytes: Buffer.byteLength(row.text, 'utf8'),
    createdAt: new Date(timestampToMillis(row.created_at)).toISOString(),
  };
}
