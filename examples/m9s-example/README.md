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
4. How to register BullMQ workers via `ApiController.registerWorker()` —
   api-core owns BullMQ Queue/Worker lifecycle; the producer side is
   `service.addJob(...)`. Falls back to synchronous in-process execution
   when no `REDIS_URL` is configured.
5. How `@gertsai/api-rlr` plugs in as an Express-style middleware in
   `settings.use` for tenant/IP-keyed rate limiting.

## Architecture

```
                HTTP                    Moleculer ApiController                 Domain
   client ──▶ /api/v1/* ──▶ services/ingest ──▶ lifecycle ──▶ UseCase ──▶ Ports
                       └──▶ services/search                        │       │
                                                                   │       ├─ DocumentRepository (Wave 4)
                                                                   │       │   └─ InMemoryStorageProvider + Session
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
    │           └── ingest-chunk.worker.ts  # controller.registerWorker(...)
    └── search/
        ├── index.ts, lifecycle.ts, types.ts
        └── src/actions/search-query.action.ts
tests/
├── ingest-use-case.test.ts
├── search-use-case.test.ts
├── audit-propagation.test.ts # Wave 4 audit envelope through DocumentRepository
└── e2e.test.ts              # full ApiController.Start; broker.call (skip by default)
```

## Wave 4 stack reference

m9s-example demonstrates the canonical `@gertsai/*` Wave 4 application
pattern — domain-driven entity storage with audit propagation, session-aware
mutations, and pluggable backend providers — while preserving its hexagonal
architecture (`domain/` ports + `infrastructure/` adapters + `application/`
use cases).

The migration touched only the **infrastructure layer**:

### Architecture map

| Layer | Wave 4 plumbing | Files |
|---|---|---|
| Domain | UNCHANGED — `Document` port shape stable | `src/domain/document.ts`, `src/domain/ports/IDocumentStore.ts` |
| Application | UNCHANGED — use cases depend on ports | `src/application/IngestDocumentUseCase.ts`, `src/application/SearchDocumentsUseCase.ts` |
| Infrastructure | Wave 4 envelope (DocumentReadShape with MutationMarks) lives here | `src/infrastructure/document.repository.ts` (new) |
| Composition | InMemoryStorageProvider + Session wired here | `src/composition/infrastructure.ts` |

### Repository

`DocumentRepository` extends `BaseEntityStorageService<DocumentMeta>` and
implements the existing `IDocumentStore` port. Wave 4 envelope lives
entirely as an internal storage type — never leaks to the domain layer:

```typescript
import { BaseEntityStorageService } from '@gertsai/entity-storage';
import type { StorageMetadata } from '@gertsai/storage-core';
import type { MutationMarks, EntityBasicStatus } from '@gertsai/entity-audit';

interface DocumentWriteShape {
  readonly text: string;
  readonly metadata?: DocumentMetadata;
}

interface DocumentReadShape extends DocumentWriteShape, MutationMarks {
  readonly _uid: string;
  readonly status: EntityBasicStatus;
}

type DocumentMeta = StorageMetadata<DocumentReadShape, DocumentWriteShape, '_uid' | 'status'>;

class DocumentRepository
  extends BaseEntityStorageService<DocumentMeta>
  implements IDocumentStore
{ /* save/findById in domain shape */ }
```

### Provider wiring

The composition root selects `InMemoryStorageProvider` for the example
demo — it ships full capabilities (`listeners: true`, `transactions: true`,
`batches: true`) so all repository methods work end-to-end.

```typescript
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session } from '@gertsai/session';

const documentProvider = new InMemoryStorageProvider<DocumentMeta>();
const session = new Session({ /* operatorUuid, operatorType, tokenGetter, dialog, ... */ });
const docStore = new DocumentRepository(documentProvider, session);
```

For production deployments, swap `InMemoryStorageProvider` for
`PgStorageProvider` from `@gertsai/pg-client/storage` (requires a
`CREATE TABLE documents (id text PK, data jsonb)` schema). The repository
implementation is unchanged; only the composition wiring switches.

### Audit propagation

Every `repository.save(doc)` automatically stamps:

- `_uid` — caller-supplied `doc.id` (mapped at the Wave 4 boundary)
- `created_at`, `creator_uuid`, `created_by_platform` — from `Session` on first write
- `updated_at`, `updated_by_uuid`, `updated_by_platform` — refreshed every write
- `status` — `'created'` initially; flips to `'deleted'` on soft-delete

