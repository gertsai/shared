/**
 * Moleculer Broker Configuration — m9s-example.
 *
 * Mirrors `apps/pipeline/moleculer.config.ts` in spirit, but trimmed to keep
 * the example dependency-light (no Postgres, no NATS by default, no OTel).
 *
 * All knobs come from `project.config.ts` so the same env vars steer both
 * the broker and the service-level config (cacher TTL, transport type,
 * worker concurrency, etc.).
 *
 * Choices and rationale:
 *
 *   - `transporter` is selected by `TRANSPORT_TYPE`. Default `null` keeps
 *     the example single-node so it runs without external infra. Set
 *     `TRANSPORT_TYPE=redis` + `REDIS_URL=...` for multi-node demos.
 *
 *   - Caching uses M9sCacheCacher with the in-memory driver from
 *     @gertsai/m9s-cache. Same code-path as production (Redis driver) —
 *     just no external dependency. Cached actions reuse this cacher.
 *
 *   - Retry policy is enabled with reasonable defaults; circuit breaker and
 *     bulkhead are LEFT OFF to keep the example minimal and easy to reason
 *     about. Pipeline shows how to enable them.
 *
 *   - Tracing & metrics disabled — example focuses on hexagonal wiring and
 *     the ApiController-driven service lifecycle.
 *
 * Imported by `src/index.ts` and passed verbatim to `ApiController.Start`.
 */
import type { BrokerOptions, Cacher } from 'moleculer';
import { Errors } from 'moleculer';
import { M9sCacheCacher, MemoryCacheDriver } from '@gertsai/m9s-cache';
import { Middleware as ChannelsMiddleware } from '@moleculer/channels';
import { Middleware as WorkflowsMiddleware } from '@moleculer/workflows';

import config from './project.config';
import { buildWave5Middlewares } from './src/composition/wave5-middlewares';

// ---------------------------------------------------------------------------
// Sprint 3.0.1 audit F-P-6 — design note on the WorkflowsMiddleware import
//
// `@gertsai/api-core/moleculer` exposes a `createMoleculerConfig({workflows})`
// helper that lazy-`require`s `@moleculer/workflows` only when the option is
// set, keeping the package an OPTIONAL peer-dep for consumers that do not
// use workflows. Production consumers SHOULD prefer that path.
//
// This example pins `WorkflowsMiddleware` via static import instead, for
// three deliberate reasons:
//   1. The example demonstrates the alternative (manual middleware injection)
//      so consumers can compare and pick. Both paths are valid.
//   2. `createMoleculerConfig()` is opinionated for the upstream Hub stack
//      (Bunyan + GCP logging, healthcheck middleware, fixed validator/cacher
//      defaults). The example needs a different cacher (`M9sCacheCacher` with
//      memory driver), a custom retry policy, console logger, validator off,
//      and circuit-breaker off — overriding all of those through `merge()`
//      in `optionsOverride` would be noisier than just hand-rolling the
//      config here.
//   3. The example explicitly bundles `@moleculer/workflows` as a regular
//      `dependency` (not a peer-dep) — the lazy-require is a packaging
//      optimisation that does not apply to first-party demo code.
//
// If you are copying THIS file into a real product, replace the static
// import + manual `WorkflowsMiddleware(...)` block below with:
//
//   import { createMoleculerConfig } from '@gertsai/api-core/moleculer';
//   export default createMoleculerConfig(
//     {
//       // any per-product overrides...
//     },
//     {
//       workflows: { eventLogStore: 'redis', redis: { host: ... } },
//     },
//   );
//
// — and drop `@moleculer/workflows` from your direct deps.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cacher: M9sCacheCacher + MemoryCacheDriver
//   The cast is required because Moleculer's `Cacher` type and our class
//   are structurally compatible but not nominal — same pattern as pipeline.
// ---------------------------------------------------------------------------
const cacher: Cacher = new M9sCacheCacher({
  driver: new MemoryCacheDriver({
    enableCleanup: true,
    cleanupIntervalMs: 60_000,
    maxEntries: config.CACHE_MAX_ENTRIES,
  }),
  prefix: config.APP_NAME,
  ttl: config.CACHE_TTL,
  tagPrefix: 'TAG-',
}) as unknown as Cacher;

// ---------------------------------------------------------------------------
// Transporter: Local (null) | Redis | NATS
//
// NOTE: transporter ≠ queue. NATS is for inter-service Moleculer pub/sub;
// the BullMQ queue uses REDIS_URL independently. You can run NATS transport
// AND a Redis-backed queue at the same time (recommended for multi-node).
// ---------------------------------------------------------------------------
const transporter: BrokerOptions['transporter'] =
  config.TRANSPORT_TYPE === 'NATS' && config.NATS_URL
    ? {
        type: 'NATS',
        options: {
          url: config.NATS_URL,
          // Reliability options matching pipeline defaults.
          maxReconnectAttempts: config.NATS_MAX_RECONNECT, // -1 = infinite
          reconnectTimeWait: config.NATS_RECONNECT_WAIT,
        },
      }
    : config.TRANSPORT_TYPE === 'Redis' && config.REDIS_URL
      ? {
          type: 'Redis',
          options: { redis: config.REDIS_URL },
        }
      : null;

