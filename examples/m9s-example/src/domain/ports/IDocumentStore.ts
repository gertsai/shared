import type { Document } from '../document';

/**
 * Outbound port for persisting documents.
 * Implemented by adapters/outbound/memory-document.store.ts (and any future
 * SQL/Mongo adapter). Use cases depend on this port — never on a concrete impl.
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
}
