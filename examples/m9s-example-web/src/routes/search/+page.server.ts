// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 9 — search form action.
 *
 * Posts the query to `POST /api/v1/search/query` and returns a normalized
 * `{ success, results, query, error? }` shape. The page renders each hit as
 * a card (docId + chunk index + text snippet + score).
 *
 * Wave 12.E-fix-1 (PRD-038 FR-003 / EVID-053 CRIT-3) — backend handler
 * actually returns `{ docId, chunkIdx, text, score }` per `services/search/
 * types.ts:53-60` + `domain/chunk.ts:22-27`. The pre-fix code declared
 * `{ docId, text, similarity }` and the page rendered `hit.similarity.toFixed(3)`
 * which crashed at runtime because the field doesn't exist on the wire.
 * The `as never` casts that masked this drift are kept ONLY where openapi-fetch
 * paths typing isn't aligned yet (FR-018 follow-up).
 */
import type { Actions } from './$types';
import { api } from '$lib/api/client';

export type SearchHit = {
  docId: string;
  chunkIdx: number;
  text: string;
  score: number;
};

type SearchResponseBody = {
  results: SearchHit[];
};

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const query = formData.get('query')?.toString().trim() ?? '';

    if (!query) {
      return {
        success: false as const,
        error: 'Enter a query to search.',
        query,
        results: [] as SearchHit[],
      };
    }

    try {
      // Wave 12.E-fix-1 FR-017: backend reads `topK`, not `limit`.
      const body = { query, topK: 10 };
      const { data, error } = await api.POST(
        '/api/v1/search/query' as never,
        { body } as never,
      );

      if (error) {
        return {
          success: false as const,
          error: `Backend rejected search: ${JSON.stringify(error)}`,
          query,
          results: [] as SearchHit[],
        };
      }

      // Wave 9: backend response shape is contractually `{ results: SearchHit[] }`
      // per SPEC-019. With PlaceholderPaths this is structurally untyped — narrow
      // it locally so the page consumer remains type-safe.
      const responseData = (data ?? {}) as Partial<SearchResponseBody>;
      const results = Array.isArray(responseData.results) ? responseData.results : [];

      return {
        success: true as const,
        results,
        query,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false as const,
        error: `Search request failed: ${message}`,
        query,
        results: [] as SearchHit[],
      };
    }
  },
};
