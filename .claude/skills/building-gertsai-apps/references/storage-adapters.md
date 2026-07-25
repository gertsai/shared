# Storage adapters & ports (swapping backends)

## What & why

m9s-example follows strict hexagonal **Ports-and-Adapters**: the domain and
application layers depend only on narrow **outbound port interfaces**
(`IDocumentStore` / `IChunkStore` / `IEmbedder` / `IRotationStore` /
`IPermissionGate`), and `infrastructure/` holds the concrete adapters. A single
**composition root** (`src/composition/infrastructure.ts`) is the only place that
selects concrete adapters, doing env-driven backend swaps
(`STORAGE_PROVIDER` memory|postgres, `EMBEDDER_PROVIDER` mock|ollama|openai,
`REDIS_URL` for rotation, `AUTH_GATE` for permissions) and wiring them into a
shared `SharedInfrastructure` object.

There are **two distinct storage strategies** in play:

1. **The `@gertsai` abstract `IStorageProvider` stack** — `DocumentRepository`
   extends `BaseEntityStorageService` over `InMemoryStorageProvider` /
   `PgStorageProvider`. This is jsonb-blob shaped (Read == Write envelope) and
   gives free audit stamping. Perfect for generic entities.
2. **Direct `PgClient` raw-SQL adapters** (`PgDocumentRepository` /
   `PgVectorStore`) — used when the schema is normalised with
   `tenant_id` / `owner_uuid` / `vector(768)` columns that a jsonb envelope
   cannot model.

Both strategies sit behind the **same** port, so callers are none the wiser.
Swapping a backend is a **one-file change** in the composition root that never
touches domain or application code.

## How it works in m9s-example

### Outbound port + infrastructure adapter (hexagonal seam)

- **What** — Every external dependency (document store, vector store, embedder,
  rotation store, permission gate) is expressed as a TypeScript interface in
  `src/domain/ports/`. Concrete implementations live in `src/infrastructure/`
  and implement that interface. Domain and application code import only the
  port type, never a concrete class.
- **Why** — Lets you swap backends (memory→Postgres, mock→Ollama→OpenAI,
  in-memory→Redis) without touching business logic, and lets use-case tests mock
  the port with `vi.fn()` instead of standing up real infra. This is the
  load-bearing design that makes "swapping backends" a one-file change.
- **How** — Define the interface in `domain/ports/IFoo.ts` (async,
  Promise-returning methods, readonly fields). Implement
  `class FooAdapter implements IFoo` in `infrastructure/`. Use cases declare a
  constructor param typed as `IFoo`. Wire the concrete in the composition root
  only.

### Single composition root with env-driven backend selection

- **What** — `src/composition/infrastructure.ts` builds the entire
  outbound-adapter graph exactly once at module-load time and exports a frozen
  `infrastructure: SharedInfrastructure` object. Per-backend `pickX()` helpers
  read env-derived config (`STORAGE_PROVIDER`, `EMBEDDER_PROVIDER`, `REDIS_URL`,
  `AUTH_GATE`) and return the port-typed adapter, defaulting to the
  zero-dependency in-memory/mock impls.
- **Why** — Centralises ALL knowledge of concrete adapters in one file
  (everything else depends on ports). The module-load-time singleton guarantees
  both services see the **SAME** instance — critical for the in-memory demo
  where two `MemoryVectorStore` instances would make search always return 0
  results. Defaults that boot with zero env vars keep the example runnable
  out-of-the-box.
- **How** — Write a `buildInfrastructure()` that calls
  `pickStores()` / `pickEmbedder()` / etc., each a
  `switch (config.X) { case '...': return new ConcreteAdapter(...); default: return new InMemoryFallback(); }`.
  Fail-closed on production+insecure combos (throw if `AUTH_GATE='allow-all'`
  under `NODE_ENV='production'`). Export `const infrastructure = buildInfrastructure()`
  plus the builder fn so tests can construct isolated instances.

### Two storage strategies: abstract IStorageProvider vs direct PgClient raw SQL

