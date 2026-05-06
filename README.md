# @gertsai/shared

Shared OSS infrastructure packages for the **gerts.ai** ecosystem.

Apache 2.0 licensed, published to npm under the `@gertsai/*` scope.

## Packages

27 OSS packages organized into 5 tiers (foundation → application).

| Package | Description | Tier |
|---------|-------------|------|
| [`@gertsai/fsm`](./packages/fsm) | Generic, zero-dep finite state machine | 1 |
| [`@gertsai/fetch`](./packages/fetch) | undici + Fetch API HTTP wrapper | 1 |
| [`@gertsai/collection`](./packages/collection) | Immutable + persistent data structures | 1 |
| [`@gertsai/llm-costs`](./packages/llm-costs) | LLM cost registry | 1 |
| [`@gertsai/utils`](./packages/utils) | Generic utilities | 1 |
| [`@gertsai/m9s-cache`](./packages/m9s-cache) | Memory / cache primitives | 1 |
| [`@gertsai/ws-rpc`](./packages/ws-rpc) | WebSocket RPC | 1 |
| [`@gertsai/config`](./packages/config) | Config helpers (re-exports api-core/runtime/node) | 1 |
| [`@gertsai/tenant`](./packages/tenant) | TenantId brand + strict/optional getters + `/moleculer` | 1 |
| [`@gertsai/otel`](./packages/otel) | OTel SDK setup + `/moleculer` tracing | 1 |
| [`@gertsai/pg-client`](./packages/pg-client) | Agnostic 3-method PgClient + `/storage` adapter | 1 |
| [`@gertsai/session`](./packages/session) | Session + AbstractDialog + 24-value OperatorType | 1 |
| [`@gertsai/entity-audit`](./packages/entity-audit) | MutationMarks + audit-builder helpers | 1 |
| [`@gertsai/errors`](./packages/errors) | Domain error hierarchy (Wave 5 Phase 1) | 1 |
| [`@gertsai/tenant-resolver`](./packages/tenant-resolver) | Tenant resolution chain (Wave 5 Phase 1) | 1 |
| [`@gertsai/di`](./packages/di) | Dependency injection | 2 |
| [`@gertsai/flux`](./packages/flux) | Flux architecture utilities | 2 |
| [`@gertsai/queue`](./packages/queue) | BullMQ wrappers + `/standalone` runner | 2 |
| [`@gertsai/entity`](./packages/entity) | Model + Entity base classes + reactive adapter | 2 |
| [`@gertsai/storage-core`](./packages/storage-core) | Backend-agnostic `IStorageProvider<Meta>` | 2 |
| [`@gertsai/query-dsl`](./packages/query-dsl) | Type-safe query constraints + `/sql` compiler | 2 |
| [`@gertsai/core`](./packages/core) | Core errors, session types, RAG, LLM costs | 3 |
| [`@gertsai/hsm`](./packages/hsm) | Hierarchical state machine | 3 |
| [`@gertsai/entity-storage`](./packages/entity-storage) | Session-aware audit-stamped CRUD + InMemory fixture | 3 |
| [`@gertsai/auth-openfga`](./packages/auth-openfga) | OpenFGA / Zanzibar ReBAC integration | 4 |
| [`@gertsai/api-core`](./packages/api-core) | API primitives, Moleculer mixins, OpenAPI merge | 4 |
| [`@gertsai/api-rlr`](./packages/api-rlr) | Rate limiter / retry loop runtime over api-core | 5 |

## Install

```sh
npm i @gertsai/<package>
# or
pnpm add @gertsai/<package>
```

## Develop

```sh
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## License

[Apache-2.0](./LICENSE) © gerts.ai
