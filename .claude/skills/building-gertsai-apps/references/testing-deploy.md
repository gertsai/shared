# Testing, Docker & deployment

## What & why

m9s-example ships a **two-tier test strategy** plus a one-command Docker
deployment, all driven by environment variables.

The test split is the central idea:

- **Mock-mode suites (default `pnpm test`)** are fast, hermetic, and
  CI-safe. Use-case unit tests mock the four hexagonal domain ports
  (`IDocumentStore`, `IChunkStore`, `IEmbedder`, `IPermissionGate`) with
  `vi.fn()`; e2e tests boot a **real Moleculer broker** via
  `ApiController.Start({ brokerConfig, services, repl: false })` against an
  in-memory store + mock embedder. No external infrastructure required.
- **Real-infra suites (opt-in `pnpm test:real-infra`,
  `VITEST_REAL_INFRA=1`)** exercise live backends — Postgres+pgvector,
  OpenFGA, Redis+BullMQ, Ollama. Each suite auto-probes its dependency at
  module-eval time and `describe.skip`s itself (with a console.log
  explaining how to enable it) when the backend is absent or the force env
  var is unset. `pnpm test:all` runs the superset.

Deployment is a single `docker compose up -d` bringing up a **5-service
stack** (NATS, Redis, pgvector Postgres, OpenFGA, Ollama), every port bound
to `127.0.0.1` only, with per-service healthchecks. Schema is managed by a
**~280-LOC custom raw-SQL migration runner** (`scripts/migrate.ts`) using
`pg_advisory_xact_lock`, a `pg_migrations` tracking table, and
typia-validated CLI args — deliberately no Drizzle/Prisma, so readers see
the actual SQL (HNSW index, `tenant_id` columns, FK cascades).

**Critical build nuance that shapes every e2e test:** m9s actions use
`typia.createValidate<T>()`, whose validators are inlined only by the `tspc`
build into `dist/`. vitest's esbuild does **not** run the typia transform,
so importing app runtime from `src/` throws `NoTransformConfigurationError`.
e2e tests therefore import runtime **side-effects from the pre-built
`dist/`**, and route those imports through `createRequire` to preserve CJS
module identity with the controller registry. `pnpm build` must run before
any e2e/real-infra suite.

## How it works in m9s-example

### Two-tier test split: mock-mode default, real-infra opt-in

- **What** — Default `pnpm test` runs only fast mock-mode suites and
  **excludes both** the `tests/real-infra/` directory **and** the sibling
  `tests/real-infra.test.ts` file. `pnpm test:real-infra`
  (`VITEST_REAL_INFRA=1`) flips include/exclude to run **only** the
  real-infra suites; `pnpm test:all` is the superset.
- **Why** — CI runners without Postgres/OpenFGA/Redis/Ollama must not block
  release. Keeping the default suite hermetic (mocks + local broker) makes
  it deterministic and fast, while real-infra suites validate live
  composition during local dev and release-readiness sweeps.
- **How** — `vitest.config.ts` toggles `include`/`exclude` on
  `process.env['VITEST_REAL_INFRA'] === '1'`. The real-infra include list
  must list **both** the glob `tests/real-infra/**/*.test.ts` **and** the
  sibling file `tests/real-infra.test.ts` (Wave 8.2 fix: the directory glob
  alone silently missed the sibling file, which then ran during default
  `pnpm test` and relied on a runtime skip).

### Env-gated real-infra suites with auto-probe + describe.skip

- **What** — Each real-infra suite probes its dependency at module-eval
  time (HTTP `/healthz`, `/api/tags`, or Redis `PING` within ~1s). If the
  force env var (`OLLAMA_E2E` / `OPENFGA_E2E` / `BULLMQ_E2E` /
  `PGVECTOR_E2E`) is unset **and** the probe fails, the whole `describe`
  block is skipped via `describe.skip` and a console.log explains how to
  enable it.
- **Why** — Lets the same file be safe in CI (skips cleanly, no red
  herring) and useful locally (auto-runs when infra is up). Avoids spinning
  up a broker when the backend it needs is missing.