- **What** — Strategy A (`DocumentRepository`) extends
  `BaseEntityStorageService<Meta>` over a pluggable `IStorageProvider`
  (`InMemoryStorageProvider` or `PgStorageProvider`) — free audit stamping,
  jsonb-blob shape. Strategy B (`PgDocumentRepository`, `PgVectorStore`)
  implements the ports directly over raw `PgClient` SQL when the schema is
  normalised (`tenant_id`, `owner_uuid`, `vector(768)` columns) that a jsonb
  `(id, data)` envelope cannot model.
- **Why** — The `IStorageProvider` abstraction is jsonb-blob shaped
  (Read == Write), perfect for generic entities + audit propagation, but it
  cannot express column-level constraints, indexes, FK relations, or pgvector
  ops. Real production schemas lean on those, so the example deliberately shows
  BOTH paths behind the SAME port so the consumer is none the wiser.
- **How** — For generic entities pick Strategy A:
  `class Repo extends BaseEntityStorageService<Meta> implements IPort`, wire
  `new InMemoryStorageProvider<Meta>()` (dev) or `PgStorageProvider` from
  `@gertsai/pg-client/storage` (prod over
  `CREATE TABLE x (id text PK, data jsonb)`). For normalised/vector schemas
  pick Strategy B: implement the port directly, take a `PgClient` in the
  constructor, use query-dsl `compileToSql` for SELECT-by-id and raw
  `$queryRaw` / `$executeRaw` tagged templates for everything `compileToSql`
  can't model.

### PgClient as the swappable DB-driver seam

- **What** — All raw-SQL adapters depend on the `@gertsai/pg-client.PgClient`
  interface (3 methods: `$queryRaw` / `$executeRaw` / `$disconnect`,
  tagged-template shape) — never on `pg` directly. `PgClientAdapter` is a thin
  `pg.Pool` wrapper that rebuilds the tagged template into `$1,$2` positional
  params. A `createPgClient` factory keeps the `pg` import out of test files;
  `mockPgClient` (regex-matched results) substitutes in tests.
- **Why** — Decouples adapters from the concrete driver (Prisma, postgres.js,
  node-postgres all satisfy the structural shape). Tests run against
  `mockPgClient` with zero DB. The tagged-template shape matches Prisma so a
  `PrismaClient` is a drop-in.
- **How** — Type repo constructors as `readonly client: PgClient`. Implement
  the adapter once (`class PgClientAdapter implements PgClient` wrapping
  `new Pool(...)`, rebuilding SQL with `strings.reduce` → `$${i+1}`). For tests
  inject `mockPgClient({ queryResults: [{ pattern: /FROM x/i, result: [...] }] })`.

### RestRequestManager-fronted outbound HTTP adapters (embedders)

- **What** — `OllamaEmbedder` and `OpenAIEmbedder` route all HTTP through a
  `@gertsai/rest-request-manager.RestRequestManager` (retry + token-bucket
  rate-limit + per-host LRU circuit-breaker + timeout + SSRF allowlist). The
  manager translates non-2xx/transport failures into typed `@gertsai/errors`
  `AppError` subclasses, which the embedder re-wraps with domain hints. The
  manager is injected from the composition root (preferred) with a module-level
  lazy per-host `Map` fallback.
- **Why** — Centralises resilience + security posture for outbound calls
  without hand-rolling retries. `AppError` translation lets callers switch on
  `err.kind` (`UNAUTHORIZED`→check API key, `RATE_LIMITED`→slow down) instead of
  grepping undici stack traces. The SSRF allowlist scoped to the parsed hostname
  (CWE-918) prevents an attacker-controlled URL pivoting to internal services
  even with `allowLocalhost` on.
- **How** — Build a configured `RestRequestManager` in the composition root
  (scope `security.allowedHostnames: [parsedHostname]`, set
  `retry`/`rateLimit`/`circuitBreaker`). Inject via optional `manager?:` ctor
  opt. In `embed()` call
  `manager.request({ url, method, headers, body, timeoutMs })`; in catch,
  `if (isAppError(err)) throw new <Domain>Error({ message, details, cause: err })`.

