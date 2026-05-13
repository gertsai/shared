// SPDX-License-Identifier: Apache-2.0
/**
 * Refresh Action — `v1.auth.refresh` — Wave 10.A demo.
 *
 * Accepts a refresh token issued by `/auth/login` and returns a new
 * access token. Verifies signature, issuer, and expiry; rejects with
 * 401 on any failure. The refresh token itself is NOT re-issued (no
 * rotating refresh) — a Wave 10.B/C enhancement could add rotation.
 *
 * Sticking with HS256 + the same `JWT_SECRET` env var, so the verify
 * surface lives in `jwt.ts`.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import { signAccessToken, verifyToken } from '../jwt';
import type {
  AuthServiceContext,
  RefreshRequest,
  RefreshResponse,
} from '../../types';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const refresh: any = controller.register('refresh', {
  auth: 'none',

  rest: 'POST /auth/refresh',

  params: typia.createValidate<RefreshRequest>(),
  response: typia.createValidate<RefreshResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Token refreshed',

  async handler({ params, logger, respond }) {
    const claims = verifyToken(params.refreshToken);
    if (claims === null || claims.kind !== 'refresh') {
      logger.warn('[v1.auth.refresh] invalid refresh token');
      throw new APIError(
        ResponseCode.UNAUTHORIZED_REQUEST,
        undefined,
        'Invalid or expired refresh token',
      );
    }

    const { token, expiresAt } = signAccessToken({
      id: claims.sub,
      email: claims.email,
      tenantId: claims.tenantId,
    });

    logger.info('[v1.auth.refresh] re-issued access token', { userId: claims.sub });

    const response: RefreshResponse = { token, expiresAt };
    return respond(response, 'Token refreshed');
  },
});