Audit fields never reach the domain layer — `findById` strips them back to
the plain `Document` shape.

### What stays unchanged

`Chunk` storage (`MemoryVectorStore`) and the `IChunkStore` port keep their
ad-hoc cosine-similarity implementation for v1. Vector queries are
domain-specific and Wave 4's `@gertsai/query-dsl` does not yet compile
vector ops; that integration is a future follow-up (Sprint 3.x).

### Cross-package references

- [@gertsai/entity-storage](../../packages/entity-storage/README.md) — Repository base class + InMemoryStorageProvider
- [@gertsai/storage-core](../../packages/storage-core/README.md) — IStorageProvider abstraction + capabilities flag
- [@gertsai/entity-audit](../../packages/entity-audit/README.md) — MutationMarks + audit builders
- [@gertsai/session](../../packages/session/README.md) — Session class + identity scoping
- [@gertsai/pg-client](../../packages/pg-client/README.md) — `/storage` subpath for production Postgres adapter

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

### Cluster mode — NATS transport + Redis queue

Two infra concerns, runnable simultaneously:

- **NATS** (port 4222) — Moleculer transporter for inter-service pub/sub
  (`broker.call('v1.search.query', …)` fans out across nodes).
- **Redis** (port 6379) — BullMQ queue backend (async ingest jobs).

```bash
# 1. Spin up NATS + Redis in Docker
pnpm --filter @gertsai-examples/m9s-example run infra:up

# 2. Run the example in cluster mode (NATS transport + Redis queue)
pnpm --filter @gertsai-examples/m9s-example run dev:cluster

# Tear down:
pnpm --filter @gertsai-examples/m9s-example run infra:down
```

Or with custom URLs:
```bash
TRANSPORT_TYPE=NATS \
NATS_URL=nats://nats.local:4222 \
REDIS_URL=redis://redis.local:6379 \
WORKER_CONCURRENCY=8 \
  pnpm --filter @gertsai-examples/m9s-example run dev
```

### Configuration (`project.config.ts`)

All knobs live in `project.config.ts` and are read once at import time.
Override via env vars:

| Env var                | Default                   | Effect                                                  |
|------------------------|---------------------------|---------------------------------------------------------|
| `WEB_SERVER_PORT`      | `3000`                    | HTTP gateway port                                       |
| `MOLECULER_NAMESPACE`  | `m9s-example`             | Broker namespace                                        |
| `TRANSPORT_TYPE`       | `Local`                   | `Local` (single-node) / `Redis` / `NATS`                |
| `REDIS_URL`            | _(unset)_                 | Used for: (a) `Redis` transport, (b) BullMQ queue       |
| `NATS_URL`             | `nats://localhost:4222`   | Used by `NATS` transport                                |
| `NATS_RECONNECT_WAIT`  | `2000`                    | ms between NATS reconnects                              |
| `NATS_MAX_RECONNECT`   | `-1`                      | -1 = infinite                                           |
| `LOG_LEVEL`            | `info`                    | `fatal` … `trace`                                       |
| `CACHE_TTL`            | `60`                      | Cacher default TTL (seconds)                            |
| `CACHE_MAX_ENTRIES`    | `5000`                    | In-memory cacher cap                                    |
| `REQUEST_TIMEOUT`      | `30000`                   | Moleculer request timeout (ms)                          |
| `WORKER_CONCURRENCY`   | `4`                       | BullMQ Worker `{ concurrency }`                         |
| `WORKERS_ENABLED`      | `true`                    | `false` → producer-only (jobs added, not consumed here) |
| `SERVICES`             | _(all)_                   | CSV of service short names (`ingest,search`)            |
| `WORKERS`              | _(all)_                   | CSV of worker queue names                               |
| `RLR_ENABLED`          | `true` if REDIS_URL else `false` | gate api-rlr middleware                          |
| `RLR_TIMEFRAME`        | `60000`                   | rate-limit window (ms)                                  |
| `RLR_LIMIT`            | `100`                     | max requests per window per key                         |
| `RLR_BURST`            | `5`                       | token-bucket / GCRA burst                               |
| `RLR_STRATEGY`         | `gcra`                    | `sliding_window`/`fixed_window`/`token_bucket`/`gcra`/`leaky_bucket` |
| `RLR_PREFIX`           | `m9s-example:rlr:`        | Redis key namespace                                     |
| `EMBEDDER_PROVIDER`    | `mock`                    | `mock` / `ollama` / `openai` — see "Realistic mode"     |
| `EMBEDDER_URL`         | `http://localhost:11434`  | Ollama base URL                                         |
| `EMBEDDER_MODEL`       | `nomic-embed-text`        | Model tag (Ollama or OpenAI, depending on provider)     |
| `EMBEDDER_API_KEY`     | _(unset)_                 | Required when `EMBEDDER_PROVIDER=openai`                |

