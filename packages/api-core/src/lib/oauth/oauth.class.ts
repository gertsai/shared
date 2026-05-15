/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { Context, ServiceBroker, ServiceSchema } from 'moleculer';
import { getAuthProvider, AuthProviderError, AuthErrorCode } from './auth-provider';
import { Service } from 'moleculer';
import type {
  IncomingRequest as Request,
  GatewayResponse as Response,
} from 'moleculer-web';
import type { Client, Falsey, Token } from 'oauth2-server';
import OAuth2Server, {
  InvalidTokenError,
  Request as OAuthRequestOS,
  Response as OAuthResponseOS,
} from 'oauth2-server';

import config from '../../config';
import { ResponseCode } from '../apiResponse';
import { APIError } from '../error';

interface User {
  id: string;

  get(options: { plain: boolean }): User;
}

/**
 * EVID-043 type-safety fix (replaces `@ts-ignore` on `ctx.meta` writes).
 *
 * Moleculer's `Context.meta` is intentionally typed as a loose
 * `Record<string, unknown>` because every service decides what shape to
 * attach. This interface captures the **specific subset** the OAuth module
 * writes into `ctx.meta` after a successful authenticate. It is internal —
 * exported only so downstream code that reads these fields can import the
 * type and avoid duplication.
 *
 * Authentication is the single writer of these fields per the OAuth
 * mixin contract. Callers reading `ctx.meta` SHOULD narrow via
 * `if (typeof ctx.meta.user_uuid === 'string')` rather than casting —
 * we don't enforce single-writer at the type system level.
 *
 * Closes EVID-043 mini-finding: replaces 4 occurrences of `@ts-ignore`
 * on meta writes with a single typed-cast at the helper boundary.
 */
export interface OAuthContextMeta {
  user_uuid: string;
  user_type: string;
}

/**
 * Write authenticated identity into ctx.meta. Single boundary cast.
 *
 * Pulled out as a helper so:
 *   1. The cast lives in ONE place (one `as` annotation, audit-friendly).
 *   2. Both `OAuth.authenticate` and the firebase-auth path in
 *      `MX().methods.authenticate` use the same write path.
 *   3. Future callers (e.g. a new SSO adapter) get a typed entry point.
 */
function setAuthenticatedMeta(
  ctx: Context,
  user: { _uuid: string; type?: string | null | undefined },
): void {
  // The cast widens `Record<string, unknown>` (Moleculer's meta type) to
  // our writeable view. Mutation is sound because Moleculer treats meta
  // as a free-form mutable bag — this is the documented extension point.
  const meta = ctx.meta as Record<string, unknown> & Partial<OAuthContextMeta>;
  meta.user_uuid = user._uuid;
  meta.user_type = user.type ?? 'user';
}

export class OAuthRequest extends OAuthRequestOS {
  constructor(req: Request) {
    super(req);
  }
}

export class OAuthResponse extends OAuthResponseOS {
  constructor(res: Response) {
    super(res);
  }
}

export class OAuth extends Service {
  private oauth: OAuth2Server;
  private _ctx: any;
  private _data: Token | undefined;
  private options: any;

  constructor(options: any, broker: ServiceBroker) {
    super(broker);
    this.oauth = new OAuth2Server({
      // @ts-ignore
      model: {
        getAccessToken: this.getAccessToken.bind(this),
        getClient: this.getClient.bind(this),
        getRefreshToken: this.getRefreshToken.bind(this),
        getUser: this.getUser.bind(this),
        revokeToken: this.revokeToken.bind(this),
        saveToken: this.saveToken.bind(this),
        validateScope: this.validateScope.bind(this),
      },
      grants: ['refresh_token', 'client_credentials', 'password'],
      debug: true,
    });
  }

  get $oauth() {
    return this.oauth;
  }

  set ctx(ctx: any) {
    this._ctx = ctx;
  }

