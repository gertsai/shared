// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A hooks composition root.
 *
 * Three teammates own one slot each:
 *   1. localeHandler — i18n (paraglide-js Accept-Language negotiation)
 *   2. authHandler   — JWT cookie verification + protected-route redirect
 *   3. errorHandler  — global error catcher (user-safe messages + logger)
 *
 * Each slot lives in `./hooks/<name>.ts` and exports a typed `Handle`.
 * Order matters: locale must run first so error pages can be localized;
 * auth runs second so locale is already attached to event.locals.
 */
import { sequence } from '@sveltejs/kit/hooks';
import { authHandler } from './hooks/auth';
import { errorHandler } from './hooks/error';
import { localeHandler } from './hooks/locale';

export const handle = sequence(localeHandler, authHandler);

// SvelteKit `handleError` hook — separate from `handle` chain.
export const handleError = errorHandler;
