# Package catalog

Choose by task, then read the canonical package README and the selected version's
manifest for exports, engines and peers. This is a **source catalog**, not a
registry-availability or compatible-version guarantee. [Install guide](../guides/CONSUMING-PACKAGES.ru.md)
and [AI consumer guide](../guides/AI-CONSUMER-GUIDE.md) explain that boundary.

## Errors and HTTP clients

| Package | Start here when you need |
|---|---|
| [errors](errors/README.md) | Shared error taxonomy and transport mappings |
| [async-utils](async-utils/README.md) | Timeout, retry and async control utilities |
| [fetch](fetch/README.md) | HTTP fetch primitives |
| [rest-request-manager](rest-request-manager/README.md) | Managed HTTP requests, retry and rate limiting |

## Identity and request context

| Package | Start here when you need |
|---|---|
| [tenant](tenant/README.md) | Tenant identity primitives |
| [tenant-resolver](tenant-resolver/README.md) | Resolve tenant identity from an explicit trust boundary |
| [session](session/README.md) | Session state and scope |
| [session-guard](session-guard/README.md) | Authentication and session assertions |
| [runtime-context](runtime-context/README.md) | Per-request composition context |
| [auth-openfga](auth-openfga/README.md) | OpenFGA authorization integration |

## Entities, queries and persistence

| Package | Start here when you need |
|---|---|
| [entity](entity/README.md) | Entity/model primitives |
| [entity-queries](entity-queries/README.md) | Entity query operations |
| [storage-core](storage-core/README.md) | Provider and runner contracts |
| [entity-storage](entity-storage/README.md) | Session-aware audited storage and write rules |
| [query-dsl](query-dsl/README.md) | Typed query constraints and SQL compilation |
| [pg-client](pg-client/README.md) | PostgreSQL client contract and storage adapter |
| [entity-audit](entity-audit/README.md) | Audit mutation builders |
| [audit-primitives](audit-primitives/README.md) | Timestamp and audit data primitives |

## UI framework adapters

| Package | Start here when you need |
|---|---|
| [entity-react](entity-react/README.md) | React entity integration |
| [entity-vue](entity-vue/README.md) | Vue entity integration |
| [entity-solid](entity-solid/README.md) | Solid entity integration |
| [entity-svelte](entity-svelte/README.md) | Svelte entity integration |

## Services, queues and realtime

| Package | Start here when you need |
|---|---|
| [api-core](api-core/README.md) | Moleculer services and public runtime subpaths |
| [api-envelope](api-envelope/README.md) | API response envelopes |
| [api-pubsub](api-pubsub/README.md) | API pub/sub integration |
| [api-queue](api-queue/README.md) | API queue integration |
| [queue](queue/README.md) | Queue primitives and standalone runners |
| [ws-rpc](ws-rpc/README.md) | WebSocket RPC primitives |
| [rpc-proxy-builder](rpc-proxy-builder/README.md) | Typed RPC clients and transport adapters |
| [api-rlr](api-rlr/README.md) | API rate-limiter/retry-loop runtime |

## Configuration and observability

| Package | Start here when you need |
|---|---|
| [config](config/README.md) | Configuration entry point |
| [di](di/README.md) | Dependency injection |
| [otel](otel/README.md) | OpenTelemetry integration |
| [logger-factory](logger-factory/README.md) | Logger backends and redaction |
| [m9s-cache](m9s-cache/README.md) | Moleculer cache integration |

## Other infrastructure primitives

| Package | Start here when you need |
|---|---|
| [collection](collection/README.md) | Collection utilities |
| [core](core/README.md) | Platform contracts, LLM and workflow-related primitives |
| [flux](flux/README.md) | Reactive streams |
| [fsm](fsm/README.md) | Finite state machines |
| [hsm](hsm/README.md) | Hierarchical state machines |
| [llm-costs](llm-costs/README.md) | Model pricing and cost calculation |
| [utils](utils/README.md) | General utilities |

## Before copying an example

- Read the installed version's public exports and required peers. Optional peers
  can still be required by an adapter subpath.
- Library builds and consumer application builds are separate: a reference app's
  typia transformer setup is not automatically required for every package user.
- Do not infer registry availability from a local manifest or an npm badge.
- Report conflicts between prose and the selected version's types/source rather
  than inventing a missing helper. Use [the retrieval map](../guides/INDEX.md).