### Tenant-scoping as a security invariant in SQL adapters

- **What** — Both `PgDocumentRepository` and `PgVectorStore` take a branded
  `TenantId` (from `@gertsai/tenant`, validated via `asTenantId` at the
  composition boundary) and include `WHERE tenant_id = $1` (reads) / an explicit
  `tenant_id` column (writes) on EVERY SQL statement (ADR-011 I-13). This is the
  last line of defence against cross-tenant leakage if the OpenFGA gate is
  misconfigured.
- **Why** — Defence-in-depth: even with the permission gate failing open, the
  data layer physically cannot return another tenant's rows. The branded
  `TenantId` type rejects plain strings at compile time so callers must route
  through `asTenantId` / `getTenantIdStrict`.
- **How** — Type the ctor option as `readonly tenantId: TenantId`. Brand it
  once at the composition root with `asTenantId(config.TENANT_ID)`. Add the
  tenant filter to every query (an adversarial test should assert it against
  live Postgres).

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// ===========================================================================
// 1. PORT — src/domain/ports/IThingStore.ts
//    Outbound port. Async surface. Domain/application import ONLY this type.
// ===========================================================================
import type { Thing } from '../thing';

export interface IThingStore {
  // TODO: keep methods narrow (ISP) — split read/write/delete into separate
  // interfaces if different callers need different subsets.
  save(thing: Thing): Promise<void>;
  findById(id: string): Promise<Thing | null>;
}

// ===========================================================================
// 2a. ADAPTER STRATEGY A — abstract IStorageProvider stack (jsonb-blob shape,
//     free audit stamping). src/infrastructure/thing.repository.ts
// ===========================================================================
import {
  BaseEntityStorageService,
  type IStorageProvider,
} from '@gertsai/entity-storage';
import type { Session } from '@gertsai/session';
import { timestampToMillis, type MutationMarks, type EntityBasicStatus } from '@gertsai/entity-audit';
import type { StorageCapabilities, StorageMetadata } from '@gertsai/storage-core';

interface ThingWriteShape { readonly name: string }
interface ThingReadShape extends ThingWriteShape, MutationMarks {
  readonly _uid: string;
  readonly status: EntityBasicStatus;
}
// Indexed fields are the only ones a future query DSL can filter on.
type ThingMeta = StorageMetadata<ThingReadShape, ThingWriteShape, '_uid' | 'status'>;
export type { ThingMeta };

export class ThingRepository
  extends BaseEntityStorageService<ThingMeta>
  implements IThingStore
{
  private readonly _capabilities: StorageCapabilities;
  constructor(provider: IStorageProvider<ThingMeta>, session: Session) {
    super({ provider, session, path: 'things' });
    // Freeze the capability object once (avoid per-read allocation).
    this._capabilities = Object.freeze({
      ...super.capabilities,
      upsert: Object.freeze({ supported: true, preservesCreatorAudit: true }),
    });
  }
  override get capabilities(): StorageCapabilities { return this._capabilities; }

  async save(thing: Thing): Promise<void> {
    const existing = await this.get(thing.id);
    if (existing) { await this.update(thing.id, { name: thing.name }); return; }
    await this.set({ _uid: thing.id, name: thing.name }); // stamps created_* audit
  }
  async findById(id: string): Promise<Thing | null> {
    const stored = await this.get(id);
    if (!stored) return null;
    return { id: stored._uid, name: stored.name }; // strip audit envelope
  }
}

// ===========================================================================
// 2b. ADAPTER STRATEGY B — direct PgClient raw SQL (normalised schema with
//     tenant_id/owner columns). src/infrastructure/pg-thing.repository.ts
// ===========================================================================
import type { PgClient } from '@gertsai/pg-client';
import { defineQueryConstraints } from '@gertsai/query-dsl';
import { compileToSql } from '@gertsai/query-dsl/sql';
import type { StorageMetadata as SM } from '@gertsai/storage-core';
import type { TenantId } from '@gertsai/tenant';

