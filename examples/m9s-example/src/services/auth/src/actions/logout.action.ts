// SPDX-License-Identifier: Apache-2.0
/**
 * Logout Action — `v1.auth.logout` — Wave 10.A demo.
 *
 * No-op by design: JWTs are stateless, so the server has nothing to
 * forget. The SvelteKit `/logout` form action clears the `auth_token`
 * cookie client-side; this endpoint exists purely so a programmatic
 * client can call a symmetric `/logout` for telemetry.
 *
 * A production deployment would add: revoke refresh token in a deny-list,
 * audit-log the logout, optionally clear server-side session state.
 */
import { ResponseCode } from '@gertsai/api-core/contracts';
import typia from 'typia';

import { defineAction } from '@gertsai/api-core/moleculer';
import { resolveExampleController } from '../../../../lib/example-controller';
import type {
  AuthServiceContext,
  LogoutRequest,
  LogoutResponse,
} from '../../types';

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth');

export const logout = defineAction(controller.register('logout', {
  auth: 'none',

  rest: 'POST /auth/logout',

  params: typia.createValidate<LogoutRequest>(),
  response: typia.createValidate<LogoutResponse>(),

  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Logout acknowledged',

  async handler({ logger, respond }) {
    logger.info('[v1.auth.logout] no-op (JWT stateless)');
    const response: LogoutResponse = { ok: true };
    return respond(response, 'Logout acknowledged');
  },
}));
