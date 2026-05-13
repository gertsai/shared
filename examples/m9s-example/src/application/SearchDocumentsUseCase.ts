// SPDX-License-Identifier: Apache-2.0
import { InternalError, ValidationError } from '@gertsai/errors';
import type { Session } from '@gertsai/session';
import {
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';

import type { ChunkSearchHit } from '../domain/chunk';
import type { IChunkStore } from '../domain/ports/IChunkStore';
import type { IEmbedder } from '../domain/ports/IEmbedder';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';
import { permissionDenied } from '../shared/errors';

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
 *
 * Wave 5 (Sprint 3.10) additive optional fields:
 *   - `session`: when supplied, the use case asserts the session is
 *     authenticated via `@gertsai/session-guard.assertAuthenticated`.
 *   - `expectedTenantId`: when both `session` AND `expectedTenantId` are
 *     supplied, the use case additionally asserts the session is scoped to
 *     that tenant via `assertSessionInTenant`.
 *
 * Both are OPTIONAL — pre-Wave-5 callers continue to work unchanged
 * (per ADR-010 I-2 / I-3 regression invariant).
 */
export interface SearchDocumentsInput {
  readonly userId: string;
  readonly query: string;
  /** Number of results to return (defaults to 3 if not supplied) */
  readonly topK?: number;
  readonly session?: Session;
  readonly expectedTenantId?: string;
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
    const { userId, query, session, expectedTenantId } = input;
    const { gate, embedder, chunkStore } = this.deps;

    // Wave 5 session-guard assertions (Sprint 3.10 W-3-10-20). Skipped when
    // `session` is absent so existing pre-Wave-5 callers keep working.
    if (session !== undefined) {
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) {
        assertSessionInTenant(session, expectedTenantId);
      }
    }

    if (!query || query.trim().length === 0) {
      throw new ValidationError({
        message: 'Search query must be non-empty',
        details: { field: 'query', constraint: 'non-empty' },
      });
    }

    const topK = clampTopK(input.topK);

    const allowed = await gate.can(userId, 'search', '*');
    if (!allowed) {
      throw permissionDenied(userId, 'search', '*');
    }

    const [queryVector] = await embedder.embed([query.trim()]);
    if (!queryVector) {
      throw new InternalError({
        message: 'Embedder returned no vector for the query',
        details: { reason: 'embedder-empty-result' },
      });
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
