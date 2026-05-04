import { createDocument, type DocumentMetadata } from '../domain/document';
import type { Chunk } from '../domain/chunk';
import type { IDocumentStore } from '../domain/ports/IDocumentStore';
import type { IChunkStore } from '../domain/ports/IChunkStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';

/**
 * Dependencies injected at composition time.
 * Constructor injection — explicit, easy to mock in tests.
 */
export interface IngestDocumentDeps {
  readonly docStore: IDocumentStore;
  readonly chunkStore: IChunkStore;
  readonly embedder: IEmbedder;
  readonly gate: IPermissionGate;
}

/**
 * Inputs to the Ingest use case.
 * Pure data shape — no transport coupling.
 */
export interface IngestDocumentInput {
  readonly userId: string;
  readonly docId: string;
  readonly text: string;
  readonly metadata?: DocumentMetadata;
}

/**
 * Outputs of the Ingest use case.
 */
export interface IngestDocumentResult {
  readonly docId: string;
  readonly chunkCount: number;
}

/**
 * Domain error thrown when the permission gate denies the operation.
 * The inbound adapter is responsible for translating this into an HTTP 403.
 */
export class PermissionDeniedError extends Error {
  public readonly userId: string;
  public readonly action: string;
  public readonly resource: string;

  constructor(userId: string, action: string, resource: string) {
    super(`User '${userId}' is not allowed to '${action}' on '${resource}'`);
    this.name = 'PermissionDeniedError';
    this.userId = userId;
    this.action = action;
    this.resource = resource;
  }
}

/**
 * Split text into pseudo-sentence chunks.
 *
 * Naive but deterministic — sufficient for an example. Real pipelines
 * use token-aware splitters (e.g. semantic boundaries, sliding windows).
 *
 * @internal exported for test visibility only
 */
export function splitIntoChunks(text: string): string[] {
  // Split on sentence terminators while keeping the result trimmed and non-empty.
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Fallback: if input had no terminators, keep the whole string as one chunk.
  if (parts.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }
  return parts;
}

/**
 * IngestDocumentUseCase
 *
 * Orchestrates the ingestion pipeline:
 *   1. Permission check via {@link IPermissionGate}
 *   2. Chunk the document text
 *   3. Embed all chunks in a single batch (one call to the embedder)
 *   4. Persist the original document and the chunk vectors
 *
 * The use case does no I/O of its own — every side effect is delegated
 * to a port. This makes it trivially unit-testable with stub adapters.
 */
export class IngestDocumentUseCase {
  constructor(private readonly deps: IngestDocumentDeps) {}

  async execute(input: IngestDocumentInput): Promise<IngestDocumentResult> {
    const { userId, docId, text, metadata } = input;
    const { gate, docStore, chunkStore, embedder } = this.deps;

    // 1. AuthZ — fail closed
    const allowed = await gate.can(userId, 'ingest', docId);
    if (!allowed) {
      throw new PermissionDeniedError(userId, 'ingest', docId);
    }

    // 2. Build the domain entity (validates invariants)
    const doc = createDocument({ id: docId, text, metadata });

    // 3. Chunk + embed
    const chunkTexts = splitIntoChunks(doc.text);
    if (chunkTexts.length === 0) {
      // Defensive — createDocument already rejected empty text.
      throw new Error('Document produced zero chunks');
    }

    const vectors = await embedder.embed(chunkTexts);
    if (vectors.length !== chunkTexts.length) {
      throw new Error(
        `Embedder returned ${vectors.length} vectors for ${chunkTexts.length} chunks`,
      );
    }

    const chunks: Chunk[] = chunkTexts.map((chunkText, idx) => ({
      docId: doc.id,
      idx,
      text: chunkText,
      vector: vectors[idx],
    }));

    // 4. Persist (document first so a partial failure leaves a recoverable trail)
    await docStore.save(doc);
    await chunkStore.addChunks(chunks);

    return { docId: doc.id, chunkCount: chunks.length };
  }
}
