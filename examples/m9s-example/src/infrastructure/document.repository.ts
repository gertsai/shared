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
import type {
  EntityBasicStatus,
  MutationMarks,
  UpdateAction,
} from '@gertsai/entity-audit';
import type {
  StorageCapabilities,
  StorageMetadata,
} from '@gertsai/storage-core';

import type { Document, DocumentMetadata } from '../domain/document';
import type { IDocumentStore } from '../domain/ports/IDocumentStore';

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
}
