// SPDX-License-Identifier: Apache-2.0
/**
 * Refresh Action — `v1.auth.refresh` — Wave 10.A + Wave 10.E rotation.
 *
 * Accepts a refresh token issued by `/auth/login` (or a previous refresh)
 * and returns BOTH a new access token AND a new refresh token. The
 * presented refresh token's jti is atomically consumed via the rotation
 * store; if the same jti is presented twice the second call is treated as
 * a reuse signal (stolen-token replay) and we revoke every jti issued to
 * the user, forcing all sessions to re-login.
 *
 * Closes EVID-036 audit finding U-6 (no rotation / no reuse detection).
 *
 * Sticking with HS256 + the same `JWT_SECRET` env var, so the verify
 * surface lives in `jwt.ts`.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import typia from 'typia';

import { defineAction } from '../../../../lib/define-action';
import { resolveExampleController } from '../../../../lib/example-controller';
import { signAccessToken, signRefreshToken, verifyToken } from '../jwt';
import { consumeJti, registerJti, revokeUser } from '../rotation-store';
import type {
  AuthServiceContext,
  RefreshRequest,
  RefreshResponse,
} from '../../types';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

const REFRESH_TTL_SECONDS = 24 * 60 * 60;

export const refresh = defineAction(controller.register('refresh', {
  auth: 'none',

  rest: 'POST /auth/refresh',

  params: typia.createValidate<RefreshRequest>(),
  response: typia.createValidate<RefreshResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Token refreshed',

  async handler({ params, logger, respond }) {
    const claims = verifyToken(params.refreshToken);
    if (claims === null || claims.kind !== 'refresh' || typeof claims.jti !== 'string') {
      logger.warn('[v1.auth.refresh] invalid refresh token');
      throw new APIError(
        ResponseCode.UNAUTHORIZED_REQUEST,
        undefined,
        'Invalid or expired refresh token',
      );
    }

    // Wave 10.E (PRD-022): atomically consume the jti. The store
    // distinguishes three failure modes:
    //   - 'reuse'   → treated as compromise; revoke the user's chain.
    //   - 'expired' → tell the caller to log in fresh (HS256 verify above
    //                 already checks `exp` but the store enforces it again).
    //   - 'unknown' → forged signature OR server restart since issuance;
    //                 either way, no live session corresponds to this jti.
    const consumed = consumeJti(claims.jti);
    if (!consumed.ok) {
      if (consumed.reason === 'reuse') {
        const revoked = revokeUser(claims.sub);
        logger.error('[v1.auth.refresh] reuse detected — revoking user chain', {
          userId: claims.sub,
          jti: claims.jti,
          revokedCount: revoked,
        });
        throw new APIError(
          ResponseCode.UNAUTHORIZED_REQUEST,
          undefined,
          'Refresh token reuse detected — please log in again',
        );
      }
      logger.warn('[v1.auth.refresh] refresh rejected', {
        userId: claims.sub,
        reason: consumed.reason,
      });
      throw new APIError(
        ResponseCode.UNAUTHORIZED_REQUEST,
        undefined,
        'Invalid or expired refresh token',
      );
    }

    const user = { id: claims.sub, email: claims.email, tenantId: claims.tenantId };
    const { token, expiresAt } = signAccessToken(user);
    // Wave 10.E: mint a new refresh token + register its jti BEFORE
    // returning. The previous jti was already flipped to `used` by
    // `consumeJti`, so a stolen copy presented again will trigger the
    // reuse path above.
    const { token: refreshToken, jti } = signRefreshToken(user);
    registerJti(jti, user.id, Math.floor(Date.now() / 1_000) + REFRESH_TTL_SECONDS);

    logger.info('[v1.auth.refresh] rotated tokens', { userId: claims.sub });

    const response: RefreshResponse = { token, refreshToken, expiresAt };
    return respond(response, 'Token refreshed');
  },
}));
