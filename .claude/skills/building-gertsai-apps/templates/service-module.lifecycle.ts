// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// A complete "service module" skeleton for the @gertsai/api-core (Moleculer)
// stack, mirroring examples/m9s-example. Lay it out as:
//
//   src/composition/infrastructure.ts      <- shared adapter singleton
//   src/composition/wave5-middlewares.ts   <- tenant + session broker stack
//   src/lib/example-controller.ts          <- typed resolveController facade
//   src/services/index.ts                  <- top-level barrel + configure()
//   src/services/<svc>/index.ts            <- domain barrel (lifecycle FIRST)
//   src/services/<svc>/lifecycle.ts        <- controller wiring + handlers
//   src/services/<svc>/types.ts            <- ServiceContext + transport DTOs
//   src/services/<svc>/src/index.ts        <- actions + queues barrel
//   src/services/<svc>/src/actions/*.ts    <- defineAction(controller.register)
//   src/services/<svc>/src/queues/*.ts     <- controller.registerWorker
//   src/index.ts                           <- ApiController.Start
// =============================================================================

// ----------------------------------------------------------------------------
// src/lib/example-controller.ts — typed controller facade
// ----------------------------------------------------------------------------
import { ApiController } from '@gertsai/api-core/moleculer';
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

export function resolveExampleController<
  V extends string,
  N extends string,
  S extends ServiceContextBase = ServiceContextBase,
>(version: V, name: N) {
  return ApiController.resolveController<V, N, S>(version, name);
}

// ----------------------------------------------------------------------------
// src/composition/infrastructure.ts — build the adapter graph ONCE
// ----------------------------------------------------------------------------
import config from '../../project.config';
// TODO: import your concrete adapters + the ports they implement
import type { IMyStore } from '../domain/ports/IMyStore';

export interface SharedInfrastructure {
  readonly store: IMyStore;
  // TODO: add embedder / gate / rotationStore / etc.
}

export function buildInfrastructure(): SharedInfrastructure {
  const store = pickStore();
  // TODO: build other adapters via env-driven pick* helpers
  return { store };
}

function pickStore(): IMyStore {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL) throw new Error("STORAGE_PROVIDER='postgres' requires POSTGRES_URL.");
      // TODO: return new PgAdapter({ connectionString: config.POSTGRES_URL });
      throw new Error('TODO: wire postgres adapter');
    }
    case 'memory':
    default:
      // Fail-closed example: refuse demo adapters in production.
      if (config.NODE_ENV === 'production') throw new Error("memory backend refused in production");
      // TODO: return new InMemoryAdapter();
      throw new Error('TODO: wire in-memory adapter');
  }
}

// Module-load singleton — imported by every service lifecycle so they
// observe the SAME instances. Exported separately so tests can build an
// isolated instance via buildInfrastructure().
export const infrastructure: SharedInfrastructure = buildInfrastructure();

// ----------------------------------------------------------------------------
// src/composition/wave5-middlewares.ts — tenant -> session broker stack
// ----------------------------------------------------------------------------
import type { Context } from 'moleculer';
import { ChainTenantResolver, HeaderStrategy, type TenantResolverStrategy } from '@gertsai/tenant-resolver';
import { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';
import { REQUEST_CONTEXT_LOCALS_KEY, sessionMiddleware } from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';
import type { Session } from '@gertsai/session';
import { asTenantId, type TenantId } from '@gertsai/tenant';

export function buildTenantResolver(): TenantResolverStrategy<Context> {
  // SECURITY (CWE-639): trustProxy: true requires a reverse proxy that strips
  // inbound X-Tenant-ID and re-sets it from authenticated context.
  const headerStrategy = new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: true });
  const adapted: TenantResolverStrategy<Context> = {
    name: headerStrategy.name,
    async resolve(ctx) {
      const headers = (ctx.meta as Record<string, unknown>)?.['headers'];
      if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return null;
      return headerStrategy.resolve({ headers: headers as Record<string, string | string[] | undefined> });
    },
  };
  // TODO: production should use mode: 'strict' (the library default, ADR-006 I-18).
  return new ChainTenantResolver<Context>([adapted], { mode: 'optional' });
}

