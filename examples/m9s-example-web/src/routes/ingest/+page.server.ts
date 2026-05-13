// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 9 — ingest form action.
 *
 * Reads `docId` + `text` from the submitted form, calls the backend
 * `POST /api/v1/ingest/document` via the typed openapi-fetch client, and
 * returns a `{ success, error?, result? }` shape consumed by the page via
 * `export let form`. The page renders a Toast component bound to the
 * result.
 *
 * Wave 10 will add: progress streaming for large texts, tenant switcher,
 * batch upload. Wave 9 keeps it deliberately minimal — single document,
 * synchronous response.
 */
import type { Actions } from './$types';
import { api } from '$lib/api/client';

type IngestRequestBody = {
  docId: string;
  text: string;
};

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const docId = formData.get('docId')?.toString().trim() ?? '';
    const text = formData.get('text')?.toString() ?? '';

    if (!docId || !text) {
      return {
        success: false as const,
        error: 'Both docId and text are required.',
        docId,
      };
    }

    try {
      // openapi-fetch types: when `paths` is still PlaceholderPaths (Teammate
      // B's snapshot pending), the generic `POST` falls back to a dynamic
      // body shape. Real `paths` will tighten this automatically.
      const body: IngestRequestBody = { docId, text };
      const { data, error } = await api.POST(
        '/api/v1/ingest/document' as never,
        { body } as never,
      );

      if (error) {
        return {
          success: false as const,
          error: `Backend rejected ingest: ${JSON.stringify(error)}`,
          docId,
        };
      }

      return {
        success: true as const,
        result: data ?? { docId },
        docId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false as const,
        error: `Ingest request failed: ${message}`,
        docId,
      };
    }
  },
};
