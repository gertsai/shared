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

import config from './project.config';

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
};

export default brokerConfig;
