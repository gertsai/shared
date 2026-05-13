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

## Wave 5 stack reference

Sprint 3.10 wires the canonical `@gertsai/*` Wave 5 stack into this example
so it doubles as a copy-paste reference for the four packages added in
Wave 5.

### Errors taxonomy (`@gertsai/errors`)

Domain factories and use cases throw the canonical `AppError` subclasses
instead of bare `Error`:

```ts
// src/domain/document.ts
throw new ValidationError({
  message: 'Document.id must be non-empty',
  details: { field: 'id', constraint: 'non-empty' },
});

// src/application/IngestDocumentUseCase.ts
throw new InternalError({
  message: `Embedder returned ${vectors.length} vectors for ${chunkTexts.length} chunks`,
  details: { expectedChunks: chunkTexts.length, actualVectors: vectors.length },
});
```

Transport-level adapters (the embedder HTTP clients in `infrastructure/`)
remain on bare `Error` for now — wrap with `wrapUnknownError(e, 'INTERNAL')`
at the use-case boundary if you want a uniform serialisation surface.
HTTP / RPC translation lives in `@gertsai/errors/http` and
`@gertsai/errors/grpc` (RFC 9457 ProblemDetails + canonical gRPC status
codes); plug it into the inbound action's `try / catch` once your transport
layer is ready.

### Tenant resolution (`@gertsai/tenant-resolver`)

`src/composition/wave5-middlewares.ts` constructs
`HeaderStrategy({ trustProxy: true })` wrapped into a
`ChainTenantResolver` and registered as a Moleculer middleware via
`tenantMiddleware(...)` from `@gertsai/tenant-resolver/moleculer`. The
resolver writes `ctx.meta.tenantId` so downstream middlewares and action
handlers see the resolution.

The chain runs in `mode: 'optional'` for the example so the curl onboarding
flow (no proxy, no `X-Tenant-ID`) keeps working. Production deployments
SHOULD switch to `mode: 'strict'` (the library default per ADR-006 I-18)
to fail-closed on missing tenant.

### RequestContext composition (`@gertsai/runtime-context`)

`sessionMiddleware(...)` from `@gertsai/runtime-context/moleculer` follows
`tenantMiddleware` in the broker pipeline and:

  - reads `ctx.meta.tenantId` (set by the tenant middleware);
  - reads `ctx.meta.correlationId` / `ctx.meta.locale` if present;
  - constructs a `RequestContext` and attaches it to
    `ctx.locals.requestContext`;
  - calls `requestContext.$freeze()` BEFORE the downstream handler runs
    (per ADR-007 I-16 — TOCTOU protection between init mutators and the
    request-handler closure).

Action handlers can then call `getRequestContext(ctx)` to read the frozen
context. `ctx.meta` is reserved for cross-broker serialisation — use
`ctx.locals` for per-request, per-process state.

### Session-guard assertions (`@gertsai/session-guard`)

`IngestDocumentUseCase` and `SearchDocumentsUseCase` accept additive
optional `session` and `expectedTenantId` inputs. When `session` is
supplied, the use case asserts authentication via `assertAuthenticated`
(throws `AuthenticationRequiredError` on missing / destroyed sessions);
when both `session` AND `expectedTenantId` are supplied, the use case
additionally asserts tenant scoping via `assertSessionInTenant` (throws
`TenantScopeViolationError` on cross-tenant attempts, including the
"both undefined" trap per ADR-007 I-18).

The fields are OPTIONAL — pre-Wave-5 callers that pass only `userId`
continue to work unchanged (per ADR-010 I-2 / I-3 regression invariant).

### Composition order (canonical)

Per ADR-010 §B and the broker config:

```
tenantMiddleware → sessionMiddleware → action handler / use case
```

`tenantMiddleware` MUST precede `sessionMiddleware` so that `tenantId` is
resolved before `RequestContext` is composed and frozen.

### ⚠️ SECURITY (CWE-639 cross-tenant data access)

`HeaderStrategy({ trustProxy: true })` reads `X-Tenant-ID` from the
inbound HTTP request. This header is ONLY trustworthy if a reverse proxy
(nginx, Envoy, ALB, Cloud Run ingress, ...) **strips any client-supplied
`X-Tenant-ID` and re-sets it from authenticated context**. Without that
guarantee any client can spoof the header and cross tenant boundaries.