  private async authenticate(
    ctx: Context,
    route: any,
    req: Request,
    res: Response,
  ) {
    const request = new OAuthRequest(req);
    const response = new OAuthResponse(res);
    const token = await this.oauth.authenticate(request, response);
    // EVID-043 Logic C3 fix: null-check `token.user` before dereference.
    // oauth2-server may return a token without a `.user` object (e.g.
    // client-credentials grant in some flows); previous code accessed
    // `token.user._uuid` blindly under `@ts-ignore`, raising
    // `TypeError: Cannot read properties of undefined` at runtime.
    if (!token.user) {
      throw new InvalidTokenError('Token has no associated user');
    }
    const user = token.user as { _uuid?: string; type?: string };
    if (typeof user._uuid !== 'string') {
      throw new InvalidTokenError('Token user is missing _uuid');
    }
    // EVID-043 type-safety fix: replaced two `@ts-ignore` lines with the
    // typed `setAuthenticatedMeta` helper. Single cast in the helper, no
    // suppressions at call sites.
    setAuthenticatedMeta(ctx, { _uuid: user._uuid, type: user.type });
    return token;
  }

  private async authorize(req: Request, res: Response) {
    const request = new OAuthRequest(req);
    const response = new OAuthResponse(res);
    const token = await this.oauth.authorize(request, response);
    return token;
  }

  private async token(request: OAuthRequestOS, response: OAuthResponse) {
    const token = await this.oauth.token(request, response);
    return token;
  }

  // @ts-ignore
  private async getAccessToken(
    bearerToken: string,
  ): Promise<Token | undefined> {
    const [type, base64String] = bearerToken.split(/_/);
    if (!type || !base64String) {
      throw new InvalidTokenError('Invalid type token');
    }
    const decoded = Buffer.from(base64String ?? type, 'base64').toString();
    const [token_uid, target_uid] = decoded.split(/:/);
    if (!token_uid || !target_uid) {
      throw new InvalidTokenError('Invalid type token');
    }
    //@ts-ignore
    const { data } = await this.broker.call('v2.tokens.getOne', {
      token_uid: token_uid,
      target_type: type === 'u' ? 'user' : 'bot',
    });

    if (!data.accessTokenExpiresAt) {
      throw new InvalidTokenError(
        'getAccessToken: accessTokenExpiresAt not found',
      );
    }

    if (
      !(data.accessTokenExpiresAt instanceof Date) &&
      data.accessTokenExpiresAt
    ) {
      data.accessTokenExpiresAt = new Date(data.accessTokenExpiresAt);
    }

    if (data.token?.status === 'revoked') {
      throw new InvalidTokenError('Token is revoked');
    }
    return data;
  }

  private async getClient(
    id: string,
    secret: string,
  ): Promise<Client | undefined> {
    //@ts-ignore
    const { data } = await this.broker.call('v2.applications.getOne', {
      application_uid: id,
      secret: secret,
    });
    return data;
  }

  // EVID-043 Logic C2 fix: these methods were silent stubs returning
  // `undefined` (via `console.log` no-op). When `client_credentials` /
  // `password` / `refresh_token` grants attempt to use them, the oauth2-
  // server library got `undefined` back and surfaced opaque 500s. Now
  // each throws an explicit `Not implemented` error so misuse is loud
  // and developers know what to wire. Remove from `grants` list above
  // or supply a real model implementation before relying on them.
  private async getUser(): Promise<User | undefined> {
    throw new Error(
      'OAuth.getUser is not implemented. Either remove "password" from ' +
        'the grants list (oauth.class.ts:58) or supply a real model.',
    );
  }

  private async revokeToken(): Promise<boolean> {
    throw new Error(
      'OAuth.revokeToken is not implemented. Either remove "refresh_token" ' +
        'from the grants list or supply a real model.',
    );
  }

  private async saveToken(): Promise<Token | undefined> {
    throw new Error(
      'OAuth.saveToken is not implemented. Either remove the affected grant ' +
        'from the grants list or supply a real model.',
    );
  }

  private async getRefreshToken(): Promise<Token | undefined> {
    throw new Error(
      'OAuth.getRefreshToken is not implemented. Either remove "refresh_token" ' +
        'from the grants list or supply a real model.',
    );
  }

