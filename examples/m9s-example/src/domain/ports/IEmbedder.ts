/**
 * Outbound port for text embeddings.
 *
 * Real implementations call out to OpenAI, Voyage, Cohere, a local
 * sentence-transformers server, etc. — typically via @gertsai/fetch.
 *
 * The shipped mock-embedder is deterministic and offline-friendly so the
 * example app stays runnable without external dependencies.
 */
export interface IEmbedder {
  /**
   * Embed a batch of texts.
   *
   * @returns A 2-D array where `result[i]` is the vector for `texts[i]`.
   *          All vectors share the same dimensionality (`dimensions`).
   */
  embed(texts: ReadonlyArray<string>): Promise<number[][]>;

  /** Vector dimensionality (constant per implementation) */
  readonly dimensions: number;
}
