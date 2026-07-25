// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
/**
 * <Service> <Action> Action — `v1.<service>.<action>` -> `POST /<service>/<path>`.
 *
 * Thin transport wrapper: validate -> (assert session) -> delegate to use case
 * -> respond. All business logic lives in the application/domain layer; this
 * file only maps domain errors to transport (HTTP) errors.
 */
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { isAppError } from '@gertsai/errors';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import typia from 'typia';

import { resolveExampleController } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import { appErrorToHttpResponse } from '../../../../shared/error-scrubber';
import type {
  // TODO: define these in the service's types.ts (transport contracts, typia-shaped)
  MyServiceContext,
  MyActionRequest,
  MyActionResponse,
} from '../../types';

// One controller per (version, service) — SAME singleton across action +
// lifecycle files. The ServiceContext generic types `ctx.service.<thing>`.
const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>(
  'v1',
  'myservice',
);

export const myAction = defineAction(
  controller.register('myaction', {
    // 'none' so curl works without an OAuth provider in dev; switch to
    // 'required' once a real auth middleware is wired. Omit `rest:` entirely
    // to make the action broker-only (internal); prefix name with `_`.
    auth: 'none',

    // setRestBasePath('/') strips the service-name prefix, so add it here.
    // Object form (with `as any`) only when you need passReqResToParams.
    rest: 'POST /myservice/myaction',

    params: typia.createValidate<MyActionRequest>(),
    response: typia.createValidate<MyActionResponse>(),

    responseCode: ResponseCode.SUCCESS, // or SUCCESS_CREATED for POST-create
    responseMessage: 'Operation succeeded', // MUST be server-controlled (no user input)

    async handler({ params, ctx, service, logger, respond /* , addJob */ }) {
      try {
        // 1. Enforce auth fail-closed BEFORE any side effect.
        const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
        assertAuthenticated(session);
        if (expectedTenantId !== undefined) {
          assertSessionInTenant(session, expectedTenantId);
        }

        // 2. Delegate to the use case — NO business logic here.
        const result = await service.useCase.execute({
          ...params,
          session,
          ...(expectedTenantId !== undefined && { expectedTenantId }),
        });

        // TODO: optional queue branch:
        //   const QUEUE_ENABLED = !!config.REDIS_URL;
        //   if (QUEUE_ENABLED) {
        //     const job = await addJob(QUEUE_NAME, JOB_NAME, payload);
        //     return respond({ ...job.id..., mode: 'queued' }, responseMessage, ResponseCode.SUCCESS_CREATED);
        //   }

        logger.info('[v1.myservice.myaction] done', { /* ids only, no PII */ });
        return respond(result as MyActionResponse);
      } catch (err) {
        // 3. Map domain errors to transport. AppError details are scrubbed
        // (userId/url/originalKind) before crossing the wire; `as never`
        // bridges api-core's error-code ResponseDataType (resolves to never).
        if (err instanceof AuthenticationRequiredError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.UNAUTHORIZED_REQUEST, body.details as never, 'Authentication required');
        }
        if (err instanceof TenantScopeViolationError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, body.details as never, 'Tenant scope violation');
        }
        if (isAppError(err)) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title);
        }
        // Everything else bubbles up to the framework default handler.
        throw err;
      }
    },
  }),
);
