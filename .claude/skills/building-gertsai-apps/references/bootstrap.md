# Project bootstrap & entrypoint

## What & why

A `@gertsai/*` Moleculer application boots through a strict **3-stage entrypoint
owned by api-core's `ApiController.Start`**, not a raw `new ServiceBroker()`. The
launcher centralizes broker construction so that controller lifecycle handlers —
registered as side effects when controllers are imported — are guaranteed to be
attached **before any action runs**, and so that worker/service enable-flags are
honored uniformly across deploy modes.

The three stages of the m9s-example reference app:

1. **`project.config.ts`** parses env exactly once (immediately after
   `dotenv/config`) into a literal-typed config object. Every env knob carries its
   own default and inferred type; enum-shaped fields use `as 'a' | 'b'` casts to
   keep compile-time-checked unions. The parsed `config` is the single source of
   env truth, imported by `moleculer.config.ts`, `src/index.ts`, and the queue
   lifecycle — no scattered `process.env` reads.

2. **`moleculer.config.ts`** turns that config into a single `BrokerOptions`
   literal: Console logger, `M9sCacheCacher`, env-driven transporter
   (Local/Redis/NATS), `validator: false`, retry policy, circuit-breaker/bulkhead
   off, the Wave 5 tenant/session middleware stack always pushed, and optional
   `@moleculer/channels` + `@moleculer/workflows` pushed only when `REDIS_URL` is
   set. It is a pure `export default brokerConfig` — no function call, no broker
   instance — so both the entrypoint and tests can import it.

3. **`src/index.ts`** initializes OTel first, side-effect-imports `./services`
   (which calls `ApiController.configure(...)` **once** and then imports every
   controller so they self-register), builds the plugin Moleculer services (API
   gateway, OpenAPI, channels), and hands everything to
   `ApiController.Start({ brokerConfig, services, ... })`. The launcher constructs
   the broker, synthesizes one Moleculer service schema per registered
   `ApiController`, and starts the broker. Broker startup is guarded behind
   `require.main === module` so tests can import the entrypoint inertly.

Build is **`tspc`** (ts-patch + typia + transform-paths); dev is **`ts-node-dev`**.

## How it works in m9s-example

### Launcher-owned broker (no raw ServiceBroker)
- **What:** The app never calls `new ServiceBroker()`. `src/index.ts` hands a
  `brokerConfig` + plugin services array to `ApiController.Start({...})`, which
  constructs the broker, generates one Moleculer service schema per registered
  `ApiController`, creates the plugin services, and starts the broker.
- **Why:** Centralizing broker construction guarantees that `ApiController`
  lifecycle handlers (registered as side effects when controllers are imported)
  are attached **before** any action runs, and that worker/service enable-flags
  (`workersEnabled`, `enabledServices`) are honored uniformly across deploy modes.
- **How:** `await ApiController.Start({ brokerConfig, services: [ApiService,
  DocumentEventsChannelService, openApiService], repl: replEnabled,
  workersEnabled, ...(enabledServices && { enabledServices }),
  ...(enabledWorkers && { enabledWorkers }) })`. Import `ApiController` from
  `@gertsai/api-core/moleculer`.

### Side-effect service registration via barrel import
- **What:** `import './services'` (no bindings) triggers `src/services/index.ts`,
  which first calls `ApiController.configure(...)` and then side-effect-imports
  every domain service (`./ingest`, `./search`, `./auth`). Each domain module
  attaches its controller, lifecycle handlers and worker registrations to
  `ApiController`'s static registry as an import side effect.
- **Why:** Decouples registration from the entrypoint — adding a new service is
  just adding an `import './newservice'` line in the barrel; `ApiController.Start`
  later iterates the static `controllers` registry, so the entrypoint needs no
  edit. `configure()` must run before imports so the static config
  (`sessionFactory`, `queue`) is seeded before any `registerWorker` writes into it.