In another terminal:

```bash
bash examples/m9s-example/scripts/smoke.sh
```

## Realistic mode (real embeddings + shared store)

The default mock embedder + per-process in-memory stores let the broker
boot without external dependencies, but searches always return `0`
results because mock embeddings are deterministic hashes that don't
encode semantic similarity. To see an actual end-to-end ingest → search
round-trip, point the example at a real embedding model.

The composition root in `src/composition/infrastructure.ts` builds the
adapter graph ONCE at module-load time and shares it between the
`ingest` and `search` services — so a write through one is visible to a
query through the other within the same Node.js process.

### Option A — Ollama (local, free, no API key)

```bash
# 1. Install Ollama: https://ollama.com
ollama pull nomic-embed-text

# 2. Start the example with the real embedder + shared store
EMBEDDER_PROVIDER=ollama \
  pnpm --filter @gertsai-examples/m9s-example run dev:no-repl

# 3. Ingest, then search
curl -s -X POST http://localhost:3000/api/v1/ingest/document \
  -H 'content-type: application/json' \
  -d '{"docId":"d1","text":"Hexagonal architecture isolates the core."}'

curl -s -X POST http://localhost:3000/api/v1/search/query \
  -H 'content-type: application/json' \
  -d '{"query":"core isolation","topK":3}' | jq
# → returns top-K matching chunks with cosine similarity scores
```

Override the model with `EMBEDDER_MODEL=mxbai-embed-large` (or any
embedding model you have pulled), and the daemon URL with
`EMBEDDER_URL=http://other-host:11434`.

### Option B — OpenAI

```bash
EMBEDDER_PROVIDER=openai \
EMBEDDER_API_KEY=sk-... \
EMBEDDER_MODEL=text-embedding-3-small \
  pnpm --filter @gertsai-examples/m9s-example run dev:no-repl
```

`text-embedding-3-small` (default) → 1536 dims;
`text-embedding-3-large` → 3072 dims.

### Option C — Mock (default)

```bash
pnpm --filter @gertsai-examples/m9s-example run dev:no-repl
```

Everything boots (broker, BullMQ, RLR), but search returns no semantic
hits because the mock embedder is a stable hash, not a semantic model.
Useful for showing the broker / queue / RLR machinery without any ML
dependencies.

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
Wave 4 audit-propagation test (`tests/audit-propagation.test.ts`) wires
a real `InMemoryStorageProvider` + `Session` and verifies that
`DocumentRepository.save` stamps `creator_uuid` / `created_at` on first
write, refreshes `updated_*` on re-save (upsert), emits
`STORAGE_EVENTS.ENTITY_CREATED`, and that `findById` strips the audit
envelope back to the plain `Document` shape. The e2e test that boots a
real broker is `it.skip`-ed by default — flip it on locally once you
have run `pnpm run build`.

## Package usage map

| Package                  | Where it appears                                                     |
|--------------------------|----------------------------------------------------------------------|
| `@gertsai/api-core`      | `lib/example-controller.ts`, all `services/*/lifecycle.ts` and actions, `mol-services/api.service.ts` |
| `@gertsai/m9s-cache`     | `moleculer.config.ts` (M9sCacheCacher + MemoryCacheDriver)           |
| `@gertsai/auth-openfga`  | `infrastructure/openfga-permission.gate.ts` (lazy import)            |
| `@gertsai/core`          | available via `@gertsai/api-core` re-exports (session typing)        |
| `@gertsai/fetch`         | `infrastructure/ollama-embedder.ts`, `infrastructure/openai-embedder.ts` |
| `@gertsai/collection`    | mentioned in `memory-vector.store.ts` as a future swap point         |
| `@gertsai/utils`         | available as a workspace dep — usage left to the reader              |
| `bullmq` + `ioredis`     | `services/ingest/src/queues/ingest-chunk.queue.ts`                   |

The remaining six packages (`fsm`, `hsm`, `flux`, `ws-rpc`, `di`,
`llm-costs`) are out of scope for this minimal demo. They each have
their own example or test surface in `packages/*/`.

## Rate limiting via `@gertsai/api-rlr`