export function buildWave5Middlewares(): readonly unknown[] {
  const resolver = buildTenantResolver();
  // Canonical order (ADR-010 §B): tenant BEFORE session.
  return [tenantMiddleware(resolver), sessionMiddleware({ resolver })];
}

export interface Wave5ContextSnapshot {
  readonly session: Session | undefined;
  readonly expectedTenantId: TenantId | undefined;
}

export function tryGetRequestContextFromCtx(ctx: Context): Wave5ContextSnapshot {
  const locals = (ctx as unknown as { locals?: Record<string, unknown> }).locals;
  const value = locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  // Structural duck-typing, NOT instanceof — tsup bundles a separate
  // RequestContext class per subpath, so instanceof fails cross-subpath.
  if (!value || typeof value !== 'object' || !('sessionOptional' in value) || !('tenantIdOptional' in value)) {
    return { session: undefined, expectedTenantId: undefined };
  }
  const rc = value as RequestContext;
  const raw = rc.tenantIdOptional;
  return {
    session: rc.sessionOptional,
    expectedTenantId: raw !== undefined && raw.length > 0 ? asTenantId(raw) : undefined,
  };
}

// ----------------------------------------------------------------------------
// src/services/<svc>/types.ts — ServiceContext + transport DTOs
// ----------------------------------------------------------------------------
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';
// TODO: import your use case + port types

export interface MyServiceContext extends ServiceContextBase {
  // Fields wired in by the lifecycle handler; seen strongly-typed in handlers.
  // NOTE: addJob / getQueue are NOT declared here — api-core adds them when a
  // queue connection is configured.
  store: IMyStore;
  useCase: /* TODO MyUseCase */ unknown;
}

export interface MyRequest { id: string; /* TODO transport DTO */ }
export interface MyResponse { id: string; /* TODO transport DTO */ }

// ----------------------------------------------------------------------------
// src/services/<svc>/lifecycle.ts — controller wiring + lifecycle handlers
// ----------------------------------------------------------------------------
import { resolveExampleController } from '../../lib/example-controller';
import { infrastructure } from '../../composition/infrastructure';
import type { MyServiceContext } from './types';

const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

// REST routes are already prefixed by the api-gateway route; '/' avoids the
// `v1/myservice/v1/myservice/...` duplication autoAliases would produce.
controller.setRestBasePath('/');

// TODO (only if this service hosts a @moleculer/workflows workflow):
//   setWorkflows(controller as never, { process: createMyWorkflow({ useCase }) });
//   MUST run at module-load — the middleware reads schema.workflows before
//   any addStartedHandler callback fires.

controller.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.myservice] starting...');
  // Stash the SHARED singleton refs so sibling services see the same instances.
  ctx.service.store = infrastructure.store;
  // TODO: ctx.service.useCase = new MyUseCase(infrastructure);
});

controller.addStoppedHandler(async (ctx) => {
  (ctx.service as { _destroyed?: boolean })._destroyed = true; // workers short-circuit mid-shutdown
  ctx.logger?.info('[v1.myservice] stopped.');
});

export { controller };

// ----------------------------------------------------------------------------
// src/services/<svc>/src/actions/my.action.ts — transport-only handler
// ----------------------------------------------------------------------------
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
import typia from 'typia';
import { resolveExampleController as _resolve } from '../../../../lib/example-controller';
import { tryGetRequestContextFromCtx } from '../../../../composition/wave5-middlewares';
import type { MyServiceContext, MyRequest, MyResponse } from '../../types';

const ctl = _resolve<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

