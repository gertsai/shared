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
} as const;

export type Config = typeof config;

export default config;