The example imports `RLRMiddleware` from `@gertsai/api-rlr` and plugs it
into `mol-services/api.service.ts` `settings.use`. Pipeline-style:

```ts
const rlrUseChain = config.RLR_ENABLED && config.REDIS_URL
  ? [RLRMiddleware({
      timeFrame: config.RLR_TIMEFRAME,    // 60_000 ms (1 min)
      limit:     config.RLR_LIMIT,        // 100 req/window
      burst:     config.RLR_BURST,        // 5 (GCRA token bucket)
      strategy:  config.RLR_STRATEGY,     // 'gcra' (default)
      prefix:    config.RLR_PREFIX,       // 'm9s-example:rlr:'
      store:     () => new IORedis(config.REDIS_URL, { lazyConnect: true }),
      bucketKeyResolver: (req) => {
        // tenant-scoped (X-Tenant-ID), fallback to IP
        const tenant = req.headers['x-tenant-id'];
        return tenant ? `tenant:${tenant}` : `ip:${extractIp(req)}`;
      },
    })]
  : [];
```

Gated on `REDIS_URL` because the only shipped store is Redis-shaped. In
no-Redis dev mode the chain is empty (no throttling) — RLR re-engages
automatically once `REDIS_URL` is exported.

Env knobs: `RLR_ENABLED`, `RLR_TIMEFRAME`, `RLR_LIMIT`, `RLR_BURST`,
`RLR_STRATEGY` (`sliding_window` / `fixed_window` / `token_bucket` /
`gcra` / `leaky_bucket`), `RLR_PREFIX`.

## Workflow with replay (`@moleculer/workflows`)

The example also demonstrates the **idempotent workflow** pattern via
`@moleculer/workflows`. The `ingest.process` workflow orchestrates the
ingest pipeline as discrete steps, with each `ctx.call()` automatically
journaled to Redis. If the worker crashes mid-flight, the workflow
restarts from the beginning but **skips already-executed steps**
(reads results from the event log) — Temporal-/Restate-style replay.

Steps:

1. Validate text (inline, deterministic)
2. Chunk text (inline, deterministic)
3. `ctx.call('v1.ingest._embed', { texts })` — journaled
4. `ctx.call('v1.ingest._store', { docId, chunks, vectors })` — journaled

The two `ctx.call` boundaries are the replay barriers: a worker crash
between step 3 and step 4 will NOT re-run the embedder on retry — the
middleware reads the previous vectors from the Redis event log.

Try it:

```bash
# Workflows require Redis (the event-log adapter)
REDIS_URL=redis://localhost:6379 pnpm --filter @gertsai-examples/m9s-example run dev:cluster

# Trigger via REST (async — returns a job id immediately)
curl -s -X POST http://localhost:3000/api/v1/ingest/workflow \
  -H 'content-type: application/json' \
  -d '{"docId":"d1","text":"Hexagonal architecture isolates the core. Ports describe seams."}' | jq
# {"success":true,"data":{"docId":"d1","workflowJobId":"...","status":"started","chunkCount":null}}

# Or sync — wait for the workflow to finish and return its result
curl -s -X POST http://localhost:3000/api/v1/ingest/workflow \
  -H 'content-type: application/json' \
  -d '{"docId":"d2","text":"Reliable workflows.","sync":true}' | jq
# {"success":true,"data":{"docId":"d2","workflowJobId":"...","status":"completed","chunkCount":1}}
```

The workflow registry is the `wf-ingest` Moleculer service (defined in
`src/services/workflows/ingest-process.workflow.ts`). Without
`REDIS_URL` the workflow middleware is not loaded, and the
`/api/v1/ingest/workflow` endpoint returns 400 with a hint:

```
"Workflows require REDIS_URL — set REDIS_URL=redis://... and restart"
```

The workflow runtime is verified manually (see "Try it" snippet above);
no automated test is shipped because that would require a real or fake
Redis adapter — out of scope for the unit suite.

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

Likewise, the document store is already Wave 4 (`DocumentRepository`
extending `BaseEntityStorageService`) — swap `InMemoryStorageProvider`
for `PgStorageProvider` from `@gertsai/pg-client/storage` to land on
Postgres without touching the repository class. `MemoryVectorStore`
remains the only ad-hoc adapter; replace it with a real vector backend
(Milvus / pgvector / Qdrant) when ready. Domain and application layers
remain untouched.

## License

Apache-2.0. Same as the rest of the `gertsai/shared` monorepo.
