// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// 1) GATEWAY SERVICE — src/mol-services/api.service.ts
// =============================================================================
import { createApiService } from '@gertsai/api-core/moleculer';
// import RLRMiddleware from '@gertsai/api-rlr';   // TODO: enable rate limiting
// import IORedis from 'ioredis';
import config from '../../project.config';

// package.json is embedded into the response envelope; resolve relative to cwd
// so it works from both src/ (dev) and dist/ (compiled).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require(`${process.cwd()}/package.json`) as Record<string, unknown>;

// TODO: parse CORS_ALLOWED_ORIGINS into an allow-list; fail-fast in production,
// fall back to '*' (+warn) in non-prod. NEVER ship '*' with credentials:true.
const corsOrigin: readonly string[] | '*' = '*';

// TODO: build your middleware chain. RLR sits BEFORE Moleculer routes.
const useChain: unknown[] = [];

export function createMyApiService() {
  return createApiService(
    {
      name: 'api',
      disableAuth: true, // no-op since Wave 16.A — mount auth in settings.use
      settings: {
        port: Number(process.env.WEB_SERVER_PORT ?? 3000),
        cors: {
          origin: corsOrigin === '*' ? '*' : [...corsOrigin],
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID'],
          credentials: true, // only valid with an explicit origin list, not '*'
        },
        rateLimit: null, // disable moleculer-web's built-in limiter
        use: useChain,
        routes: [
          {
            path: '/api/v1',
            autoAliases: true,            // derive REST paths from action `rest` strings
            whitelist: ['v1.**'],         // ** matches nested action names; security boundary
            authentication: false,
            authorization: false,
            bodyParsers: {
              json: { strict: false, limit: '1MB' },
              urlencoded: { extended: true, limit: '1MB' },
            },
          },
          // TODO: add an /openapi route (whitelist ['v2.openapi.**']) and any
          // raw SSE routes (aliases:{ 'GET stream': handler }, bodyParsers:false).
        ],
      },
    },
    pkg,
  );
}
export default createMyApiService();

// =============================================================================
// 2) TYPED CONTROLLER FACADE — src/lib/example-controller.ts
// =============================================================================
import { ApiController } from '@gertsai/api-core/moleculer';
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

export function resolveExampleController<
  V extends string,
  N extends string,
  S extends ServiceContextBase = ServiceContextBase,
>(version: V, name: N) {
  return ApiController.resolveController<V, N, S>(version, name);
}

// =============================================================================
// 3) SERVICE CONTEXT + TRANSPORT TYPES — src/services/<svc>/types.ts
// =============================================================================
// import type { ServiceContextBase } from '@gertsai/api-core/moleculer';
export interface MyServiceContext extends ServiceContextBase {
  useCase: unknown; // TODO: your application use case, wired by the lifecycle
  // NOTE: do NOT declare addJob/getQueue here — api-core injects them when
  // ApiController.configure({ queue }) is set.
}
export interface MyRequest { /* TODO: typia-validated request shape */ id: string; }
export interface MyResponse { /* TODO: typia-validated response shape */ ok: boolean; }

// =============================================================================
// 4) LIFECYCLE — src/services/<svc>/lifecycle.ts  (import FIRST in index.ts)
// =============================================================================
// import { resolveExampleController } from '../../lib/example-controller';
const lifecycleController = resolveExampleController<'v1', 'mysvc', MyServiceContext>('v1', 'mysvc');
// REST already prefixed by the gateway route (/api/v1); '/' avoids v1/mysvc/v1/mysvc/...
lifecycleController.setRestBasePath('/');
lifecycleController.addStartedHandler(async (ctx) => {
  ctx.logger?.info('[v1.mysvc] starting...');
  ctx.service.useCase = /* TODO: construct from composition root */ {} as unknown;
});
lifecycleController.addStoppedHandler(async (ctx) => {
  ctx.logger?.info('[v1.mysvc] stopped.');
});
export { lifecycleController };

// =============================================================================
// 5) ACTION — src/services/<svc>/src/actions/my.action.ts
// =============================================================================
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import typia from 'typia';
// import { resolveExampleController } from '../../../../lib/example-controller';

const actionController = resolveExampleController<'v1', 'mysvc', MyServiceContext>('v1', 'mysvc');

export const myAction = defineAction(actionController.register('do', {
  auth: 'none', // TODO: 'required' once a real auth middleware is mounted
  rest: 'POST /mysvc/do', // method + path; auto-prefixed and exposed by autoAliases
  params: typia.createValidate<MyRequest>(),
  response: typia.createValidate<MyResponse>(),
  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Done',
  async handler({ params, ctx, service, logger, respond /*, addJob */ }) {
    logger.info('[v1.mysvc.do] received', { id: params.id });
    try {
      // TODO: call your application use case — keep this handler pure transport.
      const result = await (service.useCase as { execute(p: MyRequest): Promise<MyResponse> }).execute(params);
      return respond(result, 'Done');
    } catch (err) {
      // TODO: map known domain errors to APIError; re-throw the rest so the
      // gateway's onError maps them to ResponseCode.INTERNAL_ERROR.
      if (err instanceof Error && err.message.startsWith('Validation.')) {
        throw new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, undefined, err.message);
      }
      throw err;
    }
  },
}));

// =============================================================================
// 6) COMPOSITION ROOT — src/services/index.ts  (configure ONCE, then import)
// =============================================================================
// import { ApiController } from '@gertsai/api-core/moleculer';
ApiController.configure({
  // TODO: sessionFactory: (uid, type) => defaultSession(uid, type, 'api', version)
  // ...(queueConfig && { queue: queueConfig }),
  strictResponseValidation: process.env.NODE_ENV === 'development',
});
// Side-effect imports register controllers + lifecycle + workers (lifecycle first):
// import './mysvc';

// =============================================================================
// 7) BOOTSTRAP — src/index.ts
// =============================================================================
// import './services';                                   // register everything
// import { ApiController } from '@gertsai/api-core/moleculer';
// import brokerConfig from '../moleculer.config';
// import ApiService from './mol-services/api.service';
async function main(): Promise<void> {
  await ApiController.Start({
    brokerConfig: {} as never, // TODO: import from ../moleculer.config
    services: [/* ApiService, openApiService, ...plain moleculer services */],
    repl: process.argv.includes('--repl'),
    workersEnabled: true, // false => API-gateway/producer-only mode
    // ...(enabledServices && { enabledServices }),
  });
}
if (require.main === module) {
  main().catch((err: unknown) => { console.error(err); process.exit(1); });
}
export { main };
