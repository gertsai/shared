import type { ChunkSearchHit } from '../domain/chunk';
import type { IChunkStore } from '../domain/ports/IChunkStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';
import { PermissionDeniedError } from './IngestDocumentUseCase';

/**
 * Dependencies for the Search use case (constructor-injected).
 */
export interface SearchDocumentsDeps {
  readonly chunkStore: IChunkStore;
  readonly embedder: IEmbedder;
  readonly gate: IPermissionGate;
}

/**
 * Inputs to the Search use case.
 */
export interface SearchDocumentsInput {
  readonly userId: string;
  readonly query: string;
  /** Number of results to return (defaults to 3 if not supplied) */
  readonly topK?: number;
}

/**
 * Outputs of the Search use case.
 */
export interface SearchDocumentsResult {
  readonly results: ReadonlyArray<ChunkSearchHit>;
}

/** Default number of results returned when caller does not specify. */
export const DEFAULT_TOP_K = 3;
/** Hard upper bound — defends against accidental DoS via huge topK. */
export const MAX_TOP_K = 50;

/**
 * SearchDocumentsUseCase
 *
 * Pipeline:
 *   1. Permission check (`search` on `'*'`)
 *   2. Embed the query text (single-element batch)
 *   3. Cosine-search the chunk store for `topK` hits
 *
 * Caching is intentionally NOT inside the use case — the inbound Moleculer
 * adapter wraps the call with M9sCacheCacher TTL caching, keeping the
 * domain layer pure.
 */
export class SearchDocumentsUseCase {
  constructor(private readonly deps: SearchDocumentsDeps) {}

  async execute(input: SearchDocumentsInput): Promise<SearchDocumentsResult> {
    const { userId, query } = input;
    const { gate, embedder, chunkStore } = this.deps;

    if (!query || query.trim().length === 0) {
      throw new Error('Search query must be non-empty');
    }

    const topK = clampTopK(input.topK);

    const allowed = await gate.can(userId, 'search', '*');
    if (!allowed) {
      throw new PermissionDeniedError(userId, 'search', '*');
    }

    const [queryVector] = await embedder.embed([query.trim()]);
    if (!queryVector) {
      throw new Error('Embedder returned no vector for the query');
    }

    const results = await chunkStore.search(queryVector, topK);
    return { results };
  }
}

function clampTopK(value: number | undefined): number {
  if (value === undefined || value === null) return DEFAULT_TOP_K;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TOP_K;
  return Math.min(Math.floor(value), MAX_TOP_K);
}