**Deployment contract**: a proxy in front of the broker (or the inbound
api-core REST adapter) MUST clear inbound `X-Tenant-ID` and inject the
authenticated tenant. The example construction site
(`src/composition/wave5-middlewares.ts`) carries an inline
`// SECURITY:` comment adjacent to `trustProxy: true` per ADR-010 I-14
to surface this contract at code-review time.

If you need a different transport, replace `HeaderStrategy` with one of
the other built-ins (`SubdomainStrategy`, `PathStrategy`, or a
`MoleculerCtxStrategy`) — see `@gertsai/tenant-resolver` README §Security
for the matching constraints.

### Cross-references

  - ADR-006 — `@gertsai/errors` taxonomy + `@gertsai/tenant-resolver` ACL.
  - ADR-007 — `@gertsai/runtime-context` Application Service +
    `@gertsai/session-guard` Domain Service.
  - ADR-010 — Sprint 3.10 integration rationale (Decisions A/B + Amendment 1
    SECURITY warnings).
  - `tests/wave5-integration.test.ts` — exercises the four packages end to
    end (resolver + RequestContext + Session + assertions).

## Wave 8.1+ — composition facade + hardened HTTP modernisation

Waves 8.1–8.3 modernise this example's HTTP plumbing and error surface so
adopters get a copy-paste-ready production pattern for logging, error
translation, and outbound HTTP — without bleeding sensitive context into
clients or external services.

### Composition facade pattern

Three small files at the composition seam keep cross-cutting policy in one
place instead of scattered across modules:

- `src/composition/logger.ts` (Wave 8.1) — module-scoped logger factory
  with project-wide `REDACT_KEYS` (auth tokens, DB URLs, session cookies)
  and a `LOG_LEVEL` env override. Returns a `consoleBackend`-backed
  logger via `@gertsai/logger-factory`.
- `src/shared/errors.ts` (Wave 8.3) — neutral error kernel that re-exports
  the `@gertsai/errors` taxonomy and exposes the `permissionDenied()`
  factory. Importable from ALL layers (domain, application, infrastructure,
  services) without creating a hex inversion.
