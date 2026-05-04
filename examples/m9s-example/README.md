# `@gertsai-examples/m9s-example`

> Hexagonal Moleculer.js example consuming the published `@gertsai/*`
> packages end-to-end. Mirrors the `apps/pipeline` service-with-lifecycle
> + ApiController.Start pattern, on a tiny "ingest + search" workload.

## Why this example

The shared monorepo ships 13 OSS packages (`api-core`, `auth-openfga`,
`m9s-cache`, `core`, `fetch`, `utils`, `collection`, ...). Real consumers
need a single, runnable, dependency-free reference that demonstrates:

1. The full **service-with-lifecycle + `ApiController.Start` + queues**
   pattern used by `apps/pipeline`, in the simplest possible setting.
2. How to keep domain code free of transport, persistence, and AuthZ
   (hexagonal architecture: `domain/` → `application/` → `infrastructure/`
   → `services/`).
3. How to plug `M9sCacheCacher` into a Moleculer broker via the package's
   in-memory driver.
4. How to slot in BullMQ-backed queues with a synchronous in-process
   fallback for offline runs.
5. Where future packages (e.g. `api-rlr`) plug in.

## Architecture

```
                HTTP                    Moleculer ApiController                 Domain
   client ──▶ /api/v1/* ──▶ services/ingest ──▶ lifecycle ──▶ UseCase ──▶ Ports
                       └──▶ services/search                        │       │
                                                                   │       ├─ MemoryDocumentStore
                                                                   │       ├─ MemoryVectorStore
                                                                   │       ├─ MockEmbedder
                                                                   │       └─ AllowAllPermissionGate
                                                                   ▼
                                                              BullMQ queue (Redis-optional)
                                                              └─ inline fallback (no Redis)

                          caching: M9sCacheCacher (memory driver, 60 s TTL)
```

Layer rules (enforced by code review, not the compiler):

| Layer            | May import from                                | Forbidden                  |
|------------------|------------------------------------------------|----------------------------|
| `domain/`        | stdlib, optionally `@gertsai/core` types       | adapters, application      |
| `application/`   | `domain/`                                      | adapters, transport libs   |
| `infrastructure/`| `domain/ports/*`, the relevant `@gertsai/*`    | `application/` directly    |
| `services/`      | `application/`, `infrastructure/`, `lib/`      | `domain/` reaches via app  |
| `lib/`           | `@gertsai/api-core`                            | (typed wrapper helpers)    |

## Folder layout (mirror of `apps/pipeline`)

```
project.config.ts            # env parsing + typed defaults (single source of config truth)
moleculer.config.ts          # broker options + cacher — imports from project.config.ts
src/
├── index.ts                 # import './services'; ApiController.Start({...})
├── domain/                  # entities + ports (zero infra)
├── application/             # use cases (only domain)
├── infrastructure/          # outbound adapters (memory stores, mock embedder, gates)
├── lib/
│   └── example-controller.ts # typed resolveController helper (= pipeline-controller.ts)
├── mol-services/
│   └── api.service.ts       # createApiService + RLR placeholder
└── services/
    ├── index.ts             # side-effect imports — registers controllers
    ├── ingest/
    │   ├── index.ts         # import './lifecycle'; export * from './src'; export * from './types'
    │   ├── lifecycle.ts     # controller.addStartedHandler — wires UseCase + adapters into ctx.service
    │   ├── types.ts         # IngestServiceContext + request/response shapes
    │   └── src/
    │       ├── index.ts     # actions + queues re-exports
    │       ├── actions/
    │       │   └── ingest-document.action.ts
    │       └── queues/
    │           └── ingest-chunk.queue.ts  # BullMQ + inline fallback
    └── search/
        ├── index.ts, lifecycle.ts, types.ts
        └── src/actions/search-query.action.ts
tests/
├── ingest-use-case.test.ts
├── search-use-case.test.ts
└── e2e.test.ts              # full ApiController.Start; broker.call (skip by default)
```

## Run

```bash
# from monorepo root
pnpm install
pnpm --filter @gertsai-examples/m9s-example run build
pnpm --filter @gertsai-examples/m9s-example run start
```

Env-driven launch (mirrors `apps/pipeline` 1:1):

```bash
# Selective service load
SERVICES=ingest pnpm --filter @gertsai-examples/m9s-example run start
SERVICES=ingest,search pnpm --filter @gertsai-examples/m9s-example run start

# API gateway mode — producer only, no queue worker in this process
WORKERS_ENABLED=false SERVICES=ingest \
  pnpm --filter @gertsai-examples/m9s-example run start

# Redis-backed queue with custom worker concurrency
REDIS_URL=redis://localhost:6379 WORKER_CONCURRENCY=8 \
  pnpm --filter @gertsai-examples/m9s-example run start

# Specific worker queues only (when running multiple)
WORKERS=m9s-example.ingest \
  pnpm --filter @gertsai-examples/m9s-example run start

# Interactive REPL
pnpm --filter @gertsai-examples/m9s-example run start -- --repl
```

### Configuration (`project.config.ts`)

All knobs live in `project.config.ts` and read once at import time. Override
via env vars:

