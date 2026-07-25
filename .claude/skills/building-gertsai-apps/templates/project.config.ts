// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// =============================================================================
// project.config.ts — single typed config, parsed ONCE at import time
// =============================================================================
// `dotenv/config` MUST be imported before any process.env read below so a
// local `.env` populates the shell first (mirrors apps/pipeline).
import 'dotenv/config';
import { loadConfig } from './src/utils/project-config';

const config = loadConfig({
  // --- Identity ---
  APP_NAME: 'my-app',           // TODO rename
  APP_VERSION: '0.0.1',
  API_VERSION: 'v1',            // auto-prefixed onto SERVICES short names

  // --- HTTP + broker ---
  WEB_SERVER_PORT: 3000,
  MOLECULER_NAMESPACE: 'my-app',
  // Run-mode enum fields: keep the literal-union type via `as`. Validation
  // happens at the consumption site (the switch in the composition root),
  // NOT here — an invalid env value still type-checks and fails loudly later.
  TRANSPORT_TYPE: 'Local' as 'Local' | 'Redis' | 'NATS',
  REQUEST_TIMEOUT: 30_000,

  // --- The single async-infra gate ---
  // Presence of REDIS_URL turns on: BullMQ queue, channels + workflows
  // middleware, durable rotation store. Empty string = single-process dev.
  REDIS_URL: '',
  NATS_URL: 'nats://localhost:4222',

  // --- Logging + cache ---
  LOG_LEVEL: 'info' as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
  CACHE_TTL: 60,
  CACHE_MAX_ENTRIES: 5_000,
  CACHE_DRIVER: 'memory' as 'memory' | 'redis', // 'redis' requires REDIS_URL

  // --- Workers (BullMQ) ---
  WORKER_CONCURRENCY: 4,
  WORKERS_ENABLED: true,        // 'false'/'0' → producer-only mode

  // --- Run-mode selectors (validated in the composition root) ---
  STORAGE_PROVIDER: 'memory' as 'memory' | 'postgres',
  POSTGRES_URL: '',             // required when STORAGE_PROVIDER='postgres'
  AUTH_GATE: 'allow-all' as 'allow-all' | 'openfga', // refused under NODE_ENV=production
  EMBEDDER_PROVIDER: 'mock' as 'mock' | 'ollama' | 'openai',

  // --- Process env (drives fail-closed gates) ---
  NODE_ENV: 'development',
  // TODO add app-specific fields — type is inferred from the default literal.
});

export type Config = typeof config;
export default config;

// =============================================================================
// src/utils/project-config/index.ts — env overlay with coercion
// =============================================================================
export const loadConfig = <T extends Record<string, string | number | boolean | null>>(
  config: T,
): T => {
  Object.entries(config).forEach(([key, defaultValue]) => {
    if (!(key in process.env)) return; // absent → keep default + its type
    const envVal = process.env[key];
    if (typeof defaultValue === 'boolean') {
      // @ts-ignore — dynamic-key write
      config[key] = envVal === 'true' || envVal === '1';
    } else if (typeof defaultValue === 'number') {
      // @ts-ignore
      config[key] = +envVal!;
    } else {
      // @ts-ignore
      config[key] = envVal;
    }
  });
  return config;
};

// =============================================================================
// src/composition/infrastructure.ts — run-mode selection at the seam
// =============================================================================
import config from '../../project.config';

function pickStores() {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL?.trim()) {
        throw new Error("STORAGE_PROVIDER='postgres' requires POSTGRES_URL to be set.");
      }
      // TODO return your real Postgres-backed adapters
      return { docStore: /* new PgDocumentRepository(...) */ undefined as never };
    }
    case 'memory':
    default:
      // TODO return your in-memory adapters (zero external deps)
      return { docStore: /* new InMemoryRepository(...) */ undefined as never };
  }
}

function pickGate() {
  if (config.AUTH_GATE === 'allow-all' && config.NODE_ENV === 'production') {
    // Fail-closed: demo gate is banned in production (ADR-011 I-12).
    throw new Error("AUTH_GATE='allow-all' is refused under NODE_ENV='production'.");
  }
  // TODO branch allow-all vs openfga
}

// Build the adapter graph ONCE so every service shares instance identity.
export const infrastructure = (() => {
  const stores = pickStores();
  // TODO wire embedder/gate/rotation-store, all gated on config fields
  return { ...stores };
})();

// =============================================================================
// src/observability.ts — opt-in OTel, decoupled from the config object
// =============================================================================
import { setupObservability, type ObservabilityHandle } from '@gertsai/otel';

let handle: ObservabilityHandle | undefined;

export function initObservability(): ObservabilityHandle | undefined {
  if (handle) return handle;
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return undefined; // no-op for local dev
  const samplingRaw = process.env['OTEL_SAMPLING_RATIO'];
  const sampling = samplingRaw !== undefined ? Number(samplingRaw) : 1;
  handle = setupObservability({
    serviceName: 'my-app',       // TODO
    otlpEndpoint: endpoint,
    sampling: Number.isFinite(sampling) ? sampling : 1,
    resource: {
      'service.version': process.env['npm_package_version'] ?? '0.0.0',
      'deployment.environment': process.env['NODE_ENV'] ?? 'development',
    },
  });
  return handle;
}

export async function shutdownObservability(): Promise<void> {
  if (!handle) return;
  const h = handle;
  handle = undefined;
  await h.shutdown();
}

// =============================================================================
// src/index.ts — entrypoint: OTel FIRST, then parse launch params
// =============================================================================
import { initObservability, shutdownObservability } from './observability';
initObservability();          // BEFORE any span-creating import
import './services';          // side-effect: register controllers + lifecycle
import { ApiController } from '@gertsai/api-core/moleculer';
import appConfig from '../project.config';
import brokerConfig from '../moleculer.config';

function parseServicesEnv(): string[] | undefined {
  const raw = process.env.SERVICES;
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  // Short names auto-prefixed with API_VERSION (e.g. "ingest" → "v1.ingest").
  return parts.map((n) => (n.includes('.') ? n : `${appConfig.API_VERSION}.${n}`));
}

async function main(): Promise<void> {
  const enabledServices = parseServicesEnv();
  await ApiController.Start({
    brokerConfig,
    services: [/* TODO mol-services */],
    repl: process.argv.includes('--repl'),
    workersEnabled: appConfig.WORKERS_ENABLED,
    ...(enabledServices !== undefined && { enabledServices }),
  });
}

if (require.main === module) {
  const onSignal = (signal: NodeJS.Signals) => {
    void shutdownObservability().finally(() => process.kill(process.pid, signal));
    process.removeAllListeners(signal);
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  main().catch((err) => { console.error(err); process.exit(1); });
}
export { main };
