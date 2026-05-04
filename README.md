# @gertsai/shared

Shared OSS infrastructure packages for the **gerts.ai** ecosystem.

Apache 2.0 licensed, published to npm under the `@gertsai/*` scope.

## Packages

| Package | Description | Tier |
|---------|-------------|------|
| [`@gertsai/fsm`](./packages/fsm) | Generic, zero-dep finite state machine | 1 |
| [`@gertsai/fetch`](./packages/fetch) | undici + Fetch API HTTP wrapper | 1 |
| [`@gertsai/collection`](./packages/collection) | Immutable + persistent data structures | 1 |
| [`@gertsai/llm-costs`](./packages/llm-costs) | LLM cost registry | 1 |
| [`@gertsai/utils`](./packages/utils) | Generic utilities | 1 |
| [`@gertsai/m9s-cache`](./packages/m9s-cache) | Memory / cache primitives | 1 |
| [`@gertsai/ws-rpc`](./packages/ws-rpc) | WebSocket RPC | 1 |
| [`@gertsai/di`](./packages/di) | Dependency injection | 2 |
| [`@gertsai/flux`](./packages/flux) | Flux architecture utilities | 2 |
| [`@gertsai/core`](./packages/core) | Core errors, session types, RAG, LLM costs | 3 |
| [`@gertsai/hsm`](./packages/hsm) | Hierarchical state machine | 3 |
| [`@gertsai/auth-openfga`](./packages/auth-openfga) | OpenFGA / Zanzibar ReBAC integration | 4 |
| [`@gertsai/api-core`](./packages/api-core) | API primitives, Moleculer mixins, OpenAPI merge | 4 |

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