| Env var               | Default          | Effect                                                       |
|-----------------------|------------------|--------------------------------------------------------------|
| `WEB_SERVER_PORT`     | `3000`           | HTTP gateway port                                            |
| `MOLECULER_NAMESPACE` | `m9s-example`    | Broker namespace                                             |
| `TRANSPORT_TYPE`      | `null`           | `null` (single-node) / `redis` / `nats`                      |
| `REDIS_URL`           | _(unset)_        | Required for `redis` transport AND BullMQ queue              |
| `NATS_URL`            | _(unset)_        | Required for `nats` transport                                |
| `LOG_LEVEL`           | `info`           | `fatal` … `trace`                                            |
| `CACHE_TTL`           | `60`             | Cacher default TTL (seconds)                                 |
| `CACHE_MAX_ENTRIES`   | `5000`           | In-memory cacher cap                                         |
| `REQUEST_TIMEOUT`     | `30000`          | Moleculer request timeout (ms)                               |
| `WORKER_CONCURRENCY`  | `4`              | BullMQ Worker `{ concurrency }`                              |
| `WORKERS_ENABLED`     | `true`           | `false` → producer-only (jobs added, not consumed here)      |
| `SERVICES`            | _(all)_          | CSV of service short names (`ingest,search`)                 |
| `WORKERS`             | _(all)_          | CSV of worker queue names                                    |

In another terminal:

```bash
bash examples/m9s-example/scripts/smoke.sh
```

Expected response shape (envelope from `@gertsai/api-core`):

```json
{
  "success": true,
  "code": "201/created",
  "message": "Document accepted for ingestion",
  "data": { "docId": "d1", "jobId": "inline-...", "mode": "inline", "chunkCount": 3 }
}
```

In **inline mode** (no `REDIS_URL`), `chunkCount` is the final count and
`mode` is `"inline"`. In **Redis mode** the action returns immediately
with `chunkCount: null` and `mode: "redis"`; processing continues in the
background BullMQ worker.

## Tests

```bash
pnpm --filter @gertsai-examples/m9s-example run test
```

Unit tests mock all four ports and assert use-case orchestration. The
e2e test that boots a real broker is `it.skip`-ed by default — flip it
on locally once you have run `pnpm run build`.

## Package usage map

| Package                  | Where it appears                                                     |
|--------------------------|----------------------------------------------------------------------|
| `@gertsai/api-core`      | `lib/example-controller.ts`, all `services/*/lifecycle.ts` and actions, `mol-services/api.service.ts` |
| `@gertsai/m9s-cache`     | `moleculer.config.ts` (M9sCacheCacher + MemoryCacheDriver)           |
| `@gertsai/auth-openfga`  | `infrastructure/openfga-permission.gate.ts` (lazy import)            |
| `@gertsai/core`          | available via `@gertsai/api-core` re-exports (session typing)        |
| `@gertsai/fetch`         | referenced in `mock-embedder.ts` JSDoc as the real-impl pattern      |
| `@gertsai/collection`    | mentioned in `memory-vector.store.ts` as a future swap point         |
| `@gertsai/utils`         | available as a workspace dep — usage left to the reader              |
| `bullmq` + `ioredis`     | `services/ingest/src/queues/ingest-chunk.queue.ts`                   |

The remaining six packages (`fsm`, `hsm`, `flux`, `ws-rpc`, `di`,
`llm-costs`) are out of scope for this minimal demo. They each have
their own example or test surface in `packages/*/`.

## Where `api-rlr` fits

`api-rlr` (rate-limiter) is being extracted in Phase 2. The hook point
is already laid out in `src/mol-services/api.service.ts`:

```ts
// TODO: add RLRMiddleware from @gertsai/api-rlr once extracted (Phase 2)
//   .use(RLRMiddleware({ default: { rule: { type: 'gcra', limit: 60, period: 60 } } }))
```

When the package lands, drop the import in `mol-services/api.service.ts`,
add it to `settings.use`, and you get tenant-aware rate limiting with
zero domain-layer churn.

## Status

- Build: `tspc` (ts-patch + typia transform + path remap).
- Runtime: single-node Moleculer 0.14, no Redis required by default.
- Auth: `AllowAllPermissionGate` by default; switch to
  `OpenFgaPermissionGate` in `services/ingest/lifecycle.ts` for real ReBAC.
- Coverage: unit tests for both use cases (Vitest); e2e marked `skip`.

## Swapping adapters

Production wiring is a one-file change. Edit
`src/services/ingest/lifecycle.ts`:

```ts
// Replace AllowAllPermissionGate with the real OpenFGA-backed gate.
import { OpenFgaPermissionGate } from '../../infrastructure/openfga-permission.gate';

const gate = new OpenFgaPermissionGate({
  defaultResourceType: 'project',
  actionToRelation: { ingest: 'can_edit', search: 'can_view' },
});
```

Likewise, swap `MemoryDocumentStore` and `MemoryVectorStore` for SQL /
Milvus adapters when ready — domain and application layers remain
untouched.

## License

Apache-2.0. Same as the rest of the `gertsai/shared` monorepo.