- `src/composition/errors.ts` (Wave 8.1 → 8.3) — HTTP-boundary scrubber
  ONLY. Wraps `appErrorToHttpResponse` from `@gertsai/errors/http` and
  strips `userId` / `url` / `originalKind` from outbound RFC 9457
  ProblemDetails (CWE-209 protection per Wave 8.2 audit Sec#3). Server-side
  logs are unaffected — only the wire body is sanitised.

Why a facade instead of importing packages directly? Centralises log level,
redaction keys, backend choice, and HTTP boundary policy so adopters do
not drift across modules.

Canonical import lines:

```ts
// Application layer — imports from shared (the neutral kernel)
import { permissionDenied, ForbiddenError } from '../shared/errors.js';

// HTTP boundary — imports from composition (the wiring)
import { appErrorToHttpResponse } from '../composition/errors.js';

// Module logging — imports from composition (the wiring)
import { createAppLogger } from '../composition/logger.js';
```

### RestRequestManager-fronted HTTP

Both embedders (`OllamaEmbedder`, `OpenAIEmbedder`) call out via
`@gertsai/rest-request-manager` instead of `httpCaller` directly:

- Wave 8.1: replaced direct `httpCaller` calls with
  `RestRequestManager.request()`, gaining retry + token-bucket rate-limit
  + LRU circuit-breaker.
- Wave 8.2: `security?: FetchSecurityConfig` plumbing extension on
  `@gertsai/rest-request-manager` (audit Sec#1) — `allowedHostnames:
  [hostname]` binding per parsed `EMBEDDER_URL` closes CWE-918 (SSRF).
- Wave 8.3: composition root constructs ONE `RestRequestManager` per
  embedder type with full SSRF config and injects via an optional
  `manager?:` ctor opt. Embedders fall back to a per-hostname Map when no
  manager is injected (backwards-compatible).

Tunable knobs:

| Env var | Default | Notes |
|---|---|---|
| `EMBEDDER_RATE_LIMIT_RPS` | 10 (Ollama) / 1 (OpenAI) | Token-bucket rps |
| `EMBEDDER_BURST` | 20 (Ollama) / 5 (OpenAI) | Bucket size |
| `EMBEDDER_CONCURRENCY` | 4 | Bounded parallel `embed()` — Ollama only (OpenAI batches) |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

Defaults differ by provider: Ollama is local/unmetered (high rps + burst),
OpenAI is paid/metered (conservative rps + burst).

### Audit closure history (Wave 8.2 + 8.3)

After Wave 8.1 shipped, a multi-expert audit ran in Wave 8.2 (six
reviewers — Logic, Architecture, Security, Tests, Performance,
Documentation). It surfaced 57 findings (1 CRIT + 14 HIGH + 25 MED + 17
LOW). Wave 8.2 closed 1 CRIT + 12 HIGH inline (test-config divergence,
SSRF allowlist, PII scrub at HTTP boundary, REDACT_KEYS gaps, capabilities
allocation, brittle message match, etc.). Wave 8.3 closes the 5 deferred
items: hex inversion (`shared/errors.ts` relocation), embedder DI
(composition-root injection), bounded concurrency (`EMBEDDER_CONCURRENCY`),
this README section, and RFC-009 signature drift.

Full inventory + verdict: [EVID-029](https://github.com/gertsai/shared/blob/main/.forgeplan/evidence/EVID-029-code-audit-audit-2026-05-12-215927-verdict-fail-1-crit-12-high-wave-8-2-patch-closes-all-crit-high.md).
Wave 8.3 ship evidence: [EVID-030](https://github.com/gertsai/shared/blob/main/.forgeplan/evidence/) (created post-activation).

### Adoption checklist for downstream apps

**Copy verbatim** (patterns work as-is):

- `src/composition/logger.ts` factory + `REDACT_KEYS` extension shape
- `src/composition/errors.ts` HTTP-boundary scrubber (the
  `appErrorToHttpResponse` wrapper)
- `src/shared/errors.ts` neutral kernel re-export pattern
- Embedder ctor `manager?:` opt + composition-root injection

**Copy with tuning** (defaults are demo-grade):

- `EMBEDDER_RATE_LIMIT_RPS` / `EMBEDDER_BURST` — match upstream's metering
  posture
- `EMBEDDER_CONCURRENCY` — match worker hardware + cold-start tolerance
- `REDACT_KEYS` — extend with project-specific sensitive keys
- `allowedHostnames` — narrow per actual deployment

**Do NOT copy** (intentionally demo-specific):

- `STORAGE_PROVIDER=memory` mock fallback (production uses real Postgres)
- `AUTH_GATE=allow-all` (production wires OpenFGA)
- `MockEmbedder` (use Ollama or OpenAI in production)

### Migration recipe — `PermissionDeniedError` → modern taxonomy

Throw site (use case):

```ts
// Before (≤ Wave 8.0):
import { PermissionDeniedError } from './errors/permission-denied.error';
throw new PermissionDeniedError(userId, 'ingest', docId);

// After (Wave 8.1+):
import { permissionDenied } from '../shared/errors.js';
throw permissionDenied(userId, 'ingest', docId);
```

Catch site (inbound adapter / action):

```ts
// Before:
} catch (err) {
  if (err instanceof PermissionDeniedError) {
    return APIError(403, err.message);
  }
}

// After:
import { ForbiddenError } from '../../../../shared/errors.js';
} catch (err) {
  if (err instanceof ForbiddenError) {
    return APIError(403, err.message);
  }
  // OR: discriminated union
  if (isAppError(err) && err.kind === ErrorKind.FORBIDDEN) { /* ... */ }
}
```

HTTP boundary (one-time wiring per app):

```ts
import { appErrorToHttpResponse } from './composition/errors.js';
const { status, body } = appErrorToHttpResponse(err);
// body is RFC 9457 ProblemDetails with userId/url/originalKind scrubbed (Wave 8.2 Sec#3).
```

### Cross-references

- [ADR-011](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-011-sprint-3-11-production-grade-m9s-example-storage-authorization-async-lint-migration-choices.md)
  — Sprint 3.11 production-grade reference baseline.
- [ADR-013](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-013-tri-state-storage-capability-flag-boolean-to-structured-object-reshape-wave-7-2.md)
  — Wave 7.2 tri-state storage capability flag.
- [PRD-013](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-013-m9s-example-modernization-to-wave-5-6-7-reference-baseline.md)
  / [RFC-009](https://github.com/gertsai/shared/blob/main/.forgeplan/rfcs/RFC-009-wave-8-1-m9s-example-modernization-implementation-strategy.md)
  / [EVID-028](https://github.com/gertsai/shared/blob/main/.forgeplan/evidence/EVID-028-wave-8-1-ship-evidence-m9s-example-modernization-58-tests-0-regressions-195-loc-net.md)
  — Wave 8.1 ship.
- [EVID-029](https://github.com/gertsai/shared/blob/main/.forgeplan/evidence/EVID-029-code-audit-audit-2026-05-12-215927-verdict-fail-1-crit-12-high-wave-8-2-patch-closes-all-crit-high.md)
  — Wave 8.2 audit + closure inventory.
- [PRD-014](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-014-wave-8-3-audit-deferred-closure-hex-inversion-embedder-di-concurrency-readme-rfc-009-drift.md)
  / [RFC-010](https://github.com/gertsai/shared/blob/main/.forgeplan/rfcs/RFC-010-wave-8-3-strategy-chain-on-8-2-3-parallel-teammates-with-disjoint-ownership-shared-errors-kernel-relocation.md)
  / EVID-030 — Wave 8.3 ship (EVID-030 link added post-activation).

## Full-stack reference (Wave 9+)

Wave 9 ships a complete frontend + typed-contract layer alongside this backend
so adopters can copy a working end-to-end reference instead of stitching one
together from individual examples:

- [`examples/m9s-example-api-types/`](../m9s-example-api-types/) — generated
  OpenAPI 3.1 contract (`paths`, `components`) consumed via `openapi-fetch`.
  The `generate-openapi-contract.mjs` script snapshots the live backend
  `/openapi/schema.json` endpoint into a checked-in `.d.ts`, so frontend
  builds do not depend on a running backend.
- [`examples/m9s-example-web/`](../m9s-example-web/) — SvelteKit 2 + Svelte 5
  runes + Tailwind v4 web app with `/`, `/ingest`, `/search`, `/docs` routes.
  Type-safe end-to-end: a backend action signature change surfaces as a TS
  error in the frontend after `pnpm generate:openapi`.

### Quick start (3 terminals)

```bash
# Terminal 1 — infra
pnpm --filter @gertsai-examples/m9s-example infra:up