type ThingQueryMeta = SM<unknown, unknown, 'id' | 'tenant_id'>;
const q = defineQueryConstraints<ThingQueryMeta>();

export interface PgThingRepositoryOptions {
  readonly client: PgClient;          // typically PgClientAdapter in prod, mockPgClient in tests
  readonly tenantId: TenantId;        // branded — every SQL is filtered by this (security invariant)
  readonly ownerUuid: string;
}

export class PgThingRepository implements IThingStore {
  private readonly client: PgClient;
  private readonly tenantId: TenantId;
  private readonly ownerUuid: string;
  constructor(opts: PgThingRepositoryOptions) {
    this.client = opts.client;
    this.tenantId = opts.tenantId;
    this.ownerUuid = opts.ownerUuid;
  }
  async save(thing: Thing): Promise<void> {
    // SELECT-by-id via query-dsl (compileToSql v0.1 emits only `SELECT * FROM <t>`).
    const compiled = compileToSql(
      [q.where('id', '==', thing.id), q.where('tenant_id', '==', this.tenantId), q.limit(1)] as const,
      'things',
    );
    const existing = await rawQuery<{ id: string }>(this.client, compiled.sql, compiled.params);
    if (existing.length > 0) {
      // INSERT/UPDATE not modelled by compileToSql — raw SQL escape hatch. KEEP tenant_id filter.
      await this.client.$executeRaw`UPDATE things SET name = ${thing.name} WHERE id = ${thing.id} AND tenant_id = ${this.tenantId}`;
      return;
    }
    await this.client.$executeRaw`INSERT INTO things (id, tenant_id, owner_uuid, name) VALUES (${thing.id}, ${this.tenantId}, ${this.ownerUuid}, ${thing.name})`;
    // TODO: side-effects (e.g. lazy-import @gertsai/auth-openfga writeTuples) go here, fail-closed + swallowed.
  }
  async findById(id: string): Promise<Thing | null> {
    const rows = await this.client.$queryRaw<{ id: string; name: string }>`
      SELECT id, name FROM things WHERE id = ${id} AND tenant_id = ${this.tenantId} LIMIT 1`;
    if (rows.length === 0) return null;
    return { id: rows[0]!.id, name: rows[0]!.name };
  }
}
// Bridge compileToSql's positional (sql, params) to PgClient's tagged-template shape.
// Mirrors @gertsai/pg-client/src/storage-provider.ts — fragment carries NO user input.
function rawQuery<T = unknown>(client: PgClient, sql: string, params: ReadonlyArray<unknown>): Promise<T[]> {
  const parts = sql.split(/\$\d+/g);
  const template = Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
  return client.$queryRaw<T>(template, ...params);
}

// ===========================================================================
// 3. DRIVER ADAPTER — src/infrastructure/pg-client.adapter.ts
//    Thin pg.Pool wrapper conforming to PgClient. Factory keeps `pg` out of tests.
// ===========================================================================
import { Pool, type PoolConfig } from 'pg';
export interface PgClientAdapterOptions {
  readonly connectionString: string;
  readonly poolOpts?: Omit<PoolConfig, 'connectionString'>;
}
function rebuildSql(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce<string>((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '');
}
export class PgClientAdapter implements PgClient {
  readonly pool: Pool;
  constructor(opts: PgClientAdapterOptions) {
    this.pool = new Pool({ connectionString: opts.connectionString, ...opts.poolOpts });
  }
  async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    return (await this.pool.query(rebuildSql(strings, values), values)).rows as T[];
  }
  async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    return (await this.pool.query(rebuildSql(strings, values), values)).rowCount ?? 0;
  }
  async $disconnect(): Promise<void> { await this.pool.end(); }
}
export function createPgClient(opts: PgClientAdapterOptions): PgClient { return new PgClientAdapter(opts); }

// ===========================================================================
// 4. COMPOSITION ROOT — src/composition/infrastructure.ts
//    The ONLY place concrete adapters are constructed. Env-driven swap.
// ===========================================================================
import config from '../../project.config';
import { InMemoryStorageProvider } from '@gertsai/entity-storage';
import { Session } from '@gertsai/session';
import { asTenantId } from '@gertsai/tenant';

