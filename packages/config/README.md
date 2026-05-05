<div align="center">

# @gertsai/config

### A thin shim over `@gertsai/api-core/runtime/node` configuration helpers

A named extraction point for env-vars-overlay config loading and the GCP bunyan logger stream
factory. Tier 1 in the dependency graph: depends only on `@gertsai/api-core` and re-exports a
narrow slice of its `runtime/node` surface — no behaviour of its own.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Fconfig-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/config)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Tier](https://img.shields.io/badge/tier-1%20shim-brightgreen?style=flat-square)](#status)
[![ESM + CJS](https://img.shields.io/badge/build-ESM%20%2B%20CJS-orange?style=flat-square)](#status)

</div>

---

## Why @gertsai/config

- **Named extraction point.** PRD-001 FR-016 and ADR-004 call out a stable, package-level surface
  for configuration loading so that consumers can depend on `@gertsai/config` directly without
  coupling to the wider `@gertsai/api-core` surface. This shim is that surface.
- **Stable but thin.** The package adds no behaviour of its own — every export is a re-export of
  the canonical implementation in `@gertsai/api-core/runtime/node`. Identity is preserved
  (`config.loadConfig === apiCore.loadConfig`).
- **Long-term direction.** New code is welcome to import directly from
  `@gertsai/api-core/runtime/node` — that subpath is the canonical location and is itself stable.
  Use `@gertsai/config` when you want the narrower, named dependency and to avoid pulling
  `api-core` into your `package.json` as a direct dep label.

## Install

```sh
pnpm add @gertsai/config
# or
npm i @gertsai/config
```

Peer runtime: Node.js 22+ (matches the rest of the `@gertsai/*` monorepo).

## Quickstart

**Overlay environment variables onto a typed config object:**

```ts
import { loadConfig } from '@gertsai/config';

const config = loadConfig({
  PORT: 3000,
  HOST: 'localhost',
  ENABLE_TRACE: false,
});

// process.env.PORT='8080' → config.PORT === 8080  (number coerced)
// process.env.ENABLE_TRACE='1' → config.ENABLE_TRACE === true (boolean coerced)
// missing env var → default value preserved
```

`loadConfig` mutates the object in place and returns it. Type coercion follows the type of the
default value: `number` defaults coerce via `+`, `boolean` defaults coerce via `!!`, otherwise the
raw string is used.

**Wire a GCP-backed bunyan stream into Moleculer / consola:**

```ts
import { createGcpLoggerStream } from '@gertsai/config';

const stream = createGcpLoggerStream({ logName: 'my-service' });
// pass stream into your bunyan / Moleculer logger configuration
```

## API

Single entry: `import { ... } from '@gertsai/config';`.

| Export | Source | Purpose |
|---|---|---|
| `loadConfig` | `@gertsai/api-core/runtime/node` | Mutate a typed config object with `process.env` overrides |
| `createGcpLoggerStream` | `@gertsai/api-core/runtime/node` | Build a bunyan stream backed by `@google-cloud/logging-bunyan` |

For the full and authoritative documentation of these helpers, see the canonical subpath
[`@gertsai/api-core/runtime/node`](../api-core/src/runtime/node/index.ts).

## Status

| | |
|---|---|
| **Version** | `0.0.0` (initial release pending) |
| **Tier** | 1 — shim over `@gertsai/api-core/runtime/node` |
| **Build** | Dual ESM (`dist/index.js`) + CJS (`dist/index.cjs`), types per format |
| **Runtime** | Node.js 22+ |
| **Internal deps** | `@gertsai/api-core` |
| **Stability** | Pre-1.0 — surface mirrors `@gertsai/api-core/runtime/node`; breaking changes there are breaking changes here |

## License

[Apache-2.0](./LICENSE)
