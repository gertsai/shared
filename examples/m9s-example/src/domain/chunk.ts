/**
 * Chunk — domain entity.
 *
 * Represents a slice of a Document together with its embedding vector.
 * Stored by IChunkStore and queried via cosine similarity.
 */
export interface Chunk {
  /** Owning document id */
  readonly docId: string;
  /** Position of this chunk inside the document (0-based) */
  readonly idx: number;
  /** Raw text for this chunk */
  readonly text: string;
  /** Embedding vector; length is fixed per-embedder */
  readonly vector: ReadonlyArray<number>;
}

/**
 * Search hit returned by IChunkStore.search().
 * Score is in [-1, 1] for cosine similarity (higher = more relevant).
 */
export interface ChunkSearchHit {
  readonly docId: string;
  readonly chunkIdx: number;
  readonly text: string;
  readonly score: number;
}