// ---------------------------------------------------------------------------
// Middlewares
//
// `@moleculer/workflows` adds a Temporal-like idempotent workflow runtime on
// top of Moleculer. It needs Redis for the event log (replay-after-crash
// semantics rely on a durable journal), so we gate the middleware on
// `REDIS_URL` exactly the way we already gate the BullMQ queue and the
// optional Redis transporter. When `REDIS_URL` is unset, `broker.wf` is
// undefined and any `broker.wf.run(...)` call site must check for that
// (see `services/ingest/src/actions/start-workflow.action.ts`).
//
// `schemaProperty: 'workflows'` is the default — we set it explicitly so
// the contract with workflow services (`wf-ingest`) is visible here.
// `prefix` namespaces all Redis keys to keep parallel installs / shared
// Redis instances separated.
//
// The `as unknown as` cast bypasses a transitive type clash between the two
// `moleculer` versions present in the pnpm graph (one resolved through
// `@gertsai/m9s-cache` with `redlock`, one without). Same structural shape,
// different nominal identity — same pattern we use for `M9sCacheCacher`
// above. At runtime the middleware object is forwarded verbatim into
// `broker.middlewares.add(...)`.
// ---------------------------------------------------------------------------
type BrokerMiddleware = NonNullable<BrokerOptions['middlewares']>[number];
const middlewares: BrokerMiddleware[] = [];

// ---------------------------------------------------------------------------
// Wave 5 middleware stack (Sprint 3.10) — tenantMiddleware → sessionMiddleware.
//
// Canonical order per ADR-010 Decision B + I-14:
//   1. `tenantMiddleware` resolves `X-Tenant-ID` (HeaderStrategy) onto
//      `ctx.meta.tenantId`.
//   2. `sessionMiddleware` composes a `RequestContext` per action call,
//      attaches it to `ctx.locals.requestContext`, and `$freeze()`s before
//      the downstream handler runs (TOCTOU protection per ADR-007 I-16).
//
// SECURITY: HeaderStrategy is constructed with `trustProxy: true` —
// see `src/composition/wave5-middlewares.ts` and the §Wave 5 stack
// reference section of `README.md` for the deployment contract
// (CWE-639 mitigation).
// ---------------------------------------------------------------------------
for (const m of buildWave5Middlewares()) {
  middlewares.push(m as BrokerMiddleware);
}

if (config.REDIS_URL) {
  // ---------------------------------------------------------------------------
  // @moleculer/channels — reliable cross-service messaging (Redis Streams).
  //
  // Adds `broker.sendToChannel(topic, payload, opts?)` for publishing and
  // discovers per-service `channels: { 'topic': { handler, group, ... } }`
  // schema properties for consumers. Provides at-least-once delivery,
  // consumer groups (load balancing across instances), NACK + retry, and
  // optional dead-letter queue. Used in our example to broadcast
  // `m9s-example.document.indexed` after the BullMQ ingest worker
  // completes — independent of the synchronous response path.
  //
  // ChannelsMiddleware is the *default export* (note: workflows uses a
  // named `Middleware` export, hence the slight asymmetry).
  // ---------------------------------------------------------------------------
  // Type cast: @moleculer/channels uses a UNION DeadLetteringOptions type
  // that requires AMQP-specific fields (exchangeName, exchangeOptions...).
  // For Redis Streams those fields are unused. The runtime accepts the
  // simpler { enabled, queueName } shape — same idiom api-core uses.
  middlewares.push(
    ChannelsMiddleware({
      adapter: {
        type: 'Redis',
        options: {
          redis: { host: extractRedisHost(config.REDIS_URL), port: extractRedisPort(config.REDIS_URL) },
          maxRetries: 3,
          deadLettering: { enabled: true, queueName: 'm9s-example:dlq' },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as BrokerMiddleware,
  );

  middlewares.push(
    WorkflowsMiddleware({
      adapter: {
        type: 'Redis',
        options: {
          url: config.REDIS_URL,
          prefix: 'm9s-example:wf:',
        },
      },
      schemaProperty: 'workflows',
    }) as unknown as BrokerMiddleware,
  );
}

// Tiny URL parser — avoids pulling a full URL lib for two integers.
function extractRedisHost(url: string): string {
  const m = url.match(/^redis:\/\/(?:[^@]+@)?([^:/]+)/);
  return m?.[1] ?? '127.0.0.1';
}
function extractRedisPort(url: string): number {
  const m = url.match(/^redis:\/\/(?:[^@]+@)?[^:/]+:(\d+)/);
  return m ? Number(m[1]) : 6379;
}

const brokerConfig: BrokerOptions = {
  namespace: config.MOLECULER_NAMESPACE,
  nodeID: `${config.APP_NAME}-${process.pid}`,

  metadata: {
    example: true,
    version: config.APP_VERSION,
  },

  logger: {
    type: 'Console',
    options: {
      colors: true,
      moduleColors: true,
      formatter: 'short',
      autoPadding: true,
    },
  },
  logLevel: config.LOG_LEVEL,

  transporter,

  cacher,

  serializer: 'JSON',

  // Disable Moleculer's built-in params validator middleware. api-core
  // already validates params via typia (compile-time generated) inside
  // `controller.register`'s wrapper — see `getValidator(action.options.params)`
  // in ApiController.class.ts. Leaving Moleculer's validator on causes a
  // double-validation pass AND emits a 0.14.x deprecation warning
  // ("Validator middleware returning a Function is deprecated…").
  validator: false,

  requestTimeout: config.REQUEST_TIMEOUT,

  retryPolicy: {
    enabled: true,
    retries: 2,
    delay: 200,
    maxDelay: 2_000,
    factor: 2,
    check: (err) => err && err instanceof Errors.MoleculerRetryableError,
  },

  // Circuit breaker / bulkhead intentionally OFF for the example.
  circuitBreaker: { enabled: false },
  bulkhead: { enabled: false },

  // Tracing/metrics disabled — example focuses on hexagonal wiring.
  tracing: { enabled: false },
  metrics: { enabled: false },

  // Workflows middleware (gated on REDIS_URL). When omitted, broker.wf
  // is undefined and the start-workflow action returns 400.
  middlewares,
};

export default brokerConfig;
