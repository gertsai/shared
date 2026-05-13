// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 9 — search form action.
 *
 * Posts the query to `POST /api/v1/search/query` and returns a normalized
 * `{ success, results, query, error? }` shape. The page renders each hit as
 * a card (docId + text snippet + similarity score).
 *
 * Results are intentionally untyped at the call-site (PlaceholderPaths
 * fallback) until Teammate B's snapshot commit lands. The runtime shape is
 * defined by RFC-011 §4.2 + SPEC-019 §3:
 *   { results: Array<{ docId: string; text: string; similarity: number }> }
 */
import type { Actions } from './$types';
import { api } from '$lib/api/client';

export type SearchHit = {
  docId: string;
  text: string;
  similarity: number;
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
      const body = { query, limit: 10 };
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
