import type { Chunk, ChunkSearchHit } from '../domain/chunk';
import type { IChunkStore } from '../domain/ports/IChunkStore';

/**
 * In-memory cosine-similarity vector store.
 *
 * Trade-offs vs. a real vector DB:
 *   - O(n) per query — fine for example workloads (< 10k chunks).
 *   - No persistence — restart wipes state.
 *   - No filtering by metadata.
 *
 * NOTE on @gertsai/collection: this adapter could swap the flat array
 * for `OrderedMap` or `BiMap` from @gertsai/collection if richer access
 * patterns were needed. Kept as a plain array here to keep the example
 * focused on the hexagonal seams.
 */
export class MemoryVectorStore implements IChunkStore {
  private readonly chunks: Chunk[] = [];

  async addChunks(chunks: ReadonlyArray<Chunk>): Promise<void> {
    for (const c of chunks) {
      this.chunks.push(c);
    }
  }

  async search(vector: ReadonlyArray<number>, topK: number): Promise<ChunkSearchHit[]> {
    if (this.chunks.length === 0) return [];

    const k = Math.max(1, Math.min(topK, this.chunks.length));
    const scored: ChunkSearchHit[] = this.chunks.map((c) => ({
      docId: c.docId,
      chunkIdx: c.idx,
      text: c.text,
      score: cosineSimilarity(vector, c.vector),
    }));

    // Partial sort would be cheaper for large k — fine to full-sort here.
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Test/diag helper — not part of the port. */
  size(): number {
    return this.chunks.length;
  }
}

/**
 * Cosine similarity in [-1, 1].
 * Returns 0 on zero-vector inputs to avoid NaN.
 *
 * @internal exported for unit-test reuse.
 */
export function cosineSimilarity(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    // bounds guaranteed: i < len = min(a.length, b.length)
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