  // @ts-ignore - oauth2-server's Falsey type leaks
  private async validateScope(): Promise<string | string[] | Falsey<any> | undefined> {
    throw new Error(
      'OAuth.validateScope is not implemented. Override in subclass or ' +
        'remove scope-checking from the grant flow.',
    );
  }

  public static $mixin(options: any) {
    return {
      created(this: Service) {
        this.oauth = new OAuth(options, this.broker);
        this.logger.info('MixinClass Mixin created');
      },
      started(this: Service) {
        this.logger.info('MixinClass Mixin started');
      },
      stopped(this: Service) {
        this.logger.info('MixinClass Mixin stopped');
      },
      methods: {
        authorize(...args) {
          return this.oauth.authorize(...args);
        },
        // authorize: this.authorize.bind(this),
        // authenticate: this.authenticate.bind(this),
        async authenticate(
          ctx: Context,
          route: any,
          req: Request,
          res: Response,
        ) {
          if (typeof req.headers['x-firebase-auth'] === 'string') {
            const token = req.headers['x-firebase-auth'];

            try {
              if (config.BYPASS_AUTH) {
                // EVID-043 Security C1 fix (CWE-347 Improper Verification of
                // Cryptographic Signature). BYPASS_AUTH decodes the JWT
                // payload via atob() WITHOUT verifying the signature — any
                // production deploy with this env set could be trivially
                // impersonated. Hard-fail at request time if NODE_ENV is
                // production. Local-dev paths can still use this for the
                // m9s-example demo flow.
                if (process.env.NODE_ENV === 'production') {
                  throw new Error(
                    'BYPASS_AUTH is set in production — refusing to skip ' +
                      'JWT signature verification (CWE-347). Unset BYPASS_AUTH ' +
                      'or run without NODE_ENV=production for demo use.',
                  );
                }
                const jwtParts = token.split('.');
                if (jwtParts[1] === undefined) {
                  throw new Error('Invalid JWT format: missing payload segment');
                }
                const tokenData = JSON.parse(atob(jwtParts[1])) as {
                  user_id?: unknown;
                  type?: unknown;
                };
                if (typeof tokenData.user_id !== 'string') {
                  throw new Error('Bypass-decoded JWT missing user_id');
                }
                setAuthenticatedMeta(ctx, {
                  _uuid: tokenData.user_id,
                  type: typeof tokenData.type === 'string' ? tokenData.type : undefined,
                });
                return;
              }

              const authProvider = getAuthProvider();
              const tokenData = await authProvider.verifyIdToken(token);

              if (tokenData?.status === 'active') {
                setAuthenticatedMeta(ctx, {
                  _uuid: tokenData.uid,
                  type:
                    typeof (tokenData as { type?: unknown }).type === 'string'
                      ? (tokenData as { type: string }).type
                      : undefined,
                });
                return;
              }

              throw new APIError(
                ResponseCode.NOT_AUTHORIZED__USER_INACTIVE,
              );
            } catch (err) {
              // Handle AuthProviderError
              if (err instanceof AuthProviderError) {
                switch (err.code) {
                  case AuthErrorCode.TOKEN_EXPIRED:
                    throw new APIError(
                      ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED,
                    );
                  case AuthErrorCode.TOKEN_INVALID:
                    throw new APIError(
                      ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID,
                    );
                }
              }

              // Legacy firebase-admin error handling
              // @ts-ignore
              if (err.errorInfo) {
                // @ts-ignore
                const { code } = err.errorInfo;

                switch (code) {
                  case 'auth/id-token-expired':
                    throw new APIError(
                      ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED,
                    );
                  case 'auth/argument-error':
                    throw new APIError(
                      ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID,
                    );
                }
              }

              if (err instanceof APIError) {
                throw err;
              }
              throw new APIError(ResponseCode.NOT_AUTHORIZED);
            }
          }

          if (typeof req.headers['authorization'] === 'string') {
            return this.oauth.authenticate(ctx, route, req, res);
          }
        },
      },
    } as Partial<ServiceSchema>;
  }
}
