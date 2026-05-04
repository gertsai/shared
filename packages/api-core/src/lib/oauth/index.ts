/**
 * @deprecated This OAuth2 implementation is legacy and will be removed in a future version.
 * Prefer a dedicated authentication package for new code.
 */

import OAuth2Server, {
  OAuthError,
  Request as OAuthRequestOS,
  Response as OAuthResponseOS,
} from 'oauth2-server';

export * from './oauth.class';
export * from './auth-provider';
export { OAuth2Server, OAuthRequestOS, OAuthResponseOS, OAuthError };
