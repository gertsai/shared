/**
 * Store Chunks Action — `v1.ingest._store` (internal worker-only).
 *
 * Originally the second journaled leaf of the previous
 * `wf-ingest.ingest.process` workflow (now `v1.ingest.process`). Sprint
 * 3.1 §W-7 collapsed the workflow handler onto pure use-case delegation,
 * so this internal action is no longer reached from the workflow path —
 * kept as a stable internal entry point. Persists
 * a fully prepared `Document` + chunk batch to the configured stores. The
 * action receives the chunk texts AND the embedding vectors produced by
 * `v1.ingest._embed` so the storage step is deterministic given its inputs
 * — replay-friendly, no recomputation.
 *
 * Why split storage from embedding instead of running the whole use case?
 *
 *   The whole point of the workflow demonstration is granular journaling.
 *   By splitting embed + store into two `ctx.call(...)`s, the middleware
 *   gets to record TWO event-log entries; a crash AFTER embed but BEFORE
 *   store skips re-embedding on replay. A monolithic use-case call would
 *   re-run the embedder.
 */
import { createDocument, type DocumentMetadata } from '../../../../domain/document';
import type { Chunk } from '../../../../domain/chunk';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import type { IngestServiceContext } from '../../types';

/**
 * Request body of `v1.ingest._store`. The fully prepared chunk + vector
 * batch the workflow has already computed. Vectors must align by index
 * with `chunks` (same length, same order).
 */
export interface StoreChunksRequest {
  docId: string;
  userId: string;
  text: string;
  metadata?: DocumentMetadata;
  chunks: string[];
  vectors: number[][];
}

/**
 * Response of `v1.ingest._store`.
 */
export interface StoreChunksResponse {
  docId: string;
  chunkCount: number;
}

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const storeChunks: any = controller.register('_store', {
  // Internal: not exposed over HTTP, no auth (broker-only invocation).
  auth: 'none',

  params: typia.createValidate<StoreChunksRequest>(),
  response: typia.createValidate<StoreChunksResponse>(),

  async handler({ params, service, logger, respond }) {
    const { docId, text, metadata, chunks, vectors } = params;

    if (chunks.length !== vectors.length) {
      throw new Error(
        `Chunk/vector length mismatch: ${chunks.length} chunks vs ${vectors.length} vectors`,
      );
    }

    logger.info('[v1.ingest._store] persisting chunks', {
      docId,
      chunkCount: chunks.length,
    });

    // Re-derive the domain entity here so persistence stays the canonical
    // place where the document invariants are validated. The workflow
    // already validated `text` length, but `createDocument` enforces
    // domain rules (non-empty, etc.).
    const doc = createDocument({ id: docId, text, metadata });

    const chunkRows: Chunk[] = chunks.map((chunkText, idx) => ({
      docId: doc.id,
      idx,
      text: chunkText,
      vector: vectors[idx],
    }));

    // Document first — partial failures leave a recoverable trail.
    await service.docStore.save(doc);
    await service.chunkStore.addChunks(chunkRows);

    return respond({ docId: doc.id, chunkCount: chunkRows.length });
  },
});