- **How** — `const ready = FORCE || (await probe()); const maybe = ready ?
  describe : describe.skip;` then `maybe('suite', () => {...})`. The `await`
  at module top-level works because vitest runs ESM. A trailing `if
  (!ready) console.log('... — skipping ... Set X_E2E=1 to force, or run
  \`pnpm infra:up\`')`.

### Broker boot in tests via ApiController.Start with dist/ side-effects + createRequire

- **What** — e2e/integration tests boot a real Moleculer broker exactly
  like `pnpm start` does — `await ApiController.Start({ brokerConfig,
  services, repl: false })` — after triggering the controller-registration
  side-effect import. **All** imports of `@gertsai/api-core/moleculer`, the
  broker config, and the `ApiService` go through
  `createRequire(import.meta.url)` and resolve from `../dist/...`.
- **Why** — Two coupled constraints. (1) **typia**: m9s actions use
  `typia.createValidate<T>()`, which only works after the tspc build inlines
  the validator; vitest's esbuild lacks the typia transform, so source
  imports throw `NoTransformConfigurationError` — hence import from
  pre-built `dist/`. (2) **module identity**: `dist/` is CommonJS; its
  side-effect `require` resolves api-core's CJS bundle. If the test imported
  the same package via ESM `await import`, Node would load the ESM bundle as
  a **separate** `ApiController` class whose static `_controllers` registry
  is empty → `ServiceNotFoundError`. `createRequire` keeps one module
  identity.
- **How** — `const requireFromHere = createRequire(import.meta.url);` then
  `requireFromHere('../dist/src/services/index.js')` (side-effect: registers
  controllers), `const { ApiController } =
  requireFromHere('@gertsai/api-core/moleculer')`, `const cfg =
  requireFromHere('../dist/moleculer.config.js').default`, `const ApiService
  = requireFromHere('../dist/src/mol-services/api.service.js').default`.
  Always override `logger` to `{ type:'Console', options:{ level:'error' }
  }` and `afterAll(() => broker?.stop())`. **Pre-requisite:** `pnpm build`
  must run before these suites.

### Mock-mode unit tests over four hexagonal ports

- **What** — Pure use-case unit tests build a fresh set of `vi.fn()` mocks
  for the four domain ports (`IDocumentStore`, `IChunkStore`, `IEmbedder`,
  `IPermissionGate`) and assert orchestration (gate → embed → persist)
  without any broker or infra.
- **Why** — Hexagonal architecture isolates the core from infrastructure,
  so use cases are testable in isolation with trivial fakes. This keeps the
  bulk of the suite fast and deterministic.
- **How** — A `makeDeps()` factory returns `{ docStore, chunkStore,
  embedder, gate }` where each method is `vi.fn().mockResolvedValue(...)`.
  The embedder mock supplies a fixed `dimensions` and returns constant
  vectors. Tests then assert `expect(deps.gate.can).toHaveBeenCalledWith(
  'u1','ingest','d1')` etc.

### meta.testSession auth seam for authenticated broker.call tests

- **What** — Since session-guard requires an authenticated session (Wave 12
  CWE-862), tests inject a real `Session` fixture via `ctx.meta.testSession`
  instead of minting JWTs. The production middleware chain (tenant resolver,
  session-guard assertions) still runs.
- **Why** — Bypasses JWT signing in tests while keeping the rest of the Wave
  5 stack intact, so auth-positive **and** auth-negative (anonymous → 401,
  destroyed → 401, cross-tenant → 403) paths can be exercised end-to-end.
  The seam is gated on `NODE_ENV !== production` **and** explicit
  `GERTSAI_TEST_SESSION_ALLOW=1` (set in `vitest.config` env), so it is inert
  in production.
- **How** — A `makeAuthSession({ tenantId })` helper constructs `new
  Session({ operatorUuid, operatorType:'web', tokenGetter: async()=>'tok',
  dialog:{...}, clientPlatform:'web', clientVersion, tenantId })` (`Session`
  pulled via `requireFromHere` for module identity), then passes it in
  `broker.call(action, input, { meta: { headers:{'x-tenant-id':...},
  testSession } })`. Destroyed-session tests call `session.$destroy()`
  before passing.

### docker compose 5-service stack, localhost-bound, healthchecked

