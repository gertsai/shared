# Configuration & run modes

## What & why

m9s-example centralizes **all** configuration in a single typed
`project.config.ts` that is parsed **once at import time**. A tiny
`loadConfig()` helper (mirrored from the upstream `apps/pipeline`) overlays
`process.env` onto literal defaults with string/number/boolean coercion, and
`import 'dotenv/config'` runs first so a local `.env` populates the shell
before any env read happens.

Run modes are **NOT** separate config files — they are selected by
env-var-driven branches at the **consumption sites**:

- `moleculer.config.ts` picks the transporter (Local / Redis / NATS) and the
  cacher driver (memory / Redis).
- `src/composition/infrastructure.ts` picks storage, embedder, auth-gate and
  rotation-store adapters.
- `src/observability.ts` opt-in OTel.
- `src/index.ts` parses the `SERVICES` / `WORKERS` launch params.

The same config object steers **both** the Moleculer broker and the
application (composition) graph, so there is no per-call re-read drift. A small
set of key gates — `REDIS_URL`, `STORAGE_PROVIDER`, `AUTH_GATE`,
`EMBEDDER_PROVIDER`, `TRANSPORT_TYPE` — flip the app between dependency-free
local dev and a full Postgres + Redis + OpenFGA + NATS + Ollama cluster.

## How it works in m9s-example

### Single typed config object, parsed once at import time

- **What** — All knobs live in `project.config.ts` as a flat object of literal
  defaults passed through `loadConfig()`. Run-mode fields use inline
  `as 'a' | 'b'` casts to keep a literal-union type. `export type Config =
  typeof config` gives every consumer a fully-typed view; `export default
  config` is imported everywhere.
- **Why** — One place to read every tunable. Type inference flows from the
  defaults, so adding a field auto-types it. Reading once at import time
  guarantees the broker and the application graph observe the **same** values
  (no per-call re-read drift).
- **How** —
  `const config = loadConfig({ WEB_SERVER_PORT: 3000, TRANSPORT_TYPE: 'Local' as 'Local'|'Redis'|'NATS', ... }); export type Config = typeof config; export default config;`.
  Consumers do `import config from '../project.config'` and read `config.FIELD`.

### Env overlay with coercion (loadConfig)

- **What** — A ~25-line generic
  `loadConfig<T extends Record<string, string|number|boolean|null>>(config: T): T`
  iterates entries; if `key in process.env`, it coerces by the **default's**
  runtime type (boolean: `'true'`/`'1'` → `true`; number: `+envVal`; string
  verbatim) and overwrites in place. Absent keys keep their default.
- **Why** — 12-factor config without a schema library. The default's type is
  the coercion oracle, so `WORKER_CONCURRENCY: 4` parses `'8'` as a number
  automatically. Validation is deferred to consumption sites so an invalid env
  still type-checks here and surfaces a clear runtime error downstream.
- **How** — Pair `import 'dotenv/config'` (must precede the `loadConfig` call)
  with `loadConfig({...defaults})`. Enum-shaped strings type-check but are
  validated at the `pick*()` switch sites, not in `loadConfig`.

### Env-driven run-mode selection at consumption sites (pick* + ternaries)

- **What** — Run modes are chosen by branching on config fields where the
  dependency is constructed: `pickStores()` switch on `STORAGE_PROVIDER`,
  `pickEmbedder()` switch on `EMBEDDER_PROVIDER`, `pickGate()` switch on
  `AUTH_GATE`, transporter ternary on `TRANSPORT_TYPE`, cacher driver branch on
  `CACHE_DRIVER`. Each branch validates its required companion env
  (`POSTGRES_URL`, `FGA_STORE_ID`, `EMBEDDER_API_KEY`) and throws an Error
  naming the missing var.
- **Why** — Keeps the config file declarative (no logic) and concentrates
  wiring decisions at the composition root (the one place that knows concrete
  adapters). Adopters swap memory→postgres or allow-all→openfga by flipping one
  env var, no code change.
- **How** —
  `switch (config.STORAGE_PROVIDER) { case 'postgres': if (!config.POSTGRES_URL) throw new Error('...requires POSTGRES_URL'); return new PgDocumentRepository({...}); case 'memory': default: return new DocumentRepository(...); }`.
  The composition root builds the graph **once** as a module-level
  `export const infrastructure = buildInfrastructure()` so both services share
  instance identity.

### REDIS_URL as the single async-infra gate

