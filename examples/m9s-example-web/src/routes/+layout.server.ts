// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — root layout server load.
 *
 * Exposes `event.locals.user` to every page as `data.user`, so any client
 * component can `$page.data.user` to render the email + logout button.
 * Runs after `hooks/auth.ts` populates `locals.user` (or leaves it
 * undefined for anonymous requests).
 */
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
  user: locals.user,
});
