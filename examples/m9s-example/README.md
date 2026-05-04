# `@gertsai-examples/m9s-example`

> Hexagonal Moleculer.js example showing how to consume the published
> `@gertsai/*` packages end-to-end with a tiny "ingest + search" workload.

## Why this example

The shared monorepo ships 13 OSS packages (`api-core`, `auth-openfga`,
`m9s-cache`, `core`, `fetch`, `utils`, `collection`, ...). Real consumers
need a single, runnable, dependency-free reference that demonstrates:

1. How to wire `ApiController` actions through hexagonal seams.
2. How to plug `M9sCacheCacher` into a Moleculer broker.
3. How to keep domain code free of transport, persistence, and AuthZ.
4. Where future packages (e.g. `api-rlr`) slot in.

This example is intentionally small — under ~700 LOC — but every layer
mirrors what `apps/pipeline` does at scale.

## Architecture

```
                 HTTP                 Moleculer                Domain
   client  ──▶ /api/v1/* ──▶ ApiController ──▶ UseCase ──▶ Ports/Adapters
                                                  │            │
                                                  │            ├─ MemoryDocumentStore
                                                  │            ├─ MemoryVectorStore
                                                  │            ├─ MockEmbedder
                                                  │            └─ AllowAllPermissionGate
                                                  │               (or OpenFgaPermissionGate)
                                                  ▼
                                       caching: M9sCacheCacher (60 s TTL)
```

Layer rules (enforced by code review, not the compiler):

| Layer          | May import from                                | Forbidden                  |
|----------------|------------------------------------------------|----------------------------|
| `domain/`      | stdlib, optionally `@gertsai/core` types       | adapters, application      |
| `application/` | `domain/`                                      | adapters, transport libs   |
| `adapters/`    | `domain/ports/*`, the relevant `@gertsai/*`    | `application/` directly    |
| `composition/` | everything                                     | (root of the dep graph)    |

## Run

```bash
# from monorepo root
pnpm install
pnpm --filter @gertsai-examples/m9s-example run build
pnpm --filter @gertsai-examples/m9s-example run start
```

In another terminal:

```bash
bash examples/m9s-example/scripts/smoke.sh
```

Expected response shape (envelope from `@gertsai/api-core`):

```json
{
  "success": true,
  "code": "201/created",
  "message": "Document ingested",
  "data": { "docId": "d1", "chunkCount": 3 }
}
```

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
| `@gertsai/api-core`      | `adapters/inbound/*`, `mol-services/api.service.ts`                  |
| `@gertsai/m9s-cache`     | `composition/broker.ts` (M9sCacheCacher + MemoryCacheDriver)         |
| `@gertsai/auth-openfga`  | `adapters/outbound/openfga-permission.gate.ts` (lazy import)         |
| `@gertsai/core`          | `composition/services.ts` (`defaultSession`, `UserType`)             |
| `@gertsai/fetch`         | referenced in `mock-embedder.ts` JSDoc as the real-impl pattern      |
| `@gertsai/collection`    | mentioned in `memory-vector.store.ts` as a future swap point         |
| `@gertsai/utils`         | available as a workspace dep — usage left to the reader              |

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
- Runtime: single-node Moleculer 0.14, no Redis required.
- Auth: `AllowAllPermissionGate` by default; switch to
  `OpenFgaPermissionGate` in `composition/services.ts` for real ReBAC.
- Coverage: unit tests for both use cases (Vitest); e2e marked `skip`.

## Swapping adapters

Production wiring is a one-file change. Edit `composition/services.ts`:

```ts
// Replace AllowAllPermissionGate with the real OpenFGA-backed gate.
import { OpenFgaPermissionGate } from '../adapters/outbound/openfga-permission.gate';

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