- **What** — The presence/absence of `REDIS_URL` is the master switch for async
  features: BullMQ queue (else inline fallback), `@moleculer/channels`
  middleware, `@moleculer/workflows` middleware, `RedisRotationStore` (else
  in-memory), and the Redis transporter. All gate on
  `if (config.REDIS_URL && config.REDIS_URL.trim().length > 0)`.
- **Why** — A single, predictable toggle moves the app between zero-dependency
  single-process dev and durable multi-node operation. Adopters do not learn
  five separate flags — one URL turns on the whole async stack.
- **How** —
  `if (config.REDIS_URL) { middlewares.push(ChannelsMiddleware(...)); middlewares.push(WorkflowsMiddleware(...)); }`;
  rotation store:
  `if (config.REDIS_URL?.trim()) return new RedisRotationStore(new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null }));`.
  Note the Redis **transporter** ALSO needs `TRANSPORT_TYPE=Redis` — `REDIS_URL`
  alone only enables queue / channels / workflows.

### Opt-in observability, decoupled from the config object

- **What** — OTel is wired through env vars read **directly** from
  `process.env` (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SAMPLING_RATIO`) in
  `observability.ts`, **NOT** through `project.config`. `initObservability()`
  returns `undefined` when the endpoint is unset; it is the **first** import in
  `index.ts` so spans during broker boot are captured; `shutdownObservability()`
  flushes on SIGTERM/SIGINT. It is idempotent.
- **Why** — OTel SDKs are optional/lazy peer-deps — local dev pays nothing.
  Reading env directly keeps the OTel surface out of the typed config and
  avoids forcing every adopter to declare the OTLP fields. Init-before-everything
  is required so module-load spans are not dropped.
- **How** — Top of entrypoint:
  `import { initObservability, shutdownObservability } from './observability'; initObservability();`
  **BEFORE** `import './services'`. Inside:
  `setupObservability({ serviceName, otlpEndpoint, sampling, resource: { 'service.version', 'deployment.environment' } })`
  from `@gertsai/otel`.

### Env-inlined run-mode npm scripts

- **What** — Run modes are codified as `package.json` scripts that inline env
  vars: `dev:cluster` = `TRANSPORT_TYPE=NATS REDIS_URL=... NATS_URL=... ts-node-dev src/index.ts`;
  `start` runs compiled `dist`; `dev` / `dev:no-repl` toggle the REPL;
  `infra:up` / `infra:down` drive docker compose; `migrate:*` run the migration
  runner; `test:real-infra` sets `VITEST_REAL_INFRA=1`.
- **Why** — Makes the canonical run modes discoverable and one-command without
  memorizing env combinations. Mirrors `apps/pipeline` 1:1 so deployment
  commands transfer.
- **How** —
  `"dev:cluster": "TRANSPORT_TYPE=NATS REDIS_URL=redis://localhost:6379 NATS_URL=nats://localhost:4222 ts-node-dev --debounce 1500 src/index.ts"`.
  Ad-hoc overrides still work: `EMBEDDER_PROVIDER=ollama pnpm dev:no-repl`.

## Template

```ts
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
```

## Best practices

- Put **every** knob in `project.config.ts` and read it once at import time —
  never scatter `process.env.X` reads through business logic. Direct
  `process.env` reads are reserved for the OTel opt-in
  (`OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SAMPLING_RATIO`) and the
  `SERVICES` / `WORKERS` launch params parsed in `index.ts`.
- Import `'dotenv/config'` as the very first line of `project.config.ts`,
  before any `loadConfig` call — otherwise `.env` values are not yet in
  `process.env` when defaults are overlaid.
- Type run-mode fields with inline `as 'a' | 'b'` casts so consumers get a
  literal union, but **validate** the value at the consumption switch (the
  `pick*()` functions / transporter ternary), not in `loadConfig`. Each branch
  should throw a clear Error naming the missing companion var (e.g.
  `"STORAGE_PROVIDER='postgres' requires POSTGRES_URL"`).
- Build the adapter graph **once** as a module-level
  `export const infrastructure = buildInfrastructure()` so all services share
  instance identity — per-service `new XStore()` produces independent stores in
  one process and silently breaks cross-service reads.
- Gate the whole async stack (queue, channels, workflows, durable rotation
  store) on a single `if (config.REDIS_URL)` so adopters flip dev↔durable with
  one var. Remember the Redis **transporter** additionally needs
  `TRANSPORT_TYPE=Redis`; `REDIS_URL` alone only enables queue/channels/workflows.
- Initialize OTel as the **first** import in the entrypoint (before
  `import './services'`) so spans created during broker boot/service
  registration are captured; make `initObservability()` a no-op when the
  endpoint env is unset and flush via `shutdownObservability()` on
  SIGTERM/SIGINT.
- Enforce fail-closed config in production: `pickGate()` throws when
  `AUTH_GATE='allow-all'` under `NODE_ENV='production'` (ADR-011 I-12). Mirror
  this for any demo-only default that must not ship.
- Wrap the logger factory once (`src/shared/logger.ts`) with a `LOG_LEVEL`
  override and a project `REDACT_KEYS` list unioned onto the built-in
  `REDACTION_KEYS` — this is where you close CWE-532 gaps for credential-bearing
  vars like `POSTGRES_URL` / `REDIS_URL` whose key names don't match the
  defaults.
- Codify canonical run modes as env-inlined npm scripts (`dev:cluster`,
  `infra:up`, `migrate:up`, `test:real-infra`) so they are discoverable and
  one-command, while still allowing ad-hoc `VAR=x pnpm dev` overrides.
- Keep a committed `.env.example` with placeholder credentials documenting the
  full toggle matrix; keep `.env` gitignored. Make required secrets
  (`JWT_SECRET`) have **no** silent fallback so a misconfigured deploy fails at
  boot rather than running insecure.

## Pitfalls

- `loadConfig` coerces by the **default's** runtime type — if you give a
  numeric field a string default, env values stay strings; if a boolean
  default, any value other than `'true'`/`'1'` becomes `false` (so
  `WORKERS_ENABLED=no` and `WORKERS_ENABLED=false` both disable). Set the
  default to the correctly-typed literal.
- `loadConfig` does **no** validation of enum values — `TRANSPORT_TYPE=Reddis`
  type-checks and silently falls through to the `null` (Local) branch. Errors
  only surface at the consumption switch, and only if that branch actually
  validates. Confirm each `pick*` has an explicit guard.
- The composition-root singleton
  (`export const infrastructure = buildInfrastructure()`) runs its `pick*()`
  switches at **module-load time**. A missing
  `POSTGRES_URL` / `FGA_STORE_ID` / `EMBEDDER_API_KEY` throws during import —
  the broker never starts and the stack trace points at the import, not
  `main()`. This is intentional fail-fast, but surprises adopters expecting
  lazy init.
- `REDIS_URL` vs `TRANSPORT_TYPE` are independent: setting only `REDIS_URL`
  enables the BullMQ queue + channels + workflows but does **not** switch the
  Moleculer transporter (that needs `TRANSPORT_TYPE=Redis`). Conversely
  `TRANSPORT_TYPE=NATS` + `REDIS_URL` is the valid cluster combo (NATS for
  pub/sub, Redis for queue).
- OTel config is read from `process.env` directly inside `observability.ts`,
  **NOT** from `project.config.ts`. Adding `OTEL_*` to `project.config` will
  not wire it up — and if you move OTel init **after** `import './services'`
  you will drop all boot-time spans.
- `CACHE_DRIVER='redis'` and the Redis rotation store each construct their
  **own** ioredis client with `maxRetriesPerRequest: null` (deliberately
  separate from the broker/queue clients to avoid back-pressure). Reusing one
  shared client across all of them re-introduces the coupling these separate
  clients exist to avoid.
- The default `.env.example` ships the **full-infra** profile
  (`STORAGE_PROVIDER=postgres`, `AUTH_GATE=openfga`, `EMBEDDER_PROVIDER=ollama`,
  `REDIS_URL` set) — copying it verbatim requires `docker compose up` +
  migrations + openfga bootstrap. For a zero-dependency boot you must override
  back to memory/allow-all/mock and unset `REDIS_URL`. Do **NOT** copy
  `STORAGE_PROVIDER=memory` / `AUTH_GATE=allow-all` / `MockEmbedder` into
  production (README §Do NOT copy).
- `HeaderStrategy({ trustProxy: true })` (tenant resolution) trusts inbound
  `X-Tenant-ID` — only safe behind a reverse proxy that strips client-supplied
  values and re-injects from authenticated context (CWE-639). Configuration
  alone does not make this safe; it is a deployment contract.
- `MIGRATIONS_AUTO_APPLY=true` is convenient for the demo but explicitly **not**
  recommended for production — run `pnpm migrate:up` explicitly so schema
  changes are an intentional deploy step.

## Canonical files

- [`examples/m9s-example/project.config.ts:69-167`](../../../../examples/m9s-example/project.config.ts) —
  single source of config truth; literal defaults with inline `as 'a'|'b'` enum
  casts for run-mode fields (`TRANSPORT_TYPE`, `STORAGE_PROVIDER`, `AUTH_GATE`,
  `EMBEDDER_PROVIDER`, `CACHE_DRIVER`); exports `Config = typeof config` and the
  default config instance. `import 'dotenv/config'` at line 58 runs before any
  env read.
- [`examples/m9s-example/src/utils/project-config/index.ts:19-44`](../../../../examples/m9s-example/src/utils/project-config/index.ts) —
  the `loadConfig<T>()` generic; overlays `process.env` over defaults with type
  coercion (boolean: `'true'`/`'1'`→true; number: `+envVal`; string: as-is).
  Keys absent from env keep their literal default + inferred type.
- [`examples/m9s-example/src/observability.ts:33-68`](../../../../examples/m9s-example/src/observability.ts) —
  opt-in OTel run mode; `initObservability()` is a no-op unless
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set; reads `OTEL_SAMPLING_RATIO`; returns an
  `ObservabilityHandle | undefined` and `shutdownObservability()` flushes on
  SIGTERM/SIGINT. Idempotent.
- [`examples/m9s-example/moleculer.config.ts:92-142`](../../../../examples/m9s-example/moleculer.config.ts) —
  broker-side config consumption; `buildCacheDriver()` (memory vs
  RedisCacheDriver gated on `CACHE_DRIVER`+`REDIS_URL`) and the transporter
  ternary (Local null / Redis / NATS) driven by `TRANSPORT_TYPE`. Middlewares
  (channels, workflows) gated on `if (config.REDIS_URL)`.
- [`examples/m9s-example/src/composition/infrastructure.ts:96-324`](../../../../examples/m9s-example/src/composition/infrastructure.ts) —
  composition-root config consumption; `pickStores()`
  (`STORAGE_PROVIDER` memory|postgres), `pickEmbedder()` (`EMBEDDER_PROVIDER`
  mock|ollama|openai), `pickGate()` (`AUTH_GATE` allow-all|openfga with
  `NODE_ENV=production` fail-closed), `pickRotationStore()` (`REDIS_URL` gate).
  Each branch validates its required env and throws a clear Error.
- [`examples/m9s-example/src/index.ts:98-172`](../../../../examples/m9s-example/src/index.ts) —
  launch-param parsing; `parseServicesEnv()` (CSV, auto-prefixes
  `API_VERSION`), `parseWorkersEnv()` (CSV), `--repl` from argv,
  `WORKERS_ENABLED` from config; all passed to `ApiController.Start({...})`.
  OTel init is the FIRST import (line 46-47) before any span-creating module.
- [`examples/m9s-example/.env.example:1-77`](../../../../examples/m9s-example/.env.example) —
  run-mode toggle matrix + deployment contract; documents the full-infra
  default profile (postgres/openfga/ollama/redis) plus mock fallbacks,
  real-infra test gates, `JWT_SECRET` (no fallback), and the commented `OTEL_*`
  opt-in.
- [`examples/m9s-example/package.json:6-26`](../../../../examples/m9s-example/package.json) —
  run-mode npm scripts; `start` (compiled), `dev`/`dev:no-repl`/`dev:cluster`
  (ts-node-dev with inlined env), `infra:up/down/logs` (docker compose),
  `migrate:up/down/status`, `test:real-infra` (`VITEST_REAL_INFRA=1`).
- [`examples/m9s-example/src/shared/logger.ts:18-40`](../../../../examples/m9s-example/src/shared/logger.ts) —
  logger factory wrapping `@gertsai/logger-factory.createLogger` with
  `LOG_LEVEL` env override + project `REDACT_KEYS` unioned onto built-in
  `REDACTION_KEYS` (CWE-532 protection for `POSTGRES_URL`/`REDIS_URL`).

## @gertsai packages used

- `@gertsai/otel`
- `@gertsai/api-core`
- `@gertsai/logger-factory`
- `@gertsai/m9s-cache`
- `@gertsai/rest-request-manager`
- `@gertsai/tenant`
- `@gertsai/tenant-resolver`
- `@gertsai/runtime-context`
- `@gertsai/session`
- `@gertsai/entity-storage`
- `@gertsai/pg-client`
- `@gertsai/auth-openfga`
- `@gertsai/api-rlr`
- `@gertsai/errors`
