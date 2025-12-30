import OAuth2Server, {
  OAuthError,
  Request as OAuthRequestOS,
  Response as OAuthResponseOS,
} from 'oauth2-server';

export * from './oauth.class';
export * from './auth-provider';
export { OAuth2Server, OAuthRequestOS, OAuthResponseOS, OAuthError };
