import type { IEmbedder } from '../../domain/ports/IEmbedder';

/**
 * MockEmbedder
 *
 * Deterministic, offline embedder that turns text into a fixed-dimension
 * float vector via a stable hash. Same input always produces the same
 * vector — invaluable for repeatable tests and examples.
 *
 * Properties:
 *   - L2-normalized output (cosine similarity stays in [-1, 1]).
 *   - 384 dimensions by default, matching common BGE/MiniLM sizes.
 *   - Pure JS; no external service required.
 *
 * Real-world replacement:
 *   ```ts
 *   import { fetch } from '@gertsai/fetch';
 *   const res = await fetch('https://embeddings.example/v1/embed', {
 *     method: 'POST',
 *     body: JSON.stringify({ inputs: texts }),
 *     headers: { 'content-type': 'application/json' },
 *   });
 *   const { vectors } = await res.json();
 *   return vectors;
 *   ```
 */
export class MockEmbedder implements IEmbedder {
  public readonly dimensions: number;

  constructor(dimensions = 384) {
    if (dimensions <= 0 || !Number.isInteger(dimensions)) {
      throw new Error('MockEmbedder dimensions must be a positive integer');
    }
    this.dimensions = dimensions;
  }

  async embed(texts: ReadonlyArray<string>): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const dim = this.dimensions;
    const vec = new Array<number>(dim).fill(0);

    // Token-level + char-level mixing — keeps similar texts close while
    // letting different texts diverge enough for a reasonable demo.
    const tokens = text.toLowerCase().split(/\W+/u).filter(Boolean);
    for (const tok of tokens) {
      const h = fnv1a32(tok);
      const slot = h % dim;
      // Magnitude is a stable function of the token hash to avoid trivial
      // collisions producing identical vectors.
      const magnitude = ((h >>> 8) & 0xff) / 255 + 0.25;
      vec[slot] += magnitude;
    }

    // Sprinkle char-level signal so single-token texts still vary.
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const slot = (code * 2654435761) >>> 0; // Knuth multiplicative hash
      vec[slot % dim] += ((code & 0x0f) + 1) / 16;
    }

    // L2 normalize so cosine similarity behaves predictably.
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) {
      // All-zero vector — return as-is; cosineSimilarity() handles 0 safely.
      return vec;
    }
    for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
  }
}

/**
 * FNV-1a 32-bit hash. Good enough for bucketing tokens into vector slots
 * deterministically; not cryptographic.
 */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