- **What** — `docker compose up -d` brings up NATS (4222/8222), Redis
  (6379), pgvector Postgres (5432), OpenFGA (8080/8081/3000), Ollama
  (11434). Every port maps to `127.0.0.1` only. Each service (except
  OpenFGA) has a healthcheck; named volumes persist Postgres/Ollama/Redis
  state.
- **Why** — A single command gives adopters a working real backend instead
  of stitching infra together. Localhost-binding prevents LAN leakage.
  Healthchecks let `docker compose ps` show readiness and let helper scripts
  wait. The pgvector image + initdb extension gives vector search out of the
  box.
- **How** — `services:` block with `image`, `container_name`, `ports:
  ['127.0.0.1:PORT:PORT']`, `healthcheck: { test, interval, timeout,
  retries }`, `restart: unless-stopped`. Postgres mounts
  `./docker/postgres-init.sql` into `/docker-entrypoint-initdb.d/` to
  `CREATE EXTENSION vector`. OpenFGA is intentionally healthcheck-less
  (scratch image, no shell) — its `/healthz` is polled externally by
  `openfga-init.sh`. Exposed via `pnpm infra:up` / `infra:down` /
  `infra:logs`.

### Custom raw-SQL migration runner with advisory lock + tracking table

- **What** — `scripts/migrate.ts` is a ~280-LOC runner supporting `--up |
  --down | --status | --target-version=<int>`. It discovers
  `NNN_<name>.{up,down}.sql` files, tracks applied versions in a
  `pg_migrations` table, and serializes runs with `pg_advisory_xact_lock`.
  No Drizzle/Prisma.
- **Why** — ADR-011 Decision E chose raw SQL for a reference app so readers
  see the actual SQL (HNSW index, `tenant_id` columns, FK cascades) rather
  than ORM tooling. The advisory lock prevents concurrent runs (CWE-362);
  typia-validated argv + hard-coded migrations path prevent
  injection/path-traversal (CWE-22). Idempotent — a second `--up` is a
  no-op.
- **How** — Uses `pg.Pool` directly (not `PgClient` — needs multi-statement
  `.sql` + transaction control). `runWithLock` wraps `BEGIN` → `SELECT
  pg_advisory_xact_lock($1)` → fn → `COMMIT` (`ROLLBACK` on error).
  `applyUp` reads each pending `.up.sql`, `client.query(sql)`, then `INSERT`s
  into `pg_migrations`. Filenames validated against
  `/^(\d{3})_([a-z0-9_]+)\.(up|down)\.sql$/`; missing version numbers or
  unpaired up/down files throw. Exposed via `pnpm migrate:up` / `down` /
  `status`. `POSTGRES_URL` required.

### Env-driven config read once at import time

- **What** — All runtime knobs live in `project.config.ts`, read from env
  once at module-load. Behaviour toggles on presence of env vars:
  `STORAGE_PROVIDER` (postgres|memory), `EMBEDDER_PROVIDER`
  (mock|ollama|openai), `REDIS_URL` presence → `QUEUE_ENABLED` (queued vs
  inline ingest) + RLR rate-limiting + Redis cacher + transport, `AUTH_GATE`
  (openfga|allow-all), `MIGRATIONS_AUTO_APPLY`.
- **Why** — Lets one binary serve dev (mock embedder, in-memory store, no
  Redis) and production (Ollama, pgvector, BullMQ, OpenFGA) by env alone,
  mirroring 12-factor config. Tests exploit this by setting env **before**
  the dist require so the module-scoped config observes the override.
- **How** — Tests do `process.env['REDIS_URL']='';
  process.env['STORAGE_PROVIDER']='memory';
  process.env['EMBEDDER_PROVIDER']='ollama'` **before**
  `requireFromHere('../dist/src/services/index.js')`. dotenv does **not**
  overwrite already-set vars, so explicit pre-require assignment wins over
  `.env`. `.env.example` documents every knob; copy to `.env` (gitignored).

## Template

A copy-paste e2e / real-infra test skeleton lives in
`.claude/skills/building-gertsai-apps/templates/app-e2e.test.ts`. Inline
below for reference:

```ts
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// e2e / real-infra test skeleton for a @gertsai/* Moleculer app.
// Derived from examples/m9s-example/tests/{e2e,real-infra/*}.test.ts.
//
// PRE-REQUISITE: `pnpm --filter <your-app> run build` MUST run first.
//   Your actions use `typia.createValidate<T>()`; vitest's esbuild lacks the
//   typia transform, so source imports throw NoTransformConfigurationError.
//   Always import RUNTIME side-effects from the pre-built `dist/`.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Middleware } from 'moleculer';

// CRITICAL: route ALL @gertsai/api-core + dist imports through createRequire so
// they share CJS module identity with the dist side-effect (which registers
// controllers in ApiController._controllers). An ESM `await import` of the same
// package yields a SEPARATE class whose registry is empty -> ServiceNotFoundError.
const requireFromHere = createRequire(import.meta.url);

// --- Real-infra gate (DELETE this block for a pure mock-mode broker test) ----
// TODO: point at your dependency's health endpoint.
const INFRA_URL = process.env['MY_INFRA_URL'] ?? 'http://localhost:PORT';
const FORCE = process.env['MY_INFRA_E2E'] === '1';
async function infraAlive(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1000);
    const resp = await fetch(`${INFRA_URL}/healthz`, { signal: ctrl.signal });
    clearTimeout(t);
    return resp.ok;
  } catch {
    return false;
  }
}
const ready = FORCE || (await infraAlive());
const maybe = ready ? describe : describe.skip;
// -----------------------------------------------------------------------------

// JWT_SECRET hard-fails at boot if unset (Wave 12). Set a test-only value
// BEFORE any require triggers ApiController.Start. Never used for signing here.
process.env.JWT_SECRET ??= 'test-only-secret-not-used-for-signing';

// Inject a real Session fixture via meta.testSession instead of minting a JWT.
// The seam is gated on GERTSAI_TEST_SESSION_ALLOW=1 (set in vitest.config.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAuthSession(opts: { tenantId: string; operatorUuid?: string }): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Session } = requireFromHere('@gertsai/session');
  return new Session({
    operatorUuid: opts.operatorUuid ?? 'user-test-default',
    operatorType: 'web',
    tokenGetter: async () => 'tok',
    dialog: { confirm: async () => true, alert: () => {}, error: () => {} },
    clientPlatform: 'web',
    clientVersion: '0.0.0-test',
    tenantId: opts.tenantId,
  });
}

maybe('<your-app> e2e (broker.call)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let broker: any;

  beforeAll(async () => {
    // TODO: set env BEFORE the dist requires — project.config.ts reads env once
    //       at module load, and dotenv won't overwrite an already-set var.
    process.env['STORAGE_PROVIDER'] = 'memory'; // or 'postgres'
    process.env['EMBEDDER_PROVIDER'] = 'mock';  // or 'ollama' for real-infra

    // Side-effect: registers controllers in ApiController._controllers.
    requireFromHere('../dist/src/services/index.js');

    const { ApiController } = requireFromHere(
      '@gertsai/api-core/moleculer',
    ) as typeof import('@gertsai/api-core/moleculer');
    const brokerConfigDefault = requireFromHere('../dist/moleculer.config.js')
      .default as import('moleculer').BrokerOptions;
    const ApiService = requireFromHere('../dist/src/mol-services/api.service.js')
      .default;

    const brokerConfig = {
      ...brokerConfigDefault,
      // Keep production Wave 5 middleware chain (tenant resolver + session).
      middlewares: brokerConfigDefault.middlewares as Middleware[],
      // Silence broker logs in test output.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: { type: 'Console', options: { level: 'error' } } as any,
    };

    broker = await ApiController.Start({
      brokerConfig,
      services: [ApiService],
      repl: false,
    });
  }, 60_000);

  afterAll(async () => {
    if (broker !== undefined) await broker.stop();
  });

  it('runs an authenticated action end-to-end', async () => {
    const resp = await broker.call(
      'v1.<action>', // TODO
      { /* TODO: action input */ },
      {
        meta: {
          headers: { 'x-tenant-id': 'tenant-acme' },
          testSession: makeAuthSession({ tenantId: 'tenant-acme' }),
        },
      },
    );
    expect(resp).toBeDefined();
    // TODO: assert resp.data shape
  }, 15_000);

  it('rejects an anonymous call with 401', async () => {
    const result = await broker
      .call('v1.<action>', { /* TODO */ })
      .then(() => ({ ok: true as const }), (err: unknown) => ({ ok: false as const, err }));
    expect(result.ok).toBe(false);
  }, 15_000);
});

if (!ready) {
  // eslint-disable-next-line no-console
  console.log('[my-infra.test] infra unavailable at', INFRA_URL,
    '— skipping. Set MY_INFRA_E2E=1 to force, or run `pnpm infra:up`.');
}
```

