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
 *
 * Wave 12.E-fix-2 Phase 2 (EVID-053 H-13) — `as never` casts dropped now
 * that `paths` mirrors backend reality (CRIT-4). The `SearchHit` /
 * `SearchQueryResponse` types are re-exported from the api-types package
 * so the frontend and backend share a single source of truth.
 */
import type { Actions } from './$types';
import type { SearchHit, SearchQueryResponse } from '@gertsai-examples/m9s-example-api-types';
import { api } from '$lib/api/client';

// Re-export the canonical SearchHit so the +page.svelte consumer keeps
// importing from this server module (no `$types`-style coupling shift).
export type { SearchHit };

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const query = formData.get('query')?.toString().trim() ?? '';

    if (!query) {
      return {
        success: false as const,
        error: 'Enter a query to search.',
        query,
        results: [] as readonly SearchHit[],
      };
    }

    try {
      // Wave 12.E-fix-1 FR-017: backend reads `topK`, not `limit`.
      const body = { query, topK: 10 };
      const { data, error } = await api.POST('/api/v1/search/query', { body });

      if (error) {
        return {
          success: false as const,
          error: `Backend rejected search: ${JSON.stringify(error)}`,
          query,
          results: [] as readonly SearchHit[],
        };
      }

      // Wave 12.E-fix-2 Phase 2: `data` is now `SearchQueryResponse | undefined`
      // courtesy of the typed `paths`. Defensive narrowing kept so a future
      // backend shape regression surfaces as `results: []` rather than a
      // page crash.
      const responseData: Partial<SearchQueryResponse> = data ?? {};
      const results: readonly SearchHit[] = Array.isArray(responseData.results)
        ? responseData.results
        : [];

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
        results: [] as readonly SearchHit[],
      };
    }
  },
};
