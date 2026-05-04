/**
 * Application-level configuration — m9s-example.
 *
 * Mirrors `apps/pipeline/project.config.ts` in spirit but trimmed to what
 * the example actually needs. Parsed once at import time; consumed by
 * `moleculer.config.ts`, `src/index.ts`, and queue lifecycle.
 *
 * Env vars (all optional):
 *
 *   WEB_SERVER_PORT       HTTP port (default: 3000)
 *   MOLECULER_NAMESPACE   broker namespace        (default: 'm9s-example')
 *   TRANSPORT_TYPE        'null' | 'redis' | 'nats'    (default: 'null')
 *   REDIS_URL             redis://host:port — required for 'redis' transport
 *                         AND for BullMQ async queue mode
 *   NATS_URL              nats://host:port — required for 'nats' transport
 *   LOG_LEVEL             fatal|error|warn|info|debug|trace  (default: info)
 *   CACHE_TTL             cacher default TTL seconds          (default: 60)
 *   CACHE_MAX_ENTRIES     in-memory cacher cap                (default: 5_000)
 *   REQUEST_TIMEOUT       Moleculer request timeout ms        (default: 30_000)
 *
 *   WORKER_CONCURRENCY    BullMQ Worker concurrency           (default: 4)
 *   WORKERS_ENABLED       'false'/'0' to start in producer-only mode
 *                         (jobs are still enqueued; workers are not consumed)
 *                         (default: true)
 *
 *   SERVICES              comma-separated list of service short names to load
 *                         e.g. SERVICES=ingest,search; consumed by src/index.ts
 *                         (default: all registered services)
 *   WORKERS               comma-separated list of worker queue names to enable
 *                         e.g. WORKERS=m9s-example.ingest
 *                         (default: all registered workers)
 *
 * Usage:
 *
 *   import config from '../project.config';
 *   broker.namespace = config.MOLECULER_NAMESPACE;
 */

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v: string | undefined, fallback: boolean): boolean => {
  if (v === undefined) return fallback;
  return v.toLowerCase() !== 'false' && v !== '0';
};

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => {
  if (!v) return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
};

const config = {
  // Identity
  APP_NAME: 'm9s-example' as const,
  APP_VERSION: '0.0.1' as const,
  API_VERSION: 'v1' as const,

  // HTTP gateway
  WEB_SERVER_PORT: num(process.env.WEB_SERVER_PORT, 3000),

  // Moleculer broker
  MOLECULER_NAMESPACE: process.env.MOLECULER_NAMESPACE ?? 'm9s-example',
  TRANSPORT_TYPE: oneOf(process.env.TRANSPORT_TYPE, ['null', 'redis', 'nats'] as const, 'null'),
  REDIS_URL: process.env.REDIS_URL ?? '',
  NATS_URL: process.env.NATS_URL ?? '',
  REQUEST_TIMEOUT: num(process.env.REQUEST_TIMEOUT, 30_000),

  // Logging
  LOG_LEVEL: oneOf(
    process.env.LOG_LEVEL,
    ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const,
    'info',
  ),

  // Cacher
  CACHE_TTL: num(process.env.CACHE_TTL, 60),
  CACHE_MAX_ENTRIES: num(process.env.CACHE_MAX_ENTRIES, 5_000),

  // BullMQ workers
  WORKER_CONCURRENCY: num(process.env.WORKER_CONCURRENCY, 4),
  WORKERS_ENABLED: bool(process.env.WORKERS_ENABLED, true),
} as const;

export type Config = typeof config;

export default config;
