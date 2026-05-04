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
    //@ts-ignore
    ctx.meta.user_uuid = token.user._uuid;
    //@ts-ignore
    ctx.meta.user_type = token.user.type || 'user';
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

  // @ts-ignore
  private async getUser(): Promise<User | undefined> {
    console.log('Getting user');
  }

  // @ts-ignore
  private async revokeToken(): Promise<boolean> {
    console.log('Revoking token');
  }

  private async saveToken(): // @ts-ignore
  Promise<Token | undefined> {
    console.log('Saving token');
  }

  // @ts-ignore
  private async getRefreshToken(): Promise<Token | undefined> {
    console.log('Getting refresh token');
  }

  //@ts-ignore
  private validateScope(): Promise<
    // @ts-ignore
    string | string[] | Falsey<any> | undefined
  > {
    console.log('Validating scope');
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
                const tokenData = JSON.parse(atob(token.split('.')[1]));
                // @ts-ignore
                ctx.meta.user_uuid = tokenData.user_id;
                // @ts-ignore
                ctx.meta.user_type = tokenData.type || 'user';
                return;
              }

              const authProvider = getAuthProvider();
              const tokenData = await authProvider.verifyIdToken(token);

              if (tokenData?.status === 'active') {
                // @ts-ignore
                ctx.meta.user_uuid = tokenData.uid;
                // @ts-ignore
                ctx.meta.user_type = tokenData.type || 'user';
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
