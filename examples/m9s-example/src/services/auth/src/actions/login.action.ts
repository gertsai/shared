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

    logger.info('[v1.auth.login] issued demo token', {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
    });

    const response: LoginResponse = { token, refreshToken, user, expiresAt };
    return respond(response, 'Login successful');
  },
});
