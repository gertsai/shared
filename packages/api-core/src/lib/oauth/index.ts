/**
 * @deprecated Use `@gerts/auth` and `@gerts/auth-moleculer` instead.
 *
 * This OAuth2 implementation is legacy and will be removed in a future version.
 * For API key authentication, use the new auth packages:
 *
 * @example
 * ```typescript
 * // New approach:
 * import { createApiKeyMiddleware } from '@gerts/auth-moleculer';
 * import { InMemoryApiKeyStore } from '@gerts/auth';
 *
 * const store = new InMemoryApiKeyStore();
 * const middleware = createApiKeyMiddleware({ store });
 * ```
 *
 * @see {@link https://github.com/gerts/gerts/packages/auth | @gerts/auth}
 * @see {@link https://github.com/gerts/gerts/packages/auth-moleculer | @gerts/auth-moleculer}
 */

import OAuth2Server, {
  OAuthError,
  Request as OAuthRequestOS,
  Response as OAuthResponseOS,
} from 'oauth2-server';

export * from './oauth.class';
export * from './auth-provider';
export { OAuth2Server, OAuthRequestOS, OAuthResponseOS, OAuthError };
