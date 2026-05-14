// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.B (PRD-019 FR-004) — admin route-group server guard.
 *
 * Runs BEFORE any child page load. Server-side redirect (302) ensures the
 * browser never paints a partial admin page for an anonymous user
 * (NFR-1 — defence against flash-of-protected-content).
 *
 * Anonymous user → 302 `/login?next=<current-url>` so the login flow can
 * round-trip the user back to the originally-requested admin page once a
 * valid session lands. (The Wave 10.A `/login` form currently redirects
 * to `/` unconditionally; this `next=` query param is captured here for
 * future enrichment and is also asserted by the e2e spec.)
 */
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
  if (!locals.user) {
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    throw redirect(302, `/login?next=${next}`);
  }
  return { user: locals.user };
};
