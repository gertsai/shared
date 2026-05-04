import type { Chunk, ChunkSearchHit } from '../chunk';

/**
 * Outbound port for the vector store.
 *
 * Real implementations would back this with Milvus, pgvector, Qdrant, etc.
 * The in-memory adapter shipped with this example uses a flat array +
 * cosine similarity, which is enough for tests and demos.
 */
export interface IChunkStore {
  /**
   * Bulk insert chunks. Implementations should be append-only for simplicity;
   * de-duplication policy is defined per-implementation.
   */
  addChunks(chunks: ReadonlyArray<Chunk>): Promise<void>;

  /**
   * Cosine-similarity search. Returns up to `topK` best hits, ordered
   * by descending score.
   */
  search(vector: ReadonlyArray<number>, topK: number): Promise<ChunkSearchHit[]>;
}