- **How:** Order matters: (1) `ApiController.configure({ sessionFactory, ...queue,
  strictResponseValidation })`, then (2) `import './ingest'; import './search';
  import './auth';`. The entrypoint's `import './services'` sits **above** the
  `import { ApiController } from ...` value imports it depends on.

### Env-once typed config with literal defaults
- **What:** `project.config.ts` imports `dotenv/config` then passes a literal
  object of defaults to `loadConfig(...)`. `loadConfig<T>` overrides any key
  present in `process.env`, coercing by the default's type (boolean: `'true'`/`'1'`;
  number: `Number()`; string: as-is), and returns the same object so each field
  keeps its inferred literal/union type. Enum-shaped fields use `as 'a' | 'b'`
  casts; validation is deferred to consumption sites.
- **Why:** One parse at import time, shared by `moleculer.config.ts`, `index.ts`
  and the queue lifecycle — no scattered `process.env` reads, no re-parsing.
  Literal-union typing gives compile-time safety on enum knobs (`TRANSPORT_TYPE`,
  `STORAGE_PROVIDER`, `AUTH_GATE`) while still allowing runtime env override.
- **How:** `import 'dotenv/config'; const config = loadConfig({ APP_NAME:
  'm9s-example', WEB_SERVER_PORT: 3000, TRANSPORT_TYPE: 'Local' as 'Local' |
  'Redis' | 'NATS', REDIS_URL: '', ... }); export type Config = typeof config;
  export default config;`

### Broker config as a pure module export
- **What:** `moleculer.config.ts` reads `project.config` and builds a single
  `BrokerOptions` literal: Console logger, `M9sCacheCacher` with env-selected
  driver, env-driven transporter (Local/Redis/NATS), `validator: false`, retry
  policy on, circuit-breaker/bulkhead/tracing/metrics off, and a `middlewares[]`
  array that always includes the Wave 5 stack and conditionally pushes channels +
  workflows when `REDIS_URL` is set. It is `export default brokerConfig` — no
  function call, no broker instance.
- **Why:** Keeps config declarative and importable by both the entrypoint and
  tests. `validator: false` is deliberate: api-core validates params via typia
  inside the controller wrapper, so Moleculer's built-in validator would
  double-validate and emit a deprecation warning. Infra-optional features
  (channels/workflows/transporter) gate on env so the example runs single-node
  with zero external deps by default.
- **How:** Build `cacher`, `transporter`, and `middlewares` as module-level
  consts, push `buildWave5Middlewares()` always, push
  `ChannelsMiddleware`/`WorkflowsMiddleware` inside `if (config.REDIS_URL)`, then
  `const brokerConfig: BrokerOptions = { namespace, nodeID:
  `${config.APP_NAME}-${process.pid}`, logger, cacher, transporter, validator:
  false, retryPolicy, middlewares }; export default brokerConfig;`

### Observability-first / graceful-shutdown bookends
- **What:** `initObservability()` is called at the very top of `index.ts` (before
  any span-creating module loads) and is a no-op unless
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set. SIGTERM/SIGINT handlers flush the OTel
  exporter via `shutdownObservability()` then re-raise the signal with default
  disposition. Handlers are only installed when the module is the process
  entrypoint.
- **Why:** The OTel SDK must initialize before instrumented modules load or early
  spans (service registration, broker boot) are lost. Re-raising the signal after
  flush lets the broker observe normal termination. The `require.main === module`
  guard prevents tests that `import { main }` from installing signal traps or
  auto-booting the broker.
- **How:** Top of file: `import { initObservability, shutdownObservability } from
  './observability'; initObservability();` Bottom: `if (require.main === module) {
  installShutdownHandlers(); main().catch(err => { log.error('startup failed', {
  err }); process.exit(1); }); } export { main };`

