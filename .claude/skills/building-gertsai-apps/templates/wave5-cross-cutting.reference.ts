// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// Wave 5 cross-cutting reference (errors / tenant / runtime-context /
// session-guard / rate-limit). Genericized from m9s-example. Split across the
// files indicated by the // FILE: markers when you adopt it.
// =============================================================================

// -----------------------------------------------------------------------------
// FILE: src/shared/errors.ts  — neutral error kernel (importable by ALL layers)
// -----------------------------------------------------------------------------
export {
  AppError,
  ErrorKind,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  InternalError,
  isAppError,
  wrapUnknownError,
} from '@gertsai/errors';
import { ForbiddenError } from '@gertsai/errors';

/** Domain AuthZ rejection factory — keeps a stable message + details shape. */
export function permissionDenied(
  userId: string,
  action: string,
  resource: string,
): ForbiddenError<{ userId: string; action: string; resource: string }> {
  return new ForbiddenError({
    message: `User '${userId}' is not allowed to '${action}' on '${resource}'`,
    details: { userId, action, resource },
  });
}

// -----------------------------------------------------------------------------
// FILE: src/shared/error-scrubber.ts — HTTP-boundary PII/topology scrubber
// -----------------------------------------------------------------------------
import type { AppError } from '@gertsai/errors';
import {
  appErrorToHttpResponse as _appErrorToHttpResponse,
  type ProblemDetails,
} from '@gertsai/errors/http';
export type { ProblemDetails };

// TODO: list project-specific keys that must NEVER cross the wire.
const HTTP_BOUNDARY_DETAILS_DENYLIST: readonly string[] = Object.freeze([
  'userId',
  'url',
  'originalKind',
] as const);

function scrubDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (details === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (HTTP_BOUNDARY_DETAILS_DENYLIST.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** @gertsai/errors/http already redacts REDACTION_KEYS; this adds app keys. */
export function appErrorToHttpResponse(
  err: AppError,
): { readonly status: number; readonly body: ProblemDetails } {
  const { status, body } = _appErrorToHttpResponse(err);
  const scrubbed = scrubDetails(body.details);
  if (scrubbed === body.details) return { status, body };
  return {
    status,
    body: { ...body, ...(scrubbed !== undefined && { details: scrubbed }) },
  };
}

// -----------------------------------------------------------------------------
// FILE: src/composition/wave5-middlewares.ts — tenant + session pipeline
// -----------------------------------------------------------------------------
import type { Context } from 'moleculer';
import {
  ChainTenantResolver,
  HeaderStrategy,
  type TenantResolverStrategy,
} from '@gertsai/tenant-resolver';
import { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';
import {
  REQUEST_CONTEXT_LOCALS_KEY,
  sessionMiddleware,
} from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';
import type { Session } from '@gertsai/session';

export function buildTenantResolver(): TenantResolverStrategy<Context> {
  // SECURITY (CWE-639): trustProxy:true REQUIRES a reverse proxy that strips
  // client-supplied X-Tenant-ID and re-sets it from authenticated context.
  const headerStrategy = new HeaderStrategy({
    headerName: 'X-Tenant-ID',
    trustProxy: true, // TODO: verify your edge proxy strips inbound header.
  });
  const adapted: TenantResolverStrategy<Context> = {
    name: headerStrategy.name,
    async resolve(ctx) {
      const meta = (ctx.meta ?? {}) as Record<string, unknown>;
      const headersRaw = meta['headers'];
      if (typeof headersRaw !== 'object' || headersRaw === null || Array.isArray(headersRaw)) {
        return null;
      }
      return headerStrategy.resolve({
        headers: headersRaw as Record<string, string | string[] | undefined>,
      });
    },
  };
  // TODO: production should use mode:'strict' (the library default) to
  // fail-closed on missing tenant. 'optional' only for mixed public routes.
  return new ChainTenantResolver<Context>([adapted], { mode: 'optional' });
}

export function buildWave5Middlewares(): readonly unknown[] {
  const resolver = buildTenantResolver();
  // ORDER MATTERS: tenantMiddleware MUST precede sessionMiddleware.
  return [tenantMiddleware(resolver), sessionMiddleware({ resolver })];
}

export interface Wave5ContextSnapshot {
  readonly session: Session | undefined;
  readonly expectedTenantId: string | undefined;
}

/** Project the frozen RequestContext to the additive-optional snapshot. */
export function tryGetRequestContextFromCtx(ctx: Context): Wave5ContextSnapshot {
  const locals = (ctx as unknown as { locals?: Record<string, unknown> }).locals;
  const value = locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  // Duck-type, NOT instanceof — tsup ships a separate class per subpath.
  if (
    value === null ||
    typeof value !== 'object' ||
    !('sessionOptional' in value) ||
    !('tenantIdOptional' in value)
  ) {
    return { session: undefined, expectedTenantId: undefined };
  }
  const rc = value as RequestContext;
  const raw = rc.tenantIdOptional;
  return {
    session: rc.sessionOptional,
    // Empty string collapses to undefined so strict guards fail closed.
    expectedTenantId: raw !== undefined && raw.length > 0 ? raw : undefined,
  };
}

// -----------------------------------------------------------------------------
// FILE: moleculer.config.ts — spread the Wave 5 stack into the broker
// -----------------------------------------------------------------------------
// import { buildWave5Middlewares } from './src/composition/wave5-middlewares';
// type BrokerMiddleware = NonNullable<BrokerOptions['middlewares']>[number];
// const middlewares: BrokerMiddleware[] = [];
// for (const m of buildWave5Middlewares()) middlewares.push(m as BrokerMiddleware);
// // ... push transport / workflow middlewares AFTER the Wave 5 stack.

// -----------------------------------------------------------------------------
// FILE: src/services/<svc>/actions/<name>.action.ts — boundary enforcement
// -----------------------------------------------------------------------------
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
  assertAuthenticated,
  assertSessionInTenant,
} from '@gertsai/session-guard';
import { isAppError } from '@gertsai/errors';
// import { appErrorToHttpResponse } from '../shared/error-scrubber';
// import { tryGetRequestContextFromCtx } from '../composition/wave5-middlewares';

export const exampleAction = defineAction(
  /* controller.register('name', */ {
    auth: 'none', // TODO: switch to 'required' once a real auth middleware lands.
    rest: 'POST /resource',
    async handler({ params, ctx, service, respond }: any) {
      try {
        // 1) Enforce identity + tenant at the boundary, BEFORE any branching.
        const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
        assertAuthenticated(session); // mandatory — never make this conditional
        if (expectedTenantId !== undefined) {
          assertSessionInTenant(session, expectedTenantId);
        }

        // 2) Delegate to the use case (which re-asserts — defense in depth).
        const result = await service.useCase.execute({
          ...params,
          session,
          ...(expectedTenantId !== undefined && { expectedTenantId }),
        });
        return respond(result, 'OK', ResponseCode.SUCCESS_CREATED);
      } catch (err) {
        // 3) Map domain AppError -> transport APIError; scrub PII at the wire.
        if (err instanceof AuthenticationRequiredError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.UNAUTHORIZED_REQUEST, body.details as never, 'Authentication required');
        }
        if (err instanceof TenantScopeViolationError) {
          const { body } = appErrorToHttpResponse(err);
          throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, body.details as never, 'Tenant scope violation');
        }
        if (isAppError(err)) {
          const { body } = appErrorToHttpResponse(err); // catch-all: future AppErrors auto-scrubbed
          throw new APIError(ResponseCode.INTERNAL_ERROR, body.details as never, body.title);
        }
        throw err; // non-AppError -> framework default handler
      }
    },
  },
);

