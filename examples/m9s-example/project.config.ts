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
 *   TRANSPORT_TYPE        'Local' | 'Redis' | 'NATS' (default: 'Local')
 *                         — Local: single-node, no transporter
 *                         — Redis: pub/sub via ioredis
 *                         — NATS:  via nats.js (multi-node, Pylecular-compat)
 *   REDIS_URL             redis://host:port — used for: (a) 'Redis' transport,
 *                                                       (b) BullMQ queue (independent)
 *   NATS_URL              nats://host:port — required for 'NATS' transport
 *   NATS_RECONNECT_WAIT   ms between reconnects (default: 2000)
 *   NATS_MAX_RECONNECT    -1 = infinite (default: -1)
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
 *   EMBEDDER_PROVIDER     'mock' | 'ollama' | 'openai'        (default: 'mock')
 *                         — mock:   deterministic offline hash (no deps)
 *                         — ollama: POST {EMBEDDER_URL}/api/embeddings
 *                         — openai: POST https://api.openai.com/v1/embeddings
 *   EMBEDDER_URL          Ollama base URL                     (default: http://localhost:11434)
 *   EMBEDDER_MODEL        Embedding model tag                 (default: nomic-embed-text)
 *                         — Ollama: 'nomic-embed-text', 'mxbai-embed-large', ...
 *                         — OpenAI: 'text-embedding-3-small', 'text-embedding-3-large'
 *   EMBEDDER_API_KEY      OpenAI API key (required when EMBEDDER_PROVIDER=openai)
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
  TRANSPORT_TYPE: oneOf(
    process.env.TRANSPORT_TYPE,
    ['Local', 'Redis', 'NATS'] as const,
    'Local',
  ),
  REDIS_URL: process.env.REDIS_URL ?? '',
  NATS_URL: process.env.NATS_URL ?? 'nats://localhost:4222',
  NATS_RECONNECT_WAIT: num(process.env.NATS_RECONNECT_WAIT, 2_000),
  NATS_MAX_RECONNECT: num(process.env.NATS_MAX_RECONNECT, -1),
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

  // Rate limiting (@gertsai/api-rlr) — requires REDIS_URL since the store
  // is a Redis-shaped key-value backend. Skipped automatically when
  // REDIS_URL is unset (single-process dev runs without throttling).
  RLR_ENABLED: bool(process.env.RLR_ENABLED, !!process.env.REDIS_URL),
  /** Window in ms (default 60_000 = 1 minute) */
  RLR_TIMEFRAME: num(process.env.RLR_TIMEFRAME, 60_000),
  /** Max requests per window per key */
  RLR_LIMIT: num(process.env.RLR_LIMIT, 100),
  /** Burst (only meaningful for GCRA / token-bucket strategies) */
  RLR_BURST: num(process.env.RLR_BURST, 5),
  /** Strategy: sliding_window | fixed_window | token_bucket | gcra | leaky_bucket */
  RLR_STRATEGY: process.env.RLR_STRATEGY ?? 'gcra',
  /** Redis key prefix to namespace bucket entries */
  RLR_PREFIX: process.env.RLR_PREFIX ?? 'm9s-example:rlr:',

  // Persistent storage selection (Sprint 3.11 W-3-11-7).
  // 'memory' keeps the in-process MemoryVectorStore + DocumentRepository
  // (Sprint 3.4..3.10 path); 'postgres' switches to PgVectorStore +
  // PgDocumentRepository over `@gertsai/pg-client` (Amendment 2 §A2.5/A2.6).
  STORAGE_PROVIDER: oneOf(
    process.env.STORAGE_PROVIDER,
    ['memory', 'postgres'] as const,
    'memory',
  ),
  /** Postgres connection string for STORAGE_PROVIDER='postgres'. */
  POSTGRES_URL: process.env.POSTGRES_URL ?? '',
  /** Run pending migrations at boot (true|false). Default false — explicit `pnpm migrate:up`. */
  MIGRATIONS_AUTO_APPLY: bool(process.env.MIGRATIONS_AUTO_APPLY, false),
  /**
   * Tenant id used by PgDocumentRepository + PgVectorStore in m9s-example
   * (single-tenant per process; production Wave 6+ scopes per request via
   * `@gertsai/runtime-context`). Matches `bootstrap-tuples.yaml` seed.
   */
  TENANT_ID: process.env.TENANT_ID ?? 'tenant-acme',
  /** Owner uuid stamped on documents persisted by m9s-example. */
  DEFAULT_OWNER_UUID: process.env.DEFAULT_OWNER_UUID ?? 'user:default',

  // Embedder selection (composition root in src/composition/infrastructure.ts)
  /** Which IEmbedder adapter to instantiate. */
  EMBEDDER_PROVIDER: oneOf(
    process.env.EMBEDDER_PROVIDER,
    ['mock', 'ollama', 'openai'] as const,
    'mock',
  ),
  /** Ollama daemon base URL (used when EMBEDDER_PROVIDER='ollama'). */
  EMBEDDER_URL: process.env.EMBEDDER_URL ?? 'http://localhost:11434',
  /** Embedding model tag (interpretation depends on the provider). */
  EMBEDDER_MODEL: process.env.EMBEDDER_MODEL ?? 'nomic-embed-text',
  /** OpenAI API key (required when EMBEDDER_PROVIDER='openai'). */
  EMBEDDER_API_KEY: process.env.EMBEDDER_API_KEY,

  // Process environment (used to refuse 'allow-all' gate in production
  // per ADR-011 I-12 fail-closed). Treats anything other than 'production'
  // as non-prod for permissive defaults.
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // Permission gate selection (Sprint 3.11 W-3-11-13). 'allow-all' keeps the
  // demo path; 'openfga' wires `OpenFgaPermissionGate` to the OpenFGA store
  // bootstrapped via `scripts/openfga-bootstrap.ts`. Refused at boot under
  // NODE_ENV='production' (ADR-011 I-12).
  AUTH_GATE: oneOf(
    process.env.AUTH_GATE,
    ['allow-all', 'openfga'] as const,
    'allow-all',
  ),
  /** OpenFGA HTTP endpoint (required when AUTH_GATE='openfga'). */
  FGA_API_URL: process.env.FGA_API_URL ?? 'http://localhost:8080',
  /** OpenFGA store UUID — emitted by `scripts/openfga-bootstrap.ts`. */
  FGA_STORE_ID: process.env.FGA_STORE_ID ?? '',
  /**
   * Pre-shared bearer token for OpenFGA. Currently NOT plumbed through to
   * `@openfga/sdk` — see KNOWN-ISSUES §FGA_API_TOKEN-plumbing for status.
   */
  FGA_API_TOKEN: process.env.FGA_API_TOKEN ?? '',

  // Cacher driver selection (Sprint 3.11 W-3-11-19). 'memory' is the demo
  // default; 'redis' switches `M9sCacheCacher` to `RedisCacheDriver` and
  // requires REDIS_URL. Validated at moleculer.config.ts boot.
  CACHE_DRIVER: oneOf(
    process.env.CACHE_DRIVER,
    ['memory', 'redis'] as const,
    'memory',
  ),
} as const;

export type Config = typeof config;

export default config;
