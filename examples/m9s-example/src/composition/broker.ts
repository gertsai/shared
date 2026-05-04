import type { BrokerOptions, Cacher } from 'moleculer';
import { Errors } from 'moleculer';
import { M9sCacheCacher, MemoryCacheDriver } from '@gertsai/m9s-cache';

/**
 * Build the Moleculer broker config for the example app.
 *
 * Choices and rationale:
 *
 *   - `transporter: null` keeps the example single-node so it runs without
 *     Redis or NATS. Real apps swap this for `Redis`/`NATS` based on env.
 *
 *   - Caching uses M9sCacheCacher with the in-memory driver from
 *     @gertsai/m9s-cache. Same code-path as production (Redis driver) —
 *     just no external dependency. Search results are cached for 60 s
 *     (see action-level `cache.ttl` set by inbound adapters).
 *
 *   - Retry policy is enabled with a reasonable default; circuit breaker
 *     and bulkhead are LEFT OFF to keep the example minimal and easy to
 *     reason about. Pipeline app shows how to enable them.
 */
export function createBrokerConfig(): BrokerOptions {
  // ---------------------------------------------------------------------------
  // Advanced cacher (memory driver) — same package used in production with
  // RedisCacheDriver. The cast is required because Moleculer's `Cacher` type
  // and our M9sCacheCacher class are structurally compatible but not nominal.
  // ---------------------------------------------------------------------------
  const cacher: Cacher = new M9sCacheCacher({
    driver: new MemoryCacheDriver({
      enableCleanup: true,
      cleanupIntervalMs: 60_000,
      maxEntries: 5_000,
    }),
    prefix: 'm9s-example',
    ttl: 60, // seconds — applies when an action enables caching
    tagPrefix: 'TAG-',
  }) as unknown as Cacher;

  return {
    namespace: 'm9s-example',
    nodeID: `m9s-example-${process.pid}`,

    metadata: {
      example: true,
      version: '0.0.1',
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
    logLevel: (process.env.LOG_LEVEL as BrokerOptions['logLevel']) ?? 'info',

    // Single-node, in-process. No external broker required.
    transporter: null,

    cacher,

    serializer: 'JSON',

    requestTimeout: 30_000,

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

    // Tracing/metrics disabled — the example focuses on hexagonal wiring.
    tracing: { enabled: false },
    metrics: { enabled: false },
  };
}