## Best practices

- Keep the default `pnpm test` hermetic: mock all four hexagonal ports with
  `vi.fn()` for use-case units, and for broker e2e use in-memory store +
  mock embedder. Push everything that needs Postgres/Redis/OpenFGA/Ollama
  behind `pnpm test:real-infra` (`VITEST_REAL_INFRA=1`).
- Always run `pnpm build` (tspc) before any e2e/real-infra suite — actions
  use `typia.createValidate<T>()` and tests import runtime side-effects from
  `dist/`, where the typia validators are inlined. vitest's esbuild does
  **not** run the typia transform.
- Route every test import of `@gertsai/api-core/moleculer` and dist modules
  through `createRequire(import.meta.url)`, not ESM `await import`, to
  preserve CJS module identity with the controller registry. Mismatched
  identity gives an empty `_controllers` and `ServiceNotFoundError`.
- Set behaviour-toggling env vars (`REDIS_URL`, `STORAGE_PROVIDER`,
  `EMBEDDER_PROVIDER`) **before** the first
  `requireFromHere('../dist/...')` — `project.config.ts` reads env once at
  module load, and dotenv will not overwrite an already-set var, so the
  explicit pre-require assignment wins.
- Set `fileParallelism: false` in `vitest.config.ts` — booting the Wave 5
  broker per file is heavy enough that parallel boots blow past timeouts,
  and real-infra suites share external state (Postgres/Redis/OpenFGA). The
  whole suite still finishes in seconds.
- Gate every real-infra suite on `FORCE_ENV || (await probe())` and use
  `describe.skip` + a trailing console.log explaining how to enable it. CI
  without the dependency skips cleanly instead of failing red.
- Always `await broker.stop()` in `afterAll` and override the broker logger
  to `level:'error'` to keep test output readable and avoid leaked brokers.
- Make migrations idempotent: every `CREATE` uses `IF NOT EXISTS`, paired
  up/down files mandatory, version numbers strictly monotonic with no gaps,
  and serialize with `pg_advisory_xact_lock` so concurrent runners can't
  race.
- Bind every docker-compose port to `127.0.0.1` and ship a `.env.example`
  with placeholder creds only (`.env` gitignored). Add per-service
  healthchecks so `docker compose ps` and bootstrap scripts can wait for
  readiness.
- For authenticated broker tests, inject a real `Session` via
  `meta.testSession` rather than minting JWTs. Keep the production
  middleware chain (tenant resolver + session-guard) so you exercise the
  real auth path; the seam is inert in production (`NODE_ENV` +
  `GERTSAI_TEST_SESSION_ALLOW` gated).
- Make tenant isolation defence-in-depth: every chunks/documents SQL carries
  a mandatory `WHERE tenant_id = $1`, and write an adversarial cross-tenant
  real-infra test (`pg-vector.test.ts`) that proves tenant A's search never
  returns tenant B's rows even with the gate bypassed.
- In production: never set `AUTH_GATE=allow-all` (constructor throws in
  `NODE_ENV=production`), always supply `FGA_API_TOKEN` + terminate TLS in
  front of OpenFGA, keep `MIGRATIONS_AUTO_APPLY=false` (run `pnpm
  migrate:up` explicitly), and front the broker with a proxy that strips
  client-supplied `X-Tenant-ID` and re-sets it from authenticated context.

## Pitfalls

- Importing app modules from `src/` in e2e tests instead of `dist/` →
  `NoTransformConfigurationError` at module load, because
  `typia.createValidate<T>()` needs the tspc transform that vitest's esbuild
  does not run.
- Using ESM `await import('@gertsai/api-core/moleculer')` in a test while the
  dist side-effect uses CJS `require` → two `ApiController` class
  identities, an empty static `_controllers` registry, and
  `ServiceNotFoundError` when the broker boots.