export interface SharedInfrastructure { readonly thingStore: IThingStore }

function pickThingStore(): IThingStore {
  switch (config.STORAGE_PROVIDER) {
    case 'postgres': {
      if (!config.POSTGRES_URL) throw new Error("STORAGE_PROVIDER='postgres' requires POSTGRES_URL.");
      const client = new PgClientAdapter({ connectionString: config.POSTGRES_URL });
      const tenantId = asTenantId(config.TENANT_ID); // brand once at the boundary (throws on empty)
      return new PgThingRepository({ client, tenantId, ownerUuid: config.DEFAULT_OWNER_UUID });
    }
    case 'memory':
    default: {
      const provider = new InMemoryStorageProvider<ThingMeta>();
      const session = new Session({ /* TODO operatorUuid/operatorType/tokenGetter/dialog */ } as never);
      return new ThingRepository(provider, session);
    }
  }
}
export function buildInfrastructure(): SharedInfrastructure {
  return { thingStore: pickThingStore() };
}
// Module-level singleton — guarantees every importer sees the same instance.
export const infrastructure: SharedInfrastructure = buildInfrastructure();
```

## Best practices

- Define every external dependency as an outbound port interface in
  `domain/ports/` and implement it in `infrastructure/`. Use cases and domain
  code import ONLY the port type — never a concrete adapter class. This is what
  makes a backend swap a one-file change.
- Centralise ALL concrete-adapter construction in a single composition root
  (`src/composition/infrastructure.ts`). Everywhere else depends on ports.
  Export the built graph as a module-level singleton so all consumers (both
  Moleculer services) observe the SAME instance — otherwise two in-memory stores
  in one process desynchronise (ingest writes invisible to search).
- Pick the right storage strategy per schema shape: use
  `BaseEntityStorageService` over a pluggable `IStorageProvider`
  (`InMemoryStorageProvider` dev, `PgStorageProvider` prod) for generic
  jsonb-blob entities that want free audit stamping; drop to direct `PgClient`
  raw SQL when you have a normalised schema with real columns/indexes/FKs or
  pgvector that a jsonb `(id, data)` envelope cannot model.
- Depend on the `@gertsai/pg-client.PgClient` interface, never on `pg`/Prisma
  directly. Ship a thin `PgClientAdapter` wrapping `pg.Pool` plus a
  `createPgClient` factory so the `pg` import stays out of test files; inject
  `mockPgClient` (regex-matched results) in unit tests for zero-DB runs.
- Default every `pickX()` helper to the zero-dependency in-memory/mock
  implementation so the example boots with no env vars, and throw fail-closed on
  insecure production combos (e.g. `AUTH_GATE='allow-all'` under
  `NODE_ENV='production'`).
- Split fat ports per the Interface Segregation Principle
  (`IDocumentStore`=save/findById, `IDocumentQuery`=list/count,
  `ISoftDeletableDocumentStore`=softDelete). Concrete adapters implement the
  union, but callers depend on the narrowest interface they actually need; mark
  the convenience union `@deprecated`.
- Brand tenant ids with `@gertsai/tenant.TenantId` and validate via
  `asTenantId()` at the composition boundary. In raw-SQL adapters include
  `WHERE tenant_id = $1` (reads) / explicit `tenant_id` column (writes) on EVERY
  statement as defence-in-depth against cross-tenant leakage, and back it with
  an adversarial test against live Postgres.
- Front outbound HTTP adapters (embedders) with a `RestRequestManager` for
  retry/rate-limit/circuit-breaker/timeout/SSRF, inject the configured manager
  from the composition root, and translate the resulting typed `AppError`
  (switch on `err.kind`) into domain errors with actionable hints while
  preserving the original via `cause`.
- When an abstraction (`compileToSql` v0.1) only models part of your query
  (just `SELECT * FROM <t>`), use it for the cases it fits (SELECT-by-id) and
  keep raw SQL as a documented escape hatch for INSERT/UPDATE/aggregate/vector
  ops — don't force the abstraction.
- Adapters that cannot honour an operation (e.g. soft-delete before a migration)
  must throw a typed domain error (`PgSoftDeleteNotSupportedError` → HTTP 501)
  rather than silently no-op — preserves Liskov substitutability across the port.

## Pitfalls

- **Per-service adapter construction.** Constructing adapters per-service
  instead of in a shared composition root: two `new MemoryVectorStore()`
  instances in the same Node process means search never sees what ingest wrote
  (returns 0 results). The fix is the module-load-time singleton in
  `src/composition/infrastructure.ts`.
- **Assuming `IStorageProvider`/`PgStorageProvider` fits any Postgres schema.**
  It is jsonb-blob shaped (`CREATE TABLE x (id text PK, data jsonb)`,
  Read == Write) and CANNOT model normalised columns, `tenant_id`/`owner_uuid`,
  FKs, or `vector(768)`. m9s-example deliberately uses direct `PgClient` raw SQL
  (`PgDocumentRepository`/`PgVectorStore`) for those — see `document.meta.ts`
  which is type-level documentation only, not wired into `PgStorageProvider`.
- **Overreaching `compileToSql` v0.1.** It emits ONLY `SELECT * FROM <table>`
  (plus where/orderBy/limit). It does not support INSERT, UPDATE, COUNT, aliases,
  expression lists, or pgvector `<=>`. Using it for those silently produces wrong
  SQL — keep them as raw tagged-template SQL.
- **The findById tombstone-splice trick.**
  (`sql.replace(' LIMIT ', ' AND deleted_at IS NULL LIMIT ')`) silently no-ops if
  `compileToSql` ever stops emitting a `LIMIT` clause, bypassing the soft-delete
  filter and returning deleted rows. m9s guards this with a runtime
  `if (!sql.includes(' LIMIT ')) throw` — replicate that fail-loud assertion.
- **Forgetting `WHERE tenant_id` on a single statement** in a multi-tenant
  adapter is a cross-tenant data-leak. ADR-011 I-13 mandates it on every
  chunks/documents query; an adversarial real-infra test enforces it.
- **Postgres uuid columns reject arbitrary strings (error 22P02).** Validate ids
  against a canonical-UUID regex before INSERT (`coerceUuid`) so you surface a
  clean error instead of a raw pg parse failure.
- **Redis `KEYS *` for revoke is production-unsafe** (blocks the server).
  `RedisRotationStore` uses `SCAN` (incremental, cooperative, COUNT-bounded) with
  a defensive iteration cap; copy that, not `KEYS`.
- **Atomicity is backend-specific.** `InMemoryRotationStore` relies on
  single-threaded Node sequencing (no `await` between read-then-write of `used`),
  while `RedisRotationStore` needs server-side Lua via `EVAL` because multiple
  clients race. Don't assume a naive Redis GET-then-SET is atomic.
- **SQL-backed adapters ship `capabilities.listeners=false`** and throw
  `ListenersNotSupportedError` — branch on `provider.capabilities.listeners`
  before subscribing, or fall back to polling; only `InMemoryStorageProvider`
  supports real listeners today.
- **`runTransaction` never retries** — Postgres SQLSTATE 40001/40P01 surface as
  `TransactionConflictError` and the caller MUST wrap in a bounded `withRetry`
  loop. Also: `TransactionConflictError` under low concurrency usually signals
  missing indexes on WHERE columns.
- **The embedder `dimensions` field is best-effort before the first `embed()`
  returns** (latched from the first response). Code that reads
  `embedder.dimensions` at startup gets the provider default (768 Ollama /
  1536 OpenAI / 384 mock), not the real model dimensionality.

## Canonical files

- [`examples/m9s-example/src/composition/infrastructure.ts:96`](../../../../examples/m9s-example/src/composition/infrastructure.ts) — Composition root: `buildInfrastructure()` + `pickStores()`/`pickEmbedder()`/`pickGate()`/`pickRotationStore()` env-driven adapter selection; the ONLY place concrete adapters are constructed.
- [`examples/m9s-example/src/composition/infrastructure.ts:190`](../../../../examples/m9s-example/src/composition/infrastructure.ts) — `pickStores()`: the `STORAGE_PROVIDER='memory'|'postgres'` switch; wires both the `IStorageProvider` stack and the raw-`PgClient` stack behind the same `FullDocumentStore` + `IChunkStore` ports.
- [`examples/m9s-example/src/domain/ports/IDocumentStore.ts:54`](../../../../examples/m9s-example/src/domain/ports/IDocumentStore.ts) — Port definition with ISP split: narrow `IDocumentStore` (save/findById) + `IDocumentQuery` (listSummaries/count) + `ISoftDeletableDocumentStore` (softDelete); callers depend on the narrowest interface they need.
- [`examples/m9s-example/src/domain/ports/IChunkStore.ts:10`](../../../../examples/m9s-example/src/domain/ports/IChunkStore.ts) — Vector-store port (addChunks/search) — backend-agnostic; backed by `MemoryVectorStore` or `PgVectorStore`.
- [`examples/m9s-example/src/domain/ports/IEmbedder.ts:10`](../../../../examples/m9s-example/src/domain/ports/IEmbedder.ts) — Embedder port (`embed` + readonly `dimensions`) — backed by Mock/Ollama/OpenAI adapters.
- [`examples/m9s-example/src/domain/ports/IRotationStore.ts:56`](../../../../examples/m9s-example/src/domain/ports/IRotationStore.ts) — Refresh-token rotation port with discriminated `ConsumeResult` union — backed by InMemory or Redis adapters.
- [`examples/m9s-example/src/infrastructure/document.repository.ts:100`](../../../../examples/m9s-example/src/infrastructure/document.repository.ts) — Adapter strategy A: `DocumentRepository` extends `BaseEntityStorageService<DocumentMeta>` (the `@gertsai` abstract `IStorageProvider` stack); free audit stamping, jsonb-blob shape, frozen capabilities with upsert object.
- [`examples/m9s-example/src/infrastructure/pg-document.repository.ts:87`](../../../../examples/m9s-example/src/infrastructure/pg-document.repository.ts) — Adapter strategy B: `PgDocumentRepository` implements the ports directly over raw `PgClient` SQL for a normalised `tenant_id`/`owner_uuid` schema; query-dsl for SELECT-by-id, raw SQL escape hatch for INSERT/UPDATE/aggregate; `tenant_id` filter is a security invariant; lazy OpenFGA tuple write.
- [`examples/m9s-example/src/infrastructure/pg-vector.store.ts:60`](../../../../examples/m9s-example/src/infrastructure/pg-vector.store.ts) — `PgVectorStore` implements `IChunkStore` over pgvector via `PgClient` raw SQL; mandatory `WHERE tenant_id = $1` on every query (ADR-011 I-13 anti cross-tenant leakage); cosine distance via `<=>` operator.
- [`examples/m9s-example/src/infrastructure/memory-vector.store.ts:17`](../../../../examples/m9s-example/src/infrastructure/memory-vector.store.ts) — `MemoryVectorStore`: array + `cosineSimilarity` reference `IChunkStore` for tests/demos.
- [`examples/m9s-example/src/infrastructure/pg-client.adapter.ts:40`](../../../../examples/m9s-example/src/infrastructure/pg-client.adapter.ts) — `PgClientAdapter`: thin `pg@^8` Pool wrapper conforming to `@gertsai/pg-client.PgClient`; rebuilds tagged-template into `$1,$2` positional placeholders; `createPgClient` factory keeps `pg` import out of tests.
- [`examples/m9s-example/src/infrastructure/ollama-embedder.ts:189`](../../../../examples/m9s-example/src/infrastructure/ollama-embedder.ts) — `OllamaEmbedder`: `IEmbedder` over `RestRequestManager` (retry/rate-limit/circuit-breaker/SSRF allowlist); per-host manager Map fallback + injected manager; dimensions latched on first response; `AppError` mapping.
- [`examples/m9s-example/src/infrastructure/openai-embedder.ts:144`](../../../../examples/m9s-example/src/infrastructure/openai-embedder.ts) — `OpenAIEmbedder`: batched `IEmbedder`; maps `AppError` kind (UNAUTHORIZED/RATE_LIMITED) to domain errors; authorization header redaction; llm-costs emission.
- [`examples/m9s-example/src/infrastructure/mock-embedder.ts:27`](../../../../examples/m9s-example/src/infrastructure/mock-embedder.ts) — `MockEmbedder`: deterministic offline hash-based `IEmbedder` for zero-dependency boot/tests.
- [`examples/m9s-example/src/infrastructure/in-memory-rotation.store.ts:59`](../../../../examples/m9s-example/src/infrastructure/in-memory-rotation.store.ts) — `InMemoryRotationStore`: Map-backed `IRotationStore` with single-threaded atomicity + unref'd prune timer.
- [`examples/m9s-example/src/infrastructure/redis-rotation.store.ts:105`](../../../../examples/m9s-example/src/infrastructure/redis-rotation.store.ts) — `RedisRotationStore`: Redis `IRotationStore` using server-side Lua (`EVAL`) for atomic consume/revoke + TTL auto-eviction + `SCAN` not `KEYS`.
- [`examples/m9s-example/src/infrastructure/document.meta.ts:45`](../../../../examples/m9s-example/src/infrastructure/document.meta.ts) — `DocumentMeta`: `defineStorageMetadata` envelope binding the normalised documents row/write shapes + indexed tuple (type-level doc for the raw-SQL repo).
- [`packages/storage-core/README.md:32`](../../../../packages/storage-core/README.md) — `IStorageProvider<Meta>` abstraction surface: `StorageMetadata`, `StorageCapabilities`, runner-pattern transactions/batches, capability-gated listeners, writing-a-new-adapter rules.
- [`packages/pg-client/README.md:30`](../../../../packages/pg-client/README.md) — `PgClient` 3-method interface (zero ORM dependency) + `/storage` subpath `PgStorageProvider` for jsonb-blob tables + `mockPgClient` fixture.

## @gertsai packages used

- **`@gertsai/storage-core`** — `IStorageProvider<Meta>`, `StorageMetadata`, `StorageCapabilities`, `defineStorageMetadata`, `ListenersNotSupportedError`, `TransactionConflictError`.
- **`@gertsai/entity-storage`** — `BaseEntityStorageService`, `InMemoryStorageProvider`.
- **`@gertsai/pg-client`** — `PgClient` interface, `mockPgClient`; `/storage` subpath `PgStorageProvider` + `TableMap`.
- **`@gertsai/query-dsl`** — `defineQueryConstraints`, `whereField`; `/sql` subpath `compileToSql`.
- **`@gertsai/entity-audit`** — `MutationMarks`, `EntityBasicStatus`, `UpdateAction`, `timestampToMillis`.
- **`@gertsai/session`** — `Session` (supplies audit identity to `BaseEntityStorageService`).
- **`@gertsai/tenant`** — `TenantId` brand, `asTenantId` (compile-time tenant enforcement).
- **`@gertsai/rest-request-manager`** — `RestRequestManager`, `RestResponse` (outbound HTTP resilience for embedders).
- **`@gertsai/errors`** — `AppError` subclasses (`UpstreamFailureError`/`UnauthorizedError`/`RateLimitedError`), `ErrorKind`, `isAppError`; `/http` + `/grpc` translation.
- **`@gertsai/auth-openfga`** — `writeTuples` (lazy-imported per-document tuple write in `PgDocumentRepository`).
- **`@gertsai/llm-costs`** — `calculateCost` (cost-event emission in `OpenAIEmbedder`).
- **`@gertsai/collection`** — referenced as a future swap point in `MemoryVectorStore` (`OrderedMap`/`BiMap`, not currently wired).
