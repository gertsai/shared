// SPDX-License-Identifier: Apache-2.0
import { InternalError, ValidationError } from '@gertsai/errors';
import type { Session } from '@gertsai/session';
import {
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';

import { createDocument, type DocumentMetadata } from '../domain/document';
import type { Chunk } from '../domain/chunk';
import type { IDocumentStore } from '../domain/ports/IDocumentStore';
import type { IChunkStore } from '../domain/ports/IChunkStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';
import { permissionDenied } from '../shared/errors.js';

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
 *
 * Wave 5 (Sprint 3.10) additive optional fields:
 *   - `session`: when supplied, the use case asserts the session is
 *     authenticated via `@gertsai/session-guard.assertAuthenticated`.
 *   - `expectedTenantId`: when both `session` AND `expectedTenantId` are
 *     supplied, the use case additionally asserts the session is scoped to
 *     that tenant via `assertSessionInTenant`.
 *
 * Both are OPTIONAL — pre-Wave-5 callers that pass `userId` only continue
 * to work unchanged (per ADR-010 I-2 / I-3 regression invariant).
 */
export interface IngestDocumentInput {
  readonly userId: string;
  readonly docId: string;
  readonly text: string;
  readonly metadata?: DocumentMetadata;
  readonly session?: Session;
  readonly expectedTenantId?: string;
}

/**
 * Outputs of the Ingest use case.
 */
export interface IngestDocumentResult {
  readonly docId: string;
  readonly chunkCount: number;
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
    const { userId, docId, text, metadata, session, expectedTenantId } = input;
    const { gate, docStore, chunkStore, embedder } = this.deps;

    // Wave 5 session-guard assertions (Sprint 3.10 W-3-10-20). Skipped when
    // `session` is absent so existing pre-Wave-5 callers keep working.
    if (session !== undefined) {
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) {
        assertSessionInTenant(session, expectedTenantId);
      }
    }

    // 1. AuthZ — fail closed
    const allowed = await gate.can(userId, 'ingest', docId);
    if (!allowed) {
      throw permissionDenied(userId, 'ingest', docId);
    }

    // 2. Build the domain entity (validates invariants)
    const doc = createDocument({
      id: docId,
      text,
      ...(metadata !== undefined && { metadata }),
    });

    // 3. Chunk + embed
    const chunkTexts = splitIntoChunks(doc.text);
    if (chunkTexts.length === 0) {
      // Defensive — createDocument already rejected empty text.
      throw new ValidationError({
        message: 'Document produced zero chunks',
        details: { field: 'text', constraint: 'chunkable' },
      });
    }

    const vectors = await embedder.embed(chunkTexts);
    if (vectors.length !== chunkTexts.length) {
      throw new InternalError({
        message: `Embedder returned ${vectors.length} vectors for ${chunkTexts.length} chunks`,
        details: {
          expectedChunks: chunkTexts.length,
          actualVectors: vectors.length,
        },
      });
    }

    const chunks: Chunk[] = chunkTexts.map((chunkText, idx) => ({
      docId: doc.id,
      idx,
      text: chunkText,
      // bounds guaranteed by length check above (vectors.length === chunkTexts.length)
      vector: vectors[idx]!,
    }));

    // 4. Persist (document first so a partial failure leaves a recoverable trail)
    await docStore.save(doc);
    await chunkStore.addChunks(chunks);

    return { docId: doc.id, chunkCount: chunks.length };
  }
}
