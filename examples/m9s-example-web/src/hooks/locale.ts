// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — Teammate C (m9s-i18n-paraglide).
 *
 * Server-side locale negotiation for every request:
 *   1. Cookie `lang` (explicit user choice, set by future locale switcher)
 *   2. `Accept-Language` header (RFC 7231 q-value negotiation, simplified)
 *   3. Fallback to paraglide `sourceLanguageTag` ('en')
 *
 * The resolved locale is attached to `event.locals.locale` (typed in app.d.ts)
 * AND fed into paraglide's `setLanguageTag()` so any server-rendered `m.*()`
 * call in load functions / form actions emits localized strings.
 *
 * Runs FIRST in `sequence(localeHandler, authHandler)` so subsequent handlers
 * (auth redirects, error pages) see the correct locale.
 */
import type { Handle } from '@sveltejs/kit';
import {
  availableLanguageTags,
  setLanguageTag,
  sourceLanguageTag,
  type AvailableLanguageTag,
} from '$lib/i18n';

const SUPPORTED: ReadonlySet<string> = new Set(availableLanguageTags);

function isSupported(tag: string): tag is AvailableLanguageTag {
  return SUPPORTED.has(tag);
}

/**
 * Parse Accept-Language header and return first supported tag.
 *
 * Accepts forms like `ru,en;q=0.9,en-US;q=0.8`. We split on comma, strip
 * q-values, lowercase, take the primary subtag (so `en-US` → `en`), and
 * return the first match against `availableLanguageTags`.
 *
 * No external negotiation lib — keeps the dependency footprint minimal and
 * the logic auditable.
 */
function parseAcceptLanguage(header: string | null): AvailableLanguageTag | null {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((part) => part.trim().split(';')[0]?.trim().toLowerCase() ?? '')
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.split('-')[0] ?? tag);
  for (const tag of candidates) {
    if (isSupported(tag)) return tag;
  }
  return null;
}

function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): AvailableLanguageTag {
  if (cookieValue && isSupported(cookieValue)) return cookieValue;
  const fromHeader = parseAcceptLanguage(acceptLanguage);
  if (fromHeader) return fromHeader;
  // sourceLanguageTag is statically 'en' from paraglide config; cast is safe.
  return sourceLanguageTag as AvailableLanguageTag;
}

export const localeHandler: Handle = ({ event, resolve }) => {
  const cookieValue = event.cookies.get('lang');
  const acceptLanguage = event.request.headers.get('accept-language');
  const locale = resolveLocale(cookieValue, acceptLanguage);

  event.locals.locale = locale;
  setLanguageTag(locale);

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', locale),
  });
};
