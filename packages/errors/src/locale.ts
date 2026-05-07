// SPDX-License-Identifier: Apache-2.0
import type { AppError } from './app-error.js';
import { ErrorKind } from './error-kind.js';

type LocaleCatalog = Partial<Record<ErrorKind, string>>;

const DEFAULT_LOCALE = 'en';

const DEFAULT_EN_CATALOG: Record<ErrorKind, string> = {
  [ErrorKind.VALIDATION]: 'The submitted data is invalid.',
  [ErrorKind.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorKind.UNAUTHORIZED]: 'Authentication is required to access this resource.',
  [ErrorKind.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ErrorKind.CONFLICT]: 'The request conflicts with the current state of the resource.',
  [ErrorKind.RATE_LIMITED]: 'Too many requests. Please try again later.',
  [ErrorKind.INTERNAL]: 'An internal error occurred. Please try again later.',
  [ErrorKind.UPSTREAM_FAILURE]: 'A dependent service is unavailable.',
  [ErrorKind.TIMEOUT]: 'The request timed out.',
  [ErrorKind.BAD_GATEWAY]: 'The gateway returned an invalid response.',
};

const catalogs = new Map<string, LocaleCatalog>([
  [DEFAULT_LOCALE, { ...DEFAULT_EN_CATALOG }],
]);

/**
 * Register a translation catalog for the given locale. Existing entries
 * are merged — later registrations win on key collision.
 */
export function registerErrorLocale(locale: string, catalog: LocaleCatalog): void {
  const existing = catalogs.get(locale) ?? {};
  catalogs.set(locale, { ...existing, ...catalog });
}

/**
 * Resolve a user-friendly message for `error`. Lookup order:
 *   1. Registered catalog for `locale` (if provided + key present)
 *   2. Default English catalog
 *   3. `error.message` (last resort)
 */
export function getUserMessage(error: AppError, locale?: string): string {
  if (locale !== undefined && locale !== DEFAULT_LOCALE) {
    const localeCatalog = catalogs.get(locale);
    if (localeCatalog) {
      const localized = localeCatalog[error.kind];
      if (localized !== undefined) {
        return localized;
      }
    }
  }
  const en = catalogs.get(DEFAULT_LOCALE);
  if (en) {
    const fallback = en[error.kind];
    if (fallback !== undefined) {
      return fallback;
    }
  }
  return error.message;
}
