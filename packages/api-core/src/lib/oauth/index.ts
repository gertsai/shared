/**
 * @deprecated Use `@gertsai/auth` and `@gertsai/auth-moleculer` instead.
 *
 * This OAuth2 implementation is legacy and will be removed in a future version.
 * For API key authentication, use the new auth packages:
 *
 * @example
 * ```typescript
 * // New approach:
 * import { createApiKeyMiddleware } from '@gertsai/auth-moleculer';
 * import { InMemoryApiKeyStore } from '@gertsai/auth';
 *
 * const store = new InMemoryApiKeyStore();
 * const middleware = createApiKeyMiddleware({ store });
 * ```
 *
 * @see {@link https://github.com/gerts/gerts/packages/auth | @gertsai/auth}
 * @see {@link https://github.com/gerts/gerts/packages/auth-moleculer | @gertsai/auth-moleculer}
 */

import OAuth2Server, {
  OAuthError,
  Request as OAuthRequestOS,
  Response as OAuthResponseOS,
} from 'oauth2-server';

export * from './oauth.class';
export * from './auth-provider';
export { OAuth2Server, OAuthRequestOS, OAuthResponseOS, OAuthError };