### Deploy-mode selection by env (SERVICES / WORKERS_ENABLED / WORKERS)
- **What:** The same binary runs as full-node, API-gateway/producer-only, or
  worker-only by parsing `SERVICES` (comma list, short names auto-prefixed with
  `API_VERSION`), `WORKERS_ENABLED` (boolean), and `WORKERS` (queue-name list)
  into the `enabledServices`/`workersEnabled`/`enabledWorkers` args of
  `ApiController.Start`.
- **Why:** Lets one artifact be deployed in different roles without code changes —
  `ApiController.Start` skips controllers not in `enabledServices` and disables
  BullMQ consumption when `workersEnabled` is false (jobs still enqueue).
- **How:** `parseServicesEnv()` maps `ingest` -> `v1.ingest`; pass
  `...(enabledServices !== undefined && { enabledServices })` so undefined means
  'all'. Run e.g. `WORKERS_ENABLED=false SERVICES=ingest pnpm start`.

## Template

```ts
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
```

## Best practices

- Never call `new ServiceBroker(...)` directly — always hand `brokerConfig` +
  plugin services to `ApiController.Start({...})`. The launcher attaches
  controller lifecycle handlers before any action runs and synthesizes a Moleculer
  schema from every registered controller.
- Call `ApiController.configure({ sessionFactory, queue?,
  strictResponseValidation? })` exactly **once**, in the service barrel, **before**
  any domain-service import. `configure()` seeds the static registry that
  `registerWorker` writes into; importing services first loses that config.
- Register services by side-effect import in a single barrel
  (`src/services/index.ts`), then `import './services'` from the entrypoint. Adding
  a service = adding one import line; the entrypoint and `ApiController.Start` never
  change.
- Parse env exactly once via `loadConfig({...literal defaults...})` after
  `import 'dotenv/config'`, and import the resulting `config` everywhere. Do not
  scatter raw `process.env` reads across modules.
- Type enum-shaped config fields with `as 'a' | 'b'` casts on their defaults so
  consumers get compile-time-checked unions, and validate the actual runtime value
  at the consumption site (composition root / `moleculer.config`), not in the
  config module.
- Keep `moleculer.config.ts` a pure `export default brokerConfig` module (a
  literal, not a function call) so it is trivially importable by both the
  entrypoint and tests.
- Set `validator: false` on the broker — api-core already validates params via
  compile-time typia inside its controller wrapper; the built-in Moleculer
  validator would double-validate and emit a 0.14 deprecation warning.
- Initialize OTel (`initObservability()`) at the very top of the entrypoint,
  before any instrumented module loads, and flush it (`shutdownObservability()`)
  inside SIGTERM/SIGINT handlers that re-raise the signal with default disposition.
- Guard broker startup behind `if (require.main === module)` and `export { main }`
  so test files can import the entrypoint without booting the broker or installing
  signal traps.
- Gate infra-optional features (Redis transporter, BullMQ queue,
  `@moleculer/channels`, `@moleculer/workflows`, api-rlr rate limiter) on env
  (`REDIS_URL` / `*_ENABLED`) so the default run is single-node with zero external
  dependencies — the same code path as production, just a different driver.
- Build with `tspc` (ts-patch compiler), not plain `tsc`, and add
  `postinstall: ts-patch install -s` — the typia and typescript-transform-paths
  transforms in tsconfig require the patched compiler. Use `ts-node-dev` for dev so
  the same transform plugins apply at runtime.
- Use a module-scoped `createAppLogger('<module>')` from `@gertsai/logger-factory`
  (redaction default-on) for all boot logging instead of `console.log`, and extend
  `REDACT_KEYS` for app-specific secrets (connection strings, tokens).

## Pitfalls

- **Import-order trap:** if you `import` domain services before calling
  `ApiController.configure(...)`, the `sessionFactory`/`queue` config is unset when
  controllers register their workers, so workers silently use defaults. The barrel
  enforces configure-then-import; do not reorder.