# Terminal 2 — backend (this package)
cp .env.example .env       # one-time
pnpm --filter @gertsai-examples/m9s-example dev    # → http://localhost:3031

# Terminal 3 — frontend
pnpm --filter @gertsai-examples/m9s-example-web dev    # → http://localhost:5173
```

The web app reads `PUBLIC_API_BASE_URL` (default `http://localhost:3031`) and
`PUBLIC_TENANT_ID` (default `tenant-acme`). Backend CORS is permissive in dev
(moleculer-web defaults) — no extra flags required on this side.

### Why SvelteKit 2 + openapi-fetch

Framework rationale captured in
[ADR-014](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-014-sveltekit-2-openapi-fetch-as-the-full-stack-reference-pattern-for-gertsai-example-applications.md).
TLDR: smallest interactive bundle + form actions + server load + Svelte 5
runes give the best DX/perf ratio for a SaaS-like reference in 2026.
`openapi-fetch` keeps the runtime ~5 KB while delivering compile-time
request/response types straight from the backend contract.

### Cross-references

- [PRD-015](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-015-wave-9-full-stack-reference-auto-openapi-emission-api-types-pkg-sveltekit-web.md)
  — Wave 9 requirements + acceptance.
- [RFC-011](https://github.com/gertsai/shared/blob/main/.forgeplan/rfcs/RFC-011-wave-9-strategy-pre-seed-monorepo-skeleton-4-parallel-teammates-with-disjoint-ownership.md)
  — 4-teammate parallel-execution strategy.
- [SPEC-019](https://github.com/gertsai/shared/blob/main/.forgeplan/specs/SPEC-019-wave-9-openapi-contract-path-map-problemdetails-request-response-schemas.md)
  — OpenAPI contract shape + path map.
- [EVID-029](https://github.com/gertsai/shared/blob/main/.forgeplan/evidence/EVID-029-code-audit-audit-2026-05-12-215927-verdict-fail-1-crit-12-high-wave-8-2-patch-closes-all-crit-high.md)
  — Wave 8.2 audit + closure narrative (pre-Wave-9 baseline).
- [PRD-016](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-016-wave-10-production-grade-web-ui-auth-ui-cms-file-upload-sse-i18n-storybook-error-ui.md)
  — Wave 10 deferred scope: auth UI, CMS/admin, file upload, SSE streaming,
  i18n, Storybook, production-grade error UI.

## Production Setup

Sprint 3.11 elevates this example from "mock-by-default" demo to a **real-infra
reference**: the default profile spins up Postgres+pgvector, OpenFGA, Redis,
Ollama, and NATS via a single `docker compose up`, applies migrations, and
boots the broker against live backends. Mock fallbacks remain available via
env override (per ADR-011 I-1) — see `.env.example` for the toggle matrix.

Architectural decisions are captured in **ADR-011** (with Amendment 1 ADI on
contested decisions and Amendment 2 reconciling the pre-Build audit). The
W-item map lives in **SPEC-016**. Both are read-only inputs to the Sprint 3.11
Build phase.

### Prerequisites

| Tool | Min version | Notes |
|---|---|---|
| Docker | 24+ | Compose v2 spec required (`docker compose`, not `docker-compose`) |
| Node.js | 22 LTS | matches `engines.node` in root `package.json` |
| pnpm | 10.x | matches the workspace lockfile generator |
| RAM | ≈ 3 GB free | full 5-service stack — Ollama is the heaviest (~1.5 GB resident) |

Free local ports: **5432** (Postgres), **6379** (Redis), **8080** (OpenFGA HTTP),
**4222** (NATS client) + **8222** (NATS monitoring), **11434** (Ollama).
`docker-compose.yml` binds each to `127.0.0.1` only — nothing leaks onto the
LAN by default.

### One-command bring-up

```bash
# from repo root
cd examples/m9s-example
cp .env.example .env             # placeholder credentials — edit before non-local use
docker compose up -d
docker compose ps                # wait for "healthy" on all 5 services (≈ 20-40 s)
```

> **First run takes longer** (≈ 1-2 min) — Docker pulls `pgvector/pgvector:pg16`
> + `openfga/openfga:v1.5` + `ollama/ollama:0.5.0` images (~3 GB total). Subsequent
> runs reuse the cached images and the named volumes (`postgres-data`,
> `ollama-data`, `m9s-redis-data`).

### Apply migrations

The Postgres container starts empty. Apply the schema migration before booting
the broker (or set `MIGRATIONS_AUTO_APPLY=true` to let the broker apply on
boot — convenient for the demo, **not** recommended for production).

```bash
pnpm --filter @gertsai-examples/m9s-example install      # if not already installed
pnpm --filter @gertsai-examples/m9s-example migrate:status   # → "0 applied / 1 pending"
pnpm --filter @gertsai-examples/m9s-example migrate:up
pnpm --filter @gertsai-examples/m9s-example migrate:status   # → "1 applied / 0 pending"
```

Migration tooling is documented in [`migrations/README.md`](./migrations/README.md)
— file naming, `pg_migrations` tracking, rollback semantics, idempotency
contract (ADR-011 I-3, I-15).

### Bootstrap OpenFGA

OpenFGA starts with an empty catalog. The bootstrap script is **idempotent** —
it (a) creates the store if missing, (b) writes/updates the authorization
model from `openfga/model.fga`, (c) seeds tenant-membership tuples from
`openfga/bootstrap-tuples.yaml`, (d) prints the `FGA_STORE_ID` to paste back
into `.env`.

```bash
pnpm --filter @gertsai-examples/m9s-example openfga:bootstrap
# → FGA_STORE_ID=01HXXX...     copy this into .env
```

The ReBAC model + tuple shape are explained in
[`openfga/README.md`](./openfga/README.md) — DSL walkthrough, 2-hop check
resolution, how to add a new tenant + user, the adversarial cross-tenant
DENY test from W-3-11-8a.

### Boot the broker

```bash
pnpm --filter @gertsai-examples/m9s-example start
```

The broker reads `.env`, connects to Postgres + Redis + OpenFGA + Ollama,
registers the canonical Wave 5 middleware chain (`tenantMiddleware →
sessionMiddleware`), and exposes `/api/v1/ingest/document` and
`/api/v1/search/query` on `WEB_SERVER_PORT` (default `3000`).

### Smoke verification

In a second terminal — ingest a document, wait for the queue worker to chunk
+ embed + persist, then search:

```bash
# 1. Ingest — returns immediately with mode='queued' (async eventual consistency)
curl -s -X POST http://localhost:3000/api/v1/ingest/document \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant-acme' \
  -d '{"docId":"d1","text":"Hexagonal architecture isolates the core from transport and persistence."}' | jq
# → {"success":true,"data":{"docId":"d1","jobId":"...","mode":"queued","chunkCount":null}}

# 2. Wait for the worker to embed + persist (1-5 s window — see §Async caveats)
sleep 5

# 3. Search — returns top-K chunks ranked by cosine similarity in pgvector
curl -s -X POST http://localhost:3000/api/v1/search/query \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant-acme' \
  -d '{"query":"core isolation","topK":3}' | jq
# → {"success":true,"data":{"hits":[{"docId":"d1","ordinal":0,"score":0.78, ...}]}}
```

If search returns `hits: []` immediately after ingest, the worker hasn't
caught up — wait another second and retry. This is **not a bug**; see below.

### Async caveats — eventual consistency

Sprint 3.11 turns BullMQ async ingest **on by default** (`REDIS_URL` populated
in `.env.example`, per ADR-011 Decision C). The flow is:

```
HTTP /ingest  ──▶  documents.INSERT (sync)  ──▶  job enqueued (sync)  ──▶  HTTP 200 mode='queued'
                                                                            │
                                                                            ▼
                                                         BullMQ worker  ──▶  embed + chunks.INSERT
                                                                            │
                                                                            ▼
                                                         search hits become visible (eventually)
```

**Observable contract** (codified in `tests/real-infra/bullmq.test.ts` per
Amendment 2 §A2.9):

- `POST /ingest/document` returns `mode='queued'` **immediately**, before any
  chunks are persisted.
- `POST /search/query` for the just-ingested doc returns `[]` until the worker
  completes — typically **1-5 s** end-to-end (embed call dominates the window).
- After the worker completes, the document is searchable on the next query.

If you need synchronous semantics for a one-shot demo or a debugging session,
unset `REDIS_URL` in `.env` and restart — the broker falls back to inline
ingest (`mode='inline'`, `chunkCount` populated synchronously). Mock fallback
preserved per ADR-011 I-1.

### ⚠️ SECURITY (read before deploying)

1. **`AUTH_GATE=allow-all` is BANNED in production.** Per ADR-011 I-12, the
   `AllowAllPermissionGate` constructor throws `ConfigurationError` when
   `process.env.NODE_ENV === 'production'`. A `WARN` log is emitted on every
   construction regardless of NODE_ENV — visible at boot. Production deploys
   with `AUTH_GATE=allow-all` env **cannot** succeed.
2. **`FGA_API_TOKEN` is required for production OpenFGA.** Per ADR-011 I-16,
   the gate uses preshared bearer auth (`Authorization: Bearer ${token}`).
   The local docker-compose runs OpenFGA without auth — the empty token is
   acceptable for development only. Production deployments MUST terminate
   TLS in front of the OpenFGA service and rotate the token.
3. **`.env` is gitignored.** The committed `.env.example` carries placeholder
   credentials only (`change-me-on-deploy`). Never commit a real `.env`.
4. **Cross-tenant data isolation is defence-in-depth.** Every `chunks` SQL
   issued by `pg-vector.store.ts` includes a mandatory `WHERE tenant_id = $1`
   clause (ADR-011 I-13). This is the **last line of defence** if the
   OpenFGA gate is misconfigured. Adversarial test in
   `tests/real-infra/pg-vector.test.ts` verifies the constraint.
5. **`HeaderStrategy({ trustProxy: true })`** in `composition/wave5-middlewares.ts`
   reads `X-Tenant-ID` from inbound HTTP. Production deployments MUST front
   the broker with a reverse proxy that **strips client-supplied
   `X-Tenant-ID` and re-sets it from authenticated context** — without that
   guarantee any client can spoof the header. See §Wave 5 stack reference
   above for the full deployment contract (ADR-010 I-14).

### OpenFGA glossary (DSL → domain UL)

| OpenFGA DSL | Domain Ubiquitous Language | Example |
|---|---|---|
| `type user` | identity principal performing the request | `user:default`, `user:alice` |
| `type tenant` | top-level isolation boundary (per ADR-006 ACL) | `tenant:tenant-acme` |
| `type document` | per-tenant document resource (FK by tenant) | `document:01HXXX...` |
| `member` (relation on tenant) | "user U is a member of tenant T" | tuple seeded by `openfga-bootstrap.ts` |
| `tenant` (relation on document) | "document D belongs to tenant T" | tuple written post-INSERT in `pg-document.repository.ts` |
| `can_view` / `can_edit` (relation on document) | derived: `member from tenant` (B2 hierarchy) | resolved at gate check time |

Full canonical reference: `@gertsai/auth-openfga` package
(`FgaResourceType` + `FGA_RELATIONS` constants, per Amendment 2 §A2.2).

### Tear-down

```bash
docker compose down              # stops + removes containers, keeps volumes
docker compose down -v           # also drops postgres-data, ollama-data, m9s-redis-data
```

Drop the volumes (`-v`) when you want a clean Postgres / Ollama / Redis state
for the next `docker compose up`. Otherwise the migrations stay applied and
the seeded tuples persist — which is usually what you want during dev.

### Common errors

| Error message | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Postgres still booting (no health yet) | `docker compose ps` — wait for `(healthy)`; first run pulls + initialises (~30 s) |
| `OpenFGA store not found` | bootstrap script not run, or store dropped | re-run `pnpm openfga:bootstrap`; paste the printed `FGA_STORE_ID` into `.env` |
| `Ollama: model 'nomic-embed-text' not found` | model not pulled into the volume | `docker exec m9s-example-ollama ollama pull nomic-embed-text` |
| `pg_migrations relation does not exist` | migration runner failed mid-init | re-run `pnpm migrate:up`; the `IF NOT EXISTS` guards make it safe to retry |
| Search returns `[]` 5+ s after ingest | HNSW index slow on first query (<10 rows) | retry once — pgvector caches the build; or seed more docs to amortise |
| `redis-cli: connection refused` | Redis container restarting under load | `docker compose logs redis`; confirm `redis-server: ready` line |
| `ConfigurationError: AllowAll refuses NODE_ENV=production` | env propagation accident (per I-12) | unset `NODE_ENV=production` for local dev, OR set `AUTH_GATE=openfga` |

### Cross-references

- [`migrations/README.md`](./migrations/README.md) — migration tooling docs
  (ADR-011 §Decision E LOCKED E1 + Amendment 2 §A2.6 + I-15).
- [`openfga/README.md`](./openfga/README.md) — ReBAC model + tuple management
  (ADR-011 §Decision B LOCKED B2 + Amendment 2 §A2.1-A2.4).
- ADR-011 — production-grade m9s-example architectural decisions
  (with Amendment 1 ADI + Amendment 2 pre-Build audit synthesis).
- SPEC-016 — Sprint 3.11 W-item map.
- RFC-002 — cross-package strategy.
- EVID-019 — Sprint 3.11 evidence pack (post-Build).

## License

Apache-2.0. Same as the rest of the `gertsai/shared` monorepo.