// -----------------------------------------------------------------------------
// FILE: src/application/<Name>UseCase.ts — additive-optional re-assertion
// -----------------------------------------------------------------------------
// import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
// async execute(input: { session?: Session; expectedTenantId?: string; /* ... */ }) {
//   if (input.session !== undefined) {
//     assertAuthenticated(input.session);
//     if (input.expectedTenantId !== undefined) {
//       assertSessionInTenant(input.session, input.expectedTenantId);
//     }
//   }
//   // ... AuthZ gate (throw permissionDenied(...)) then domain work ...
// }

// -----------------------------------------------------------------------------
// FILE: src/mol-services/api.service.ts — rate limiting (separate concern)
// -----------------------------------------------------------------------------
import RLRMiddleware from '@gertsai/api-rlr';
import IORedis from 'ioredis';
// declare const config: any;

const rlrUseChain =
  config.RLR_ENABLED && config.REDIS_URL
    ? [
        RLRMiddleware({
          timeFrame: config.RLR_TIMEFRAME, // ms window, e.g. 60_000
          limit: config.RLR_LIMIT,         // e.g. 100
          burst: config.RLR_BURST,         // e.g. 5 (GCRA token bucket)
          strategy: config.RLR_STRATEGY as any, // 'gcra' | 'sliding_window' | ...
          prefix: config.RLR_PREFIX,       // e.g. 'myapp:rlr:'
          store: () => new IORedis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true }) as any,
          bucketKeyResolver: (req: { headers: Record<string, string | string[] | undefined> }) => {
            const raw = req.headers['x-tenant-id'] ?? req.headers['x-tenant'];
            const tenantId = Array.isArray(raw) ? raw[0] : raw;
            // Format-validate to prevent Redis-key injection / per-id explosion.
            if (tenantId && /^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) return `tenant:${tenantId}`;
            const xff = req.headers['x-forwarded-for'];
            const ip = Array.isArray(xff) ? xff[0] : xff;
            return `ip:${((ip ?? 'unknown').split(',')[0] ?? 'unknown').trim()}`;
          },
        }),
      ]
    : []; // gated on REDIS_URL — empty chain = no throttling in dev.

// settings: { rateLimit: null /* disable built-in so api-rlr is the only pass */, use: rlrUseChain, ... }
