// SPDX-License-Identifier: Apache-2.0
/**
 * Login Action — `v1.auth.login` — Wave 10.A demo.
 *
 * DEMO-ONLY: accepts ANY email + password and returns a fixed-shape demo
 * user derived from the email hash. There is NO user database, NO password
 * verification, and NO rate limiting. Do NOT use this code path as a
 * template for production authentication.
 *
 * Returns both an access token (15 min, HS256) and a refresh token (24 h)
 * so the SvelteKit client can transparently extend a session without
 * forcing a re-login dialog.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import { demoUserFromEmail, signAccessToken, signRefreshToken } from '../jwt';
import type {
  AuthServiceContext,
  LoginRequest,
  LoginResponse,
} from '../../types';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const login: any = controller.register('login', {
  auth: 'none',

  rest: 'POST /auth/login',

  params: typia.createValidate<LoginRequest>(),
  response: typia.createValidate<LoginResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Login successful',

  async handler({ params, logger, respond }) {
    // EVID-036 audit fix (P0 / U-5): block the "accept-any-credentials"
    // path unless M9S_DEMO_AUTH=true is set. Combined with the JWT_SECRET
    // hard-fail (CI-1), a production deploy without the demo opt-in cannot
    // mint forgeable tokens. Replace this whole handler with a real
    // password / OIDC check before turning the env opt-in on in prod.
    if (process.env.M9S_DEMO_AUTH !== 'true') {
      throw new APIError(
        ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
        undefined,
        'demo login disabled — set M9S_DEMO_AUTH=true to enable the open auth ' +
          'path or replace this action with a real auth handler.',
      );
    }

    const { email, password } = params;

    if (!email || !password) {
      throw new APIError(
        ResponseCode.BAD_REQUEST__INVALID_PARAMS,
        undefined,
        'email and password are required',
      );
    }

    // DEMO: accept any credentials, derive deterministic demo user.
    const user = demoUserFromEmail(email);
    const { token, expiresAt } = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // EVID-036 audit fix (P2 / W-Security-7, CWE-532): log userId + tenantId
    // only — email is PII and the user record is recoverable from the userId
    // in any audit trail.
    logger.info('[v1.auth.login] issued demo token', {
      userId: user.id,
      tenantId: user.tenantId,
    });

    const response: LoginResponse = { token, refreshToken, user, expiresAt };
    return respond(response, 'Login successful');
  },
});
