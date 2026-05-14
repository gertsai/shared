// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-004) — CMS admin content list + delete.
 *
 * `load`:   reads `?skip=&limit=` from the URL, calls the backend list
 *           action and returns the page window + total + current window
 *           position. Defaults: skip=0, limit=20 (max 100 — server clamps).
 *
 * `actions.delete`: form-action POST submission that calls the backend
 *           delete action. SvelteKit's built-in form-action CSRF guard
 *           (origin check + SameSite cookie) protects the endpoint
 *           without any extra token plumbing.
 *
 * The parent `+layout.server.ts` already redirected anonymous users, so by
 * the time we get here `locals.user` is guaranteed defined.
 */
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiConfig } from '$lib/api/client';

interface DocumentSummary {
  id: string;
  preview: string;
  bytes: number;
  createdAt: string;
}

interface ListResponseBody {
  items: DocumentSummary[];
  total: number;
  skip: number;
  limit: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** api-core envelopes responses under `data`; tolerate either shape. */
function unwrap<T>(body: unknown, isValid: (inner: unknown) => inner is T): T | null {
  if (typeof body !== 'object' || body === null) return null;
  const env = body as Record<string, unknown>;
  const inner = env.data ?? env;
  return isValid(inner) ? inner : null;
}

function isListResponse(inner: unknown): inner is ListResponseBody {
  if (typeof inner !== 'object' || inner === null) return false;
  const r = inner as Record<string, unknown>;
  return Array.isArray(r.items) && typeof r.total === 'number';
}

export const load: PageServerLoad = async ({ url, fetch }) => {
  const rawSkip = Number(url.searchParams.get('skip') ?? '0');
  const rawLimit = Number(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT));
  const skip = Number.isFinite(rawSkip) && rawSkip >= 0 ? Math.floor(rawSkip) : 0;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(MAX_LIMIT, Math.floor(rawLimit))
      : DEFAULT_LIMIT;

  try {
    const res = await fetch(
      `${apiConfig.baseUrl}/api/v1/ingest/list?skip=${skip}&limit=${limit}`,
      {
        method: 'GET',
        headers: { 'X-Tenant-ID': apiConfig.tenantId },
      },
    );
    if (!res.ok) {
      // Surface a benign empty page rather than blowing up the layout —
      // the operator can still see the chrome + sub-nav and retry.
      return {
        items: [] as DocumentSummary[],
        total: 0,
        skip,
        limit,
        loadError: `Backend list rejected (HTTP ${res.status}).`,
      };
    }
    const parsed = unwrap<ListResponseBody>(await res.json(), isListResponse);
    if (parsed === null) {
      return {
        items: [] as DocumentSummary[],
        total: 0,
        skip,
        limit,
        loadError: 'Unexpected list response shape.',
      };
    }
    return {
      items: parsed.items,
      total: parsed.total,
      skip: parsed.skip,
      limit: parsed.limit,
    };
  } catch (err) {
    return {
      items: [] as DocumentSummary[],
      total: 0,
      skip,
      limit,
      loadError: `List request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

export const actions: Actions = {
  delete: async ({ request, fetch }) => {
    const formData = await request.formData();
    const docId = formData.get('docId')?.toString().trim() ?? '';
    if (!docId) {
      return fail(400, { deleteError: 'Missing docId.' });
    }

    try {
      const res = await fetch(`${apiConfig.baseUrl}/api/v1/ingest/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Tenant-ID': apiConfig.tenantId,
        },
        body: JSON.stringify({ docId }),
      });
      if (!res.ok) {
        return fail(res.status, {
          deleteError: `Backend rejected delete (HTTP ${res.status}).`,
          docId,
        });
      }
      return { deleted: true, docId };
    } catch (err) {
      return fail(502, {
        deleteError: `Delete request failed: ${err instanceof Error ? err.message : String(err)}`,
        docId,
      });
    }
  },
};
