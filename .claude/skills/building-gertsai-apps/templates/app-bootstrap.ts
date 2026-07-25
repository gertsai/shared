// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// ============================================================================
// project.config.ts — app config, parsed once at import time
// ============================================================================
import 'dotenv/config'; // MUST precede any process.env read
import { loadConfig } from './src/utils/project-config'; // loadConfig<T> below

const config = loadConfig({
  // Identity
  APP_NAME: 'my-app',
  APP_VERSION: '0.0.1',
  API_VERSION: 'v1',
  // HTTP gateway
  WEB_SERVER_PORT: 3000,
  // Broker
  MOLECULER_NAMESPACE: 'my-app',
  TRANSPORT_TYPE: 'Local' as 'Local' | 'Redis' | 'NATS',
  REDIS_URL: '',
  NATS_URL: 'nats://localhost:4222',
  REQUEST_TIMEOUT: 30_000,
  LOG_LEVEL: 'info' as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
  CACHE_TTL: 60,
  CACHE_MAX_ENTRIES: 5_000,
  CACHE_DRIVER: 'memory' as 'memory' | 'redis',
  // Workers
  WORKER_CONCURRENCY: 4,
  WORKERS_ENABLED: true,
  NODE_ENV: 'development',
  // TODO: add your own enum/string/number/boolean knobs here.
});
export type Config = typeof config;
export default config;

// ----------------------------------------------------------------------------
// src/utils/project-config/index.ts — env override with type coercion
// ----------------------------------------------------------------------------
export const loadConfig = <T extends Record<string, string | number | boolean | null>>(
  cfg: T,
): T => {
  Object.entries(cfg).forEach(([key, def]) => {
    if (!(key in process.env)) return;
    const v = process.env[key];
    if (typeof def === 'boolean') (cfg as any)[key] = v === 'true' || v === '1';
    else if (typeof def === 'number') (cfg as any)[key] = +v!;
    else (cfg as any)[key] = v;
  });
  return cfg;
};

// ============================================================================
// moleculer.config.ts — BrokerOptions factory (pure module export)
// ============================================================================
import type { BrokerOptions, Cacher } from 'moleculer';
import { Errors } from 'moleculer';
import { MemoryCacheDriver } from '@gertsai/m9s-cache';
import { M9sCacheCacher } from '@gertsai/m9s-cache/moleculer';
import cfg from './project.config';
import { buildWave5Middlewares } from './src/composition/wave5-middlewares'; // tenant -> session

const cacher: Cacher = new M9sCacheCacher({
  driver: new MemoryCacheDriver({ maxEntries: cfg.CACHE_MAX_ENTRIES }),
  prefix: cfg.APP_NAME,
  ttl: cfg.CACHE_TTL,
}) as unknown as Cacher; // structural, not nominal — cast required

const transporter: BrokerOptions['transporter'] =
  cfg.TRANSPORT_TYPE === 'Redis' && cfg.REDIS_URL
    ? { type: 'Redis', options: { redis: cfg.REDIS_URL } }
    : null; // null = single-node, zero external infra

type BrokerMiddleware = NonNullable<BrokerOptions['middlewares']>[number];
const middlewares: BrokerMiddleware[] = [];
// Canonical Wave 5 order: tenantMiddleware -> sessionMiddleware (ADR-010 §B).
for (const m of buildWave5Middlewares()) middlewares.push(m as BrokerMiddleware);
// TODO: if (cfg.REDIS_URL) push ChannelsMiddleware / WorkflowsMiddleware here.

const brokerConfig: BrokerOptions = {
  namespace: cfg.MOLECULER_NAMESPACE,
  nodeID: `${cfg.APP_NAME}-${process.pid}`,
  logger: { type: 'Console', options: { colors: true, formatter: 'short' } },
  logLevel: cfg.LOG_LEVEL,
  transporter,
  cacher,
  serializer: 'JSON',
  // api-core validates params via typia in its controller wrapper —
  // leaving Moleculer's validator on double-validates + warns.
  validator: false,
  requestTimeout: cfg.REQUEST_TIMEOUT,
  retryPolicy: {
    enabled: true, retries: 2, delay: 200, maxDelay: 2_000, factor: 2,
    check: (err) => err && err instanceof Errors.MoleculerRetryableError,
  },
  circuitBreaker: { enabled: false },
  bulkhead: { enabled: false },
  tracing: { enabled: false },
  metrics: { enabled: false },
  middlewares,
};
export default brokerConfig;

// ============================================================================
// src/services/index.ts — side-effect barrel (configure THEN import services)
// ============================================================================
import IORedis from 'ioredis';
import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';
import { defaultSession, UserType } from '@gertsai/core';
import appCfg from '../../project.config';

const queueConfig: BullMQConnectionOptions | undefined = appCfg.REDIS_URL
  ? {
      connection: new IORedis(appCfg.REDIS_URL, {
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck: false,
      }) as unknown as BullMQConnectionOptions['connection'],
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } },
    }
  : undefined;

// configure() MUST run BEFORE any service import — seeds the static registry.
ApiController.configure({
  sessionFactory: ((uuid: string, type: UserType) =>
    defaultSession(uuid, type, 'api', appCfg.APP_VERSION)) as never, // monorepo type quirk
  ...(queueConfig && { queue: queueConfig }),
  strictResponseValidation: process.env.NODE_ENV === 'development',
});

// Each module attaches its controller + lifecycle + workers as a side effect.
import './ingest';
import './search';
// TODO: import every domain service folder here.

// ============================================================================
// src/index.ts — entrypoint
// ============================================================================
import { initObservability, shutdownObservability } from './observability';
initObservability(); // first — before span-creating modules load (no-op if OTEL unset)

import './services'; // side-effect: configure() + register all controllers

import { ApiController, createOpenApiService } from '@gertsai/api-core/moleculer';
import config from '../project.config';
import brokerConfig from '../moleculer.config';
import { createAppLogger } from './shared/logger';
import ApiService from './mol-services/api.service'; // moleculer-web gateway

const log = createAppLogger('my-app');

function parseServicesEnv(): string[] | undefined {
  const raw = process.env.SERVICES;
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.map((n) => (n.includes('.') ? n : `${config.API_VERSION}.${n}`));
}

async function main(): Promise<void> {
  const enabledServices = parseServicesEnv();
  const workersEnabled = config.WORKERS_ENABLED;
  const replEnabled = process.argv.includes('--repl');

  log.info('starting', { appVersion: config.APP_VERSION, port: config.WEB_SERVER_PORT });

  // NO direct `new ServiceBroker(...)` — ApiController.Start owns the broker.
  await ApiController.Start({
    brokerConfig,
    services: [ApiService /* TODO: , openApiService, channelService */],
    repl: replEnabled,
    workersEnabled,
    ...(enabledServices !== undefined && { enabledServices }),
  });
}

function installShutdownHandlers(): void {
  const handler = (signal: NodeJS.Signals): void => {
    log.info('shutdown signal received', { signal });
    void shutdownObservability().finally(() => process.kill(process.pid, signal));
    process.removeAllListeners(signal);
  };
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}

// Guard: only boot when run directly — lets tests `import { main }` inertly.
if (require.main === module) {
  installShutdownHandlers();
  main().catch((err: unknown) => {
    log.error('startup failed', { err });
    process.exit(1);
  });
}
export { main };