- The entrypoint's `import './services'` must sit **above** the `import {
  ApiController } from '@gertsai/api-core/moleculer'` value import that `main()`
  uses, and the side-effect import must come before `ApiController.Start` — the
  registry must be populated before `Start` iterates it.
- `@moleculer/workflows` and `@moleculer/channels` middlewares are only pushed when
  `REDIS_URL` is set. Without it, `broker.wf` is undefined — any `broker.wf.run(...)`
  call site must null-check, or the action 400s/throws.
- Several broker-config objects need `as unknown as` casts (`M9sCacheCacher` ->
  `Cacher`, channels Redis adapter, workflows middleware) because the pnpm graph
  resolves two structurally-identical-but-nominally-distinct `moleculer` versions.
  This is expected, not a bug — keep the cast narrow and commented.
- `declaration`/`declarationMap` are intentionally **OFF** in `tsconfig.json` —
  m9s-example is a runnable app, not a published library. Turning them on triggers
  TS2742 from typia's `createValidate<T>()` intersection leaking an unnameable
  `@standard-schema/spec` path. Do not re-enable for an app.
- `api.service.ts` does `require(`${process.cwd()}/package.json`)` (cwd-relative,
  not fixed `../../`) because the relative depth differs between `src/`
  (ts-node-dev dev) and `dist/src/` (compiled). A fixed relative require shifts by
  one level after compile.
- boolean env coercion in `loadConfig` only treats `'true'`/`'1'` as true — every
  other string (including `'false'`, `'no'`, `''`) is false. `WORKERS_ENABLED=anything`
  other than `true`/`1` disables workers.
- **CORS and AUTH_GATE fail CLOSED in production:** `CORS_ALLOWED_ORIGINS` unset
  under `NODE_ENV=production` throws at module load, and `AUTH_GATE='allow-all'` is
  refused in production (ADR-011 I-12). A non-prod run silently uses wildcard CORS +
  allow-all auth — do not ship that.
- `HeaderStrategy({ trustProxy: true })` in the Wave 5 tenant middleware trusts the
  inbound `X-Tenant-ID` header — only safe behind a reverse proxy that strips
  client-supplied values (CWE-639). Deploying without that proxy lets any client
  spoof tenant.
- vitest runs with `fileParallelism: false` because Wave 5 broker boots (tenant +
  session middleware + `ApiController` registration) are heavy enough that ~5
  parallel files push individual boots past 30s. Do not flip parallelism on to
  'speed up' tests.
- The default `pnpm test` excludes real-infra suites; only `pnpm test:real-infra`
  (`VITEST_REAL_INFRA=1`) runs them. The exclude glob must list **both** the
  `tests/real-infra/**` directory **and** the sibling `tests/real-infra.test.ts`
  file — a directory-only glob silently runs the file in mock mode.

## Canonical files

All paths are relative to the repo root (`examples/m9s-example/` is the reference
app; `packages/api-core/` holds the source of truth for the launcher).

- `examples/m9s-example/src/index.ts:126-208` — Application entrypoint:
  `initObservability()` first, side-effect `import './services'`, build plugin
  services (api/openapi/channels), `ApiController.Start(...)`, SIGTERM/SIGINT
  graceful shutdown, `require.main === module` guard so tests import without booting.
- `examples/m9s-example/src/services/index.ts:1-108` — Service barrel (side-effect
  module): builds optional BullMQ `queueConfig` from `REDIS_URL`, calls
  `ApiController.configure({ sessionFactory, queue, strictResponseValidation })`
  ONCE before any controller import, then side-effect-imports every domain service
  so they self-register.
- `examples/m9s-example/moleculer.config.ts:309-367` — Broker config factory:
  composes `BrokerOptions` (Console logger, `M9sCacheCacher`, env-driven
  transporter, `validator: false`, retryPolicy, circuit-breaker/bulkhead off,
  Wave 5 middlewares + gated channels/workflows). Exported default, passed verbatim
  to `ApiController.Start`.
- `examples/m9s-example/project.config.ts:58-169` — App config: `import
  'dotenv/config'` then `loadConfig({...literal defaults...})`; every env knob with
  its default + type, exported as default + `Config` type.
- `examples/m9s-example/src/utils/project-config/index.ts:19-44` — `loadConfig<T>()`
  helper: env-var override with boolean/number/string coercion, preserving the
  literal-inferred type of each default.
- `examples/m9s-example/tsconfig.json:1-36` — TS build config: extends repo base,
  `compiler: ts-patch/compiler` for ts-node, typia + typescript-transform-paths
  plugins, declaration off (runnable app), includes `moleculer.config.ts` +
  `project.config.ts`.
- `examples/m9s-example/package.json:8-29` — Scripts: `build`=tspc,
  `dev`=ts-node-dev --repl, `start`=node dist/src/index.js,
  `postinstall`=ts-patch install -s, infra:up/down, migrate:*, test/test:real-infra.
- `examples/m9s-example/vitest.config.ts:28-50` — Test runner config: mock-mode vs
  `VITEST_REAL_INFRA` split, `fileParallelism: false` (broker boots are heavy),
  `GERTSAI_TEST_SESSION_ALLOW` seam env.
- `examples/m9s-example/src/observability.ts:33-68` — OTel SDK wiring:
  `initObservability()` (no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` set) +
  `shutdownObservability()` for graceful flush — called first/last in `index.ts`.
- `examples/m9s-example/src/shared/logger.ts:87-94` — `createAppLogger(moduleName)`
  wraps `@gertsai/logger-factory` `createLogger` with module baseContext + project
  redaction keys; used for boot-time logging.
- `examples/m9s-example/src/mol-services/api.service.ts:124-255` — moleculer-web API
  gateway service built via `createApiService(...)`: CORS allow-list, `/api/v1`
  autoAliases over `v1.**`, optional api-rlr use-chain, SSE route. Passed into
  `ApiController.Start` services array.
- `packages/api-core/src/lib/controller/ApiController.class.ts:248-319` — Source of
  truth for `ApiController.Start({brokerConfig, services, repl, enabledServices,
  workersEnabled, enabledWorkers})` and `ApiController.configure(options)` — `Start`
  owns `new ServiceBroker()` and `generateServiceSchema()` per registered controller.
- `packages/api-core/src/lib/controller/types.ts:101-105` —
  `ApiControllerConfigOptions` type: `{ sessionFactory, queue?,
  strictResponseValidation? }` — the shape `configure()` consumes.

## @gertsai packages used

- `@gertsai/api-core` — `ApiController.Start` / `configure`, `createApiService`,
  `createOpenApiService` (via `/moleculer` subpath).
- `@gertsai/core` — `defaultSession`, `UserType` for `sessionFactory`.
- `@gertsai/m9s-cache` — `MemoryCacheDriver`, `RedisCacheDriver`, `M9sCacheCacher`
  (via `/moleculer` + `/redis` subpaths).
- `@gertsai/logger-factory` — `createLogger`, `consoleBackend`, `LogLevel`
  (module-scoped boot logger).
- `@gertsai/otel` — `setupObservability`, `ObservabilityHandle` (OTel SDK
  init/shutdown).
- `@gertsai/tenant-resolver` — `ChainTenantResolver`, `HeaderStrategy`,
  `tenantMiddleware` (via `/moleculer`).
- `@gertsai/runtime-context` — `sessionMiddleware`, `REQUEST_CONTEXT_LOCALS_KEY`,
  `RequestContext` (via `/moleculer`).
- `@gertsai/tenant` — `asTenantId`, `TenantId` brand applied at the
  request-context boundary.
- `@gertsai/api-rlr` — `RLRMiddleware` (env-gated rate limiter in the gateway
  use-chain).
