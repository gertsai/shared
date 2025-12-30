import fingerprint from 'express-fingerprint';
import helmet from 'helmet';
import merge from 'lodash.merge';
import type { ServiceSchema } from 'moleculer';
import Moleculer from 'moleculer';
import type {
  ApiSettingsSchema,
  GatewayResponse,
  IncomingRequest,
} from 'moleculer-web';
import MoleculerWebMixin from 'moleculer-web';

import type { ActionHandlerResponse } from '../lib';
import { OrchestraApiResponse, OrchestraError, ResponseCode } from '../lib';
// eslint-disable-next-line import/order
import config from '../config';

// import TestService from './mixins/test.mixin';
import { OAuthError } from '../lib/oauth';

import { MX } from './oauth.mixin';
import type { OrchestraApiGateOptions, OrchestraApiRouteSchema } from './types';

export const createApiService = (
  options: OrchestraApiGateOptions,
  packageJson: Record<string, any>,
): ServiceSchema<ApiSettingsSchema> => {
  // Send response helper
  const sendResponse = (
    res: GatewayResponse,
    orchResponse: OrchestraApiResponse<any>,
    stringify = true,
  ) => {
    const payload = {
      ...orchResponse.info,
      tracking_id: res.$ctx.id,
      app: {
        name: config.MOLECULER_NODE_NAME,
        node_id: res.$ctx.nodeID,
        package: packageJson.name,
        version: packageJson.version,
      },
    };

    if (payload.raw) {
      if ('data' in payload) {
        if (!stringify) {
          return payload.data;
        }
        return res.writeHead(orchResponse.info.http_code).end(payload.data);
      }

      if ('errors' in payload) {
        if (!stringify) {
          return payload.errors;
        }
        return res
          .writeHead(orchResponse.info.http_code)
          .end(JSON.stringify(payload));
      }
    }

    if (!stringify) {
      return payload;
    }

    return res
      .writeHead(orchResponse.info.http_code)
      .end(JSON.stringify(payload));
  };

  const sendError = (res: GatewayResponse, err: Error) => {
    res.setHeader('Content-Type', 'text/json');

    let response: OrchestraApiResponse<any>;

    if (err instanceof OrchestraError) {
      response = new OrchestraApiResponse(err.code, err.data, {
        message: err.message,
      });
      // @ts-ignore
    } else if (err.__ORCHESTRA_ERROR__ === true) {
      // @ts-ignore
      response = new OrchestraApiResponse(err.code, err.data, {
        message: err.message,
      });
    } else if (err instanceof Moleculer.Errors.MoleculerError) {
      const errorCodeMaps = {
        429: ResponseCode.TOO_MANY_REQUESTS,
        422: ResponseCode.BAD_REQUEST__INVALID_PARAMS,
        404: ResponseCode.NOT_FOUND__ACTION_NOT_FOUND,
      };

      response = new OrchestraApiResponse(
        errorCodeMaps[err.code as keyof typeof errorCodeMaps] ??
          ResponseCode.INTERNAL_ERROR,
        err.data ?? {},
        {
          message: err.message,
        },
      );
    } else if (err instanceof OAuthError) {
      response = new OrchestraApiResponse(
        ResponseCode[err.name.toUpperCase() as keyof typeof ResponseCode] ??
          ResponseCode.INTERNAL_ERROR,
        // @ts-ignore
        err.data ?? {},
        {
          message: err.message,
        },
      );
    } else {
      response = new OrchestraApiResponse(
        ResponseCode.INTERNAL_ERROR,
        {},
        {
          message: err.message,
        },
      );
    }

    return sendResponse(res, response);
  };

  // Conditionally include OAuth mixin
  const mixins = options.disableAuth
    ? [MoleculerWebMixin]
    : [MoleculerWebMixin, MX({})];

  return merge(
    {
      version: options.version,
      name: options.name,
      mixins,
      settings: {
        host: '0.0.0.0',
        port: 3000,
        logRequestParams: 'debug',
        logResponseData: 'debug',
        path: '/',
        etag: true,
        optimizeOrder: true,
        server: true,
        rateLimit: {
          window: 60 * 1000,
          limit: 30,
          headers: true,
          key: (req) => {
            return req.headers['x-forwarded-for'] ?? req.socket.remoteAddress;
          },
          handler(req: IncomingRequest, res: GatewayResponse /*, next*/) {
            return sendResponse(
              res,
              new OrchestraApiResponse(ResponseCode.TOO_MANY_REQUESTS),
            );
          },
        },
        cors: {
          origin: config.ALLOWED_ORIGINS,
          methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
          optionsSuccessStatus: 200,
          credentials: true,
        },
        use: [
          ...(options.settings?.use ?? []),
          // @ts-ignore
          helmet(),
          // @ts-ignore
          fingerprint({
            // @ts-ignore
            parameters: [fingerprint.useragent, fingerprint.acceptHeaders],
          }),
        ],
        routes: options.routes?.map((route: OrchestraApiRouteSchema) => ({
          ...route,
          // onBeforeCall(ctx: Context, route: any, req: any, res: any) {
          //   //@ts-ignore
          //   ctx.meta.request = new OAuthRequest(req);
          //   //@ts-ignore
          //   ctx.meta.response = new OAuthResponse(res);
          // },
          onAfterCall: route.rawResponse
            ? undefined // Let moleculer-web handle raw responses
            : (
                ctx: Moleculer.Context,
                req: IncomingRequest,
                res: GatewayResponse,
                _route: unknown,
                { code, data, success, raw }: ActionHandlerResponse<any>,
              ) => {
                return sendResponse(
                  res,
                  new OrchestraApiResponse(
                    code as ResponseCode,
                    data,
                    success
                      ? {
                          success: true,
                          raw,
                        }
                      : { raw },
                  ),
                  false,
                );
              },
        })),
        onError(req: IncomingRequest, res: GatewayResponse, err: Error) {
          return sendError(res, err);
        },
        ...options.settings,
      },
    } as ServiceSchema<ApiSettingsSchema>,
    options,
  );
};