- Glob `tests/real-infra/**` matches the directory but **not** the sibling
  file `tests/real-infra.test.ts` — that file silently ran during default
  `pnpm test` (Wave 8.2 bug). The fix lists **both** the glob and the
  explicit file in includes/excludes.
- Setting env vars **after** the dist require has no effect —
  `project.config.ts` is module-scoped and evaluated once on first import.
  Always assign before `requireFromHere(...)`.
- Forgetting that dotenv does not overwrite already-set `process.env` vars: a
  value in `.env` (e.g. `STORAGE_PROVIDER=postgres`) will **not** win if the
  test set it earlier — but it **will** silently win if you forgot to set it
  explicitly, causing tests to hit Postgres unexpectedly.
- `MockEmbedder` produces deterministic hash vectors that encode no semantic
  similarity, so search always returns 0 results in default mock mode — do
  not write search-relevance assertions against the mock embedder; use a
  real Ollama embedder (real-infra) for round-trip relevance.
- Dimension mismatch: `MockEmbedder` is 384-dim but `PgVectorStore` expects
  `vector(768)` — mock-mode + postgres storage will fail. Force
  `STORAGE_PROVIDER=memory` when using the mock embedder.
- BullMQ async-ingest eventual-consistency is racy: on a fast machine the
  worker can persist chunks between the ingest call returning and the
  immediately-following search, so a strict `initial results === 0`
  assertion is flaky. Assert `<= 1` and poll for the eventual hit instead.
- OpenFGA's official image is scratch-based (no shell/wget/curl), so a
  Docker-internal healthcheck is impractical — the container shows 'no
  healthcheck' by design; readiness must be polled externally against the
  `/healthz` HTTP endpoint.
- Running the broker against an empty Postgres without applying migrations
  first → tables missing. The pg-vector real-infra test deliberately errors
  loudly (probing `information_schema`) rather than auto-creating ad-hoc
  DDL. Run `pnpm migrate:up` before real-infra DB tests.
- Forgetting `set -euo pipefail` in shell helpers, or assuming
  `docker-compose` (v1) works — this stack requires Compose v2 (`docker
  compose`).
- Cross-tenant leakage if you rely solely on the OpenFGA gate: the gate can
  be misconfigured, so the mandatory `WHERE tenant_id = $1` SQL clause is the
  last line of defence — never drop it for 'convenience'.

## Canonical files

All paths are under `examples/m9s-example/`.

- `vitest.config.ts:23-49` — Vitest config; splits mock-mode (default) vs
  real-infra suites via `VITEST_REAL_INFRA`; `fileParallelism:false` to avoid
  broker-boot races and shared-infra collisions; per-mode timeouts;
  `GERTSAI_TEST_SESSION_ALLOW` seam opt-in.
- `package.json:18-28` — test + ops scripts: `test` / `test:watch` /
  `test:real-infra` / `test:all`, `infra:up`/`down`/`logs` (docker compose),
  `migrate:up`/`down`/`status`, `smoke`, `build` (tspc).
- `tests/e2e.test.ts:35-203` — canonical `broker.call` e2e; boots real broker
  via `ApiController.Start`; `createRequire` for CJS module identity; imports
  side-effects from `dist/`; probe middleware; `meta.testSession` auth seam.
- `tests/ingest-use-case.test.ts:17-36` — mock-mode unit test pattern;
  `vi.fn()` mocks for all four domain ports; asserts use-case orchestration.
- `tests/real-infra.test.ts:40-72` — real Ollama embedder e2e; env-gated
  (`OLLAMA_E2E` or auto-probe `/api/tags` within 1s); `describe.skip` when
  infra absent; console.log skip reason.
- `tests/real-infra/pg-vector.test.ts:30-62` — live Postgres+pgvector test;
  gated on `PGVECTOR_E2E` + `POSTGRES_URL`; probes `information_schema` for
  migrated tables and errors loudly if absent; `beforeEach` wipes only test
  tenants for hermeticity.
- `tests/real-infra/bullmq.test.ts:46-189` — live Redis+BullMQ async-ingest
  test; ioredis `PING` probe; `pollUntil` helper for eventual-consistency
  assertions; race-tolerant initial-search assertion.
