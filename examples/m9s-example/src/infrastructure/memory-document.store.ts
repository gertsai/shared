import type { Document } from '../domain/document';
import type { IDocumentStore } from '../domain/ports/IDocumentStore';

/**
 * In-memory IDocumentStore.
 *
 * Suitable for local dev, examples, and unit tests. Data lives only in
 * the current process — restarting the broker resets state. Replace with
 * a SQL/Mongo adapter to persist.
 */
export class MemoryDocumentStore implements IDocumentStore {
  private readonly byId = new Map<string, Document>();

  async save(doc: Document): Promise<void> {
    // Upsert semantics: caller is responsible for "create vs update" intent.
    this.byId.set(doc.id, doc);
  }

  async findById(id: string): Promise<Document | null> {
    return this.byId.get(id) ?? null;
  }

  /**
   * Test/diag helper — not part of the port. Useful for assertions
   * without exposing the internal map.
   */
  size(): number {
    return this.byId.size;
  }
}