export const myAction = defineAction(ctl.register('do', {
  auth: 'none', // TODO: switch to 'required' once a real auth middleware is wired
  rest: 'POST /myservice/do',
  params: typia.createValidate<MyRequest>(),
  response: typia.createValidate<MyResponse>(),
  responseCode: ResponseCode.SUCCESS_CREATED,
  responseMessage: 'Accepted',
  async handler({ params, ctx, service, logger, respond /* , addJob */ }) {
    try {
      const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) assertSessionInTenant(session, expectedTenantId);
      // TODO: const result = await service.useCase.execute({ ...params, session });
      const response: MyResponse = { id: params.id };
      return respond(response, 'Accepted', ResponseCode.SUCCESS_CREATED);
    } catch (err) {
      // Map domain errors to transport here — keep the app layer free of api-core.
      if (err instanceof Error && err.message.startsWith('Domain.')) {
        throw new APIError(ResponseCode.BAD_REQUEST, undefined, err.message);
      }
      throw err;
    }
  },
}));

// ----------------------------------------------------------------------------
// src/services/<svc>/src/queues/my.worker.ts — registered, api-core-owned
// ----------------------------------------------------------------------------
import type { QueueHandlerCtx } from '@gertsai/api-core/moleculer';
import type Moleculer from 'moleculer';
import config from '../../../../../project.config';
import { resolveExampleController as _resolveQ } from '../../../../lib/example-controller';
import type { MyServiceContext } from '../../types';

export const MY_QUEUE_NAME = 'myapp.myservice' as const;
export const JOB_DO = 'do-job' as const;
export interface MyJobData { id: string }

type MyQueueThis = MyServiceContext & Pick<Moleculer.Service, 'logger' | 'broker'>;
const qctl = _resolveQ<'v1', 'myservice', MyServiceContext>('v1', 'myservice');

qctl.registerWorker(MY_QUEUE_NAME, [{
  name: JOB_DO,
  concurrency: config.WORKER_CONCURRENCY,
  // Non-arrow function so `this` binds to the Moleculer service (typed ctx fields).
  async handler(this: MyQueueThis, ctx: QueueHandlerCtx<import('bullmq').Job<MyJobData>>) {
    if ((this as { _destroyed?: boolean })._destroyed === true) return;
    // TODO: return this.useCase.execute(ctx.job.data);
  },
}]);

// ----------------------------------------------------------------------------
// src/services/<svc>/src/index.ts — actions + queues barrel
// ----------------------------------------------------------------------------
// export * from './actions';
// export * from './queues';   // side-effect import registers the worker

// ----------------------------------------------------------------------------
// src/services/<svc>/index.ts — domain barrel (lifecycle FIRST)
// ----------------------------------------------------------------------------
// import './lifecycle';        // MUST be first — registers controller + handlers
// export * from './src';
// export * from './types';

// ----------------------------------------------------------------------------
// src/services/index.ts — top-level barrel: configure() BEFORE imports
// ----------------------------------------------------------------------------
// import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';
// import { defaultSession, UserType } from '@gertsai/core';
// const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL ? { /* connection, ... */ } : undefined;
// ApiController.configure({
//   sessionFactory: ((uid: string, t: UserType) => defaultSession(uid, t, 'api', config.APP_VERSION)) as never,
//   ...(queueConfig && { queue: queueConfig }),
//   strictResponseValidation: process.env.NODE_ENV === 'development',
// });
// import './myservice';        // side-effect imports register all controllers

// ----------------------------------------------------------------------------
// src/index.ts — boot via ApiController.Start (NO `new ServiceBroker`)
// ----------------------------------------------------------------------------
// import './services';
// import { ApiController } from '@gertsai/api-core/moleculer';
// import brokerConfig from '../moleculer.config'; // middlewares: [...buildWave5Middlewares()]
// await ApiController.Start({ brokerConfig, services: [ApiService], workersEnabled: config.WORKERS_ENABLED });