- `tests/real-infra/openfga.test.ts:50-230` — live OpenFGA authorization
  test; `/healthz` probe; in-process store/model/tuple seeding (idempotent);
  fail-closed-on-unreachable test; p50 latency NFR check.
- `docker-compose.yml:17-103` — 5-service stack
  (NATS/Redis/pgvector-pg16/OpenFGA-v1.5/Ollama); all bound `127.0.0.1` only;
  healthchecks per service (OpenFGA intentionally none — scratch image);
  named volumes; `postgres-init.sql` + initdb mount.
- `docker/postgres-init.sql:3` — initdb hook; `CREATE EXTENSION IF NOT EXISTS
  vector` on first Postgres start.
- `scripts/migrate.ts:51-194` — custom raw-SQL migration runner; `pg.Pool`,
  `pg_advisory_xact_lock(9_311_001)`, `pg_migrations` table,
  `typia.assert<MigrateCommand>` on argv, hard-coded migrations dir (no
  path-traversal override).
- `migrations/001_init_documents_chunks.up.sql:5-39` — schema migration;
  documents+chunks tables, `tenant_id` columns, FK cascade, HNSW
  `vector_cosine_ops` index, all `IF NOT EXISTS` (idempotent per ADR-011 I-3).
- `migrations/README.md:27-46` — migration file-naming convention
  (`NNN_<snake>.up/down.sql`, strictly monotonic, paired up+down mandatory)
  and rationale for raw-SQL over Drizzle/Prisma.
- `scripts/smoke.sh:7-43` — HTTP smoke test; curl ingest+search against
  running gateway on `:3000/api/v1`; `set -euo pipefail`; `PORT` override.
- `docker/openfga-init.sh:4-9` — OpenFGA bootstrap helper; waits for
  `/healthz` SERVING then runs `scripts/openfga-bootstrap.ts`
  (store+model+tuples).
- `.env.example:1-77` — env contract;
  storage/auth/queue/embedder/logging/JWT/OTel knobs + real-infra test gates
  (`PGVECTOR_E2E`/`OPENFGA_E2E`/`BULLMQ_E2E`/`OLLAMA_E2E`); placeholder creds
  only.
- `tsconfig.json:25-32` — build config; `typescript-transform-paths` +
  `typia/lib/transform` plugins (requires tspc, not plain tsc); declaration
  off because app not a published lib.
- `README.md:854-1022` — Production Setup section; one-command bring-up,
  apply migrations, bootstrap OpenFGA, `MIGRATIONS_AUTO_APPLY` warning,
  SECURITY checklist (allow-all banned in prod, `FGA_API_TOKEN` required,
  tenant isolation defence-in-depth, `X-Tenant-ID` spoofing).

## @gertsai packages used

- `@gertsai/api-core` — `ApiController.Start` broker boot; `/moleculer`
  subpath for tests.
- `@gertsai/session` — `Session` fixture for `meta.testSession` auth seam in
  e2e tests.
- `@gertsai/session-guard` — `assertAuthenticated` / `assertSessionInTenant`
  — exercised by 401/403 rejection e2e tests.
- `@gertsai/tenant-resolver` — `HeaderStrategy` + `ChainTenantResolver` —
  Wave 5 middleware verified in e2e/integration tests; `/moleculer` subpath.
- `@gertsai/runtime-context` — `RequestContext` composition +
  `sessionMiddleware`; `REQUEST_CONTEXT_LOCALS_KEY` probe in e2e;
  `/moleculer` subpath.
- `@gertsai/errors` — `UnauthorizedError` + taxonomy asserted in integration
  tests.
- `@gertsai/auth-openfga` — `OpenFgaPermissionGate`,
  `resetFgaClient`/`resetPermissionCache`/`getFgaClient` in real-infra
  OpenFGA test.
- `@gertsai/pg-client` — `PgClientAdapter`
  `$queryRaw`/`$executeRaw`/`$disconnect` in pg-vector real-infra test;
  migrations use `pg.Pool` directly.
- `@gertsai/api-rlr` — `RLRMiddleware` rate-limiting, Redis-gated, in
  `mol-services/api.service.ts`.
- `@gertsai/m9s-cache` — `M9sCacheCacher` + `MemoryCacheDriver` in
  `moleculer.config.ts`.
