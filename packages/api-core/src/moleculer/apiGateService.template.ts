import fingerprint from 'express-fingerprint';
import helmet from 'helmet';
import merge from 'lodash.merge';
import type { ServiceSchema } from 'moleculer';
import Moleculer from 'moleculer';
import type { ApiSettingsSchema, GatewayResponse, IncomingRequest } from 'moleculer-web';
import MoleculerWebMixin from 'moleculer-web';

import type { ActionHandlerResponse } from '../lib';
import {
  OrchestraApiResponse,
  APIError,
  ResponseCode,
  wrapSuccessResponse,
  wrapErrorResponse,
  buildResponsePayload,
  wantsLegacyFormat,
  toBaseResponse,
  extractPackageInfo,
} from '../lib';
// eslint-disable-next-line import/order
import config from '../config';

// import TestService from './mixins/test.mixin';
import { OAuthError } from '../lib/oauth';

import { MX } from './oauth.mixin';
import type { OrchestraApiGateOptions, OrchestraApiRouteSchema } from './types';

/**
 * RFC-030 Feature Flag
 * When enabled, responses use GertsResponse envelope format.
 * Set via environment variable or options.
 */
const USE_GERTS_ENVELOPE = process.env.USE_GERTS_ENVELOPE === 'true';

export const createApiService = (
  options: OrchestraApiGateOptions,
  packageJson: Record<string, unknown>,
): ServiceSchema<ApiSettingsSchema> => {
  // Check if RFC-030 envelope is enabled
  const useGertsEnvelope = options.useGertsEnvelope ?? USE_GERTS_ENVELOPE;

  /**
   * Send response helper - RFC-030 compatible
   */
  const sendResponse = <C extends ResponseCode>(
    res: GatewayResponse,
    orchResponse: OrchestraApiResponse<C>,
    stringify = true,
    req?: IncomingRequest,
  ) => {
    // RFC-030: Use GertsResponse envelope when enabled
    // Note: wantsLegacyFormat safely handles IncomingRequest headers/query types
    if (useGertsEnvelope && !wantsLegacyFormat(req)) {
      return sendGertsResponse(res, orchResponse, stringify, req);
    }

    // Legacy Orchestra format
    return sendLegacyResponse(res, orchResponse, stringify);
  };

  /**
   * RFC-030: Send response in GertsResponse envelope format
   */
  const sendGertsResponse = <C extends ResponseCode>(
    res: GatewayResponse,
    orchResponse: OrchestraApiResponse<C>,
    stringify: boolean,
    req?: IncomingRequest,
  ) => {
    const info = orchResponse.info;

    // Check if it's an error response
    if (!info.success) {
      const gertsError = wrapErrorResponse({
        ctx: res.$ctx,
        orchResponse: toBaseResponse(orchResponse),
        path: req?.url,
      });

      const payload = {
        ...gertsError,
        // Keep _legacy for debugging but don't expose by default
        ...(process.env.NODE_ENV === 'development' ? { _legacy: gertsError._legacy } : {}),
      };

      // Remove internal _legacy field
      delete (payload as Record<string, unknown>)._legacy;

      if (!stringify) {
        return payload;
      }

      // Add X-Request-ID header
      res.setHeader('X-Request-ID', gertsError.request_id);

      return res.writeHead(info.http_code).end(JSON.stringify(payload));
    }

    // Raw response handling (streaming, file downloads)
    if (info.raw) {
      if ('data' in info) {
        if (!stringify) {
          return info.data;
        }
        return res.writeHead(info.http_code).end(info.data);
      }
    }

    // Success response with GertsResponse envelope
    const pkgInfo = extractPackageInfo(packageJson);
    const gertsResponse = wrapSuccessResponse({
      ctx: res.$ctx,
      orchResponse: toBaseResponse(orchResponse),
      path: req?.url,
      packageJson: pkgInfo,
      nodeName: config.MOLECULER_NODE_NAME ?? undefined,
    });

    const payload = buildResponsePayload(gertsResponse, true);

    if (!stringify) {
      return payload;
    }

    // Add response headers
    res.setHeader('X-Request-ID', gertsResponse.id);
    res.setHeader('X-Tenant-ID', gertsResponse.tenant_id);

    return res.writeHead(info.http_code).end(JSON.stringify(payload));
  };

  /**
   * Legacy Orchestra format (backward compatibility)
   */
  const sendLegacyResponse = <C extends ResponseCode>(
    res: GatewayResponse,
    orchResponse: OrchestraApiResponse<C>,
    stringify: boolean,
  ) => {
    const payload = {
      ...orchResponse.info,
      tracking_id: res.$ctx?.id,
      app: {
        name: config.MOLECULER_NODE_NAME,
        node_id: res.$ctx?.nodeID,
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
        return res.writeHead(orchResponse.info.http_code).end(JSON.stringify(payload));
      }
    }

    if (!stringify) {
      return payload;
    }

    return res.writeHead(orchResponse.info.http_code).end(JSON.stringify(payload));
  };

  /**
   * Error handler - RFC-030 compatible
   */
  const sendError = (res: GatewayResponse, err: Error, req?: IncomingRequest) => {
    res.setHeader('Content-Type', 'application/json');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: OrchestraApiResponse<any>;

    if (err instanceof APIError) {
      response = new OrchestraApiResponse(err.code, err.data, {
        message: err.message,
      });
    } else if ((err as { __ORCHESTRA_ERROR__?: boolean }).__ORCHESTRA_ERROR__ === true) {
      const orchErr = err as APIError;
      response = new OrchestraApiResponse(orchErr.code, orchErr.data, {
        message: err.message,
      });
    } else if (
      // Duck typing for MoleculerError - instanceof fails with pnpm due to
      // different moleculer versions installed with different peer deps
      err instanceof Moleculer.Errors.MoleculerError ||
      (typeof (err as { code?: unknown }).code === 'number' &&
        typeof (err as { type?: unknown }).type === 'string' &&
        (err as { retryable?: unknown }).retryable !== undefined)
    ) {
      const moleculerErr = err as Moleculer.Errors.MoleculerError;
      const errorCodeMaps: Record<number, ResponseCode> = {
        429: ResponseCode.TOO_MANY_REQUESTS,
        422: ResponseCode.BAD_REQUEST__INVALID_PARAMS,
        404: ResponseCode.NOT_FOUND__ACTION_NOT_FOUND,
      };

      response = new OrchestraApiResponse(
        errorCodeMaps[moleculerErr.code] ?? ResponseCode.INTERNAL_ERROR,
        moleculerErr.data ?? {},
        {
          message: err.message,
        },
      );
    } else if (err instanceof OAuthError) {
      response = new OrchestraApiResponse(
        ResponseCode[err.name.toUpperCase() as keyof typeof ResponseCode] ??
          ResponseCode.INTERNAL_ERROR,
        (err as OAuthError & { data?: unknown }).data ?? {},
        {
          message: err.message,
        },
      );
    } else if (
      // Duck typing for AuthenticationError/AuthorizationError from @gerts/auth-moleculer
      // These have statusCode: 401 or 403, and type: 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR'
      typeof (err as { statusCode?: number }).statusCode === 'number' &&
      typeof (err as { type?: string }).type === 'string' &&
      ((err as { statusCode?: number }).statusCode === 401 ||
        (err as { statusCode?: number }).statusCode === 403)
    ) {
      const authErr = err as unknown as {
        statusCode: 401 | 403;
        code?: string;
        type: string;
      };
      // Map statusCode to ResponseCode
      const responseCode =
        authErr.statusCode === 401 ? ResponseCode.NOT_AUTHORIZED : ResponseCode.FORBIDDEN;

      response = new OrchestraApiResponse(
        responseCode,
        { code: authErr.code },
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

    return sendResponse(res, response, true, req);
  };

  // Conditionally include OAuth mixin
  const mixins = options.disableAuth ? [MoleculerWebMixin] : [MoleculerWebMixin, MX({})];

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
          key: (req: IncomingRequest) => {
            return (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress;
          },
          handler(req: IncomingRequest, res: GatewayResponse /*, next*/) {
            return sendResponse(
              res,
              new OrchestraApiResponse(ResponseCode.TOO_MANY_REQUESTS),
              true,
              req,
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
          helmet(),
          fingerprint({
            // @ts-expect-error fingerprint parameters have outdated types
            parameters: [fingerprint.useragent, fingerprint.acceptHeaders],
          }),
        ],
        routes: options.routes?.map((route: OrchestraApiRouteSchema) => ({
          ...route,
          onAfterCall: route.rawResponse
            ? undefined // Let moleculer-web handle raw responses
            : (
                ctx: Moleculer.Context,
                req: IncomingRequest,
                res: GatewayResponse,
                _route: unknown,
                { code, data, success, raw }: ActionHandlerResponse<unknown>,
              ) => {
                const orchResponse = new OrchestraApiResponse(
                  (code ?? ResponseCode.SUCCESS) as ResponseCode,
                  data,
                  success ? { success: true, raw } : { raw },
                );
                return sendResponse(res, orchResponse, false, req);
              },
        })),
        onError(req: IncomingRequest, res: GatewayResponse, err: Error) {
          return sendError(res, err, req);
        },
        ...options.settings,
      },
    } as ServiceSchema<ApiSettingsSchema>,
    options,
  );
};
