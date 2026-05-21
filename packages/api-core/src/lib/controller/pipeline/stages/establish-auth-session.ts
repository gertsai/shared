// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 6 — auth check + session creation.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 6).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:757-773.
 */

import { APIError } from '../../../error';
import { ResponseCode } from '../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Stage 6 — auth check + session creation.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:757-773.
 *
 * Behaviour (per SPEC-021 §Stage 6):
 * - If `action.options.auth === 'required'` AND `!ctx.meta.user_uuid`:
 *   log error + throw `APIError(NOT_AUTHORIZED)`
 * - If `user_uuid` + `user_type` present AND auth is `'required'` or `'optional'`:
 *   call `sessionFactory` and store session in returned context
 * - Otherwise: session stays `undefined`
 *
 * SPEC-021 I-6: Auth check (fail-fast) runs BEFORE session factory to ensure
 * unauthorized requests never instantiate a session.
 *
 * @param ctx  - Incoming pipeline context
 * @param deps - Pipeline dependencies (action auth config + sessionFactory)
 * @returns Updated `PipelineContext` with optional `session` populated
 * @throws `APIError(NOT_AUTHORIZED)` when auth is required but no user in meta
 */
export async function establishAuthSession(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  const { action, logger, sessionFactory } = deps;
  const { meta } = ctx.ctx;

  if (action.options.auth === 'required' || action.options.auth === 'optional') {
    if (action.options.auth === 'required' && !meta.user_uuid) {
      logger?.error(
        'Cannot call an action with required authorization. No user found in meta',
        action,
      );

      throw new APIError(ResponseCode.NOT_AUTHORIZED);
    }

    if (meta.user_uuid && meta.user_type) {
      if (!sessionFactory) {
        throw new Error(
          'establishAuthSession: PipelineDeps.sessionFactory is required when action.options.auth is "required" or "optional"',
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = sessionFactory(meta.user_uuid, meta.user_type as any);
      return { ...ctx, session };
    }
  }

  return ctx;
}
