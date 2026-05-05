<div align="center">

# @gertsai/otel

### OpenTelemetry setup for `@gertsai/*` services — lazy peer-deps, minimal coupling

A small, opinionated entry point that wires an OpenTelemetry NodeSDK with an OTLP/HTTP trace
exporter, plus a `/moleculer` subpath that injects a sane Moleculer broker tracing config. All
OTel SDKs are declared as **optional peer dependencies** and resolved at call time, so consumers
that do not enable observability never pay for the OTel runtime weight.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Fotel-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/otel)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Tier](https://img.shields.io/badge/tier-1-brightgreen?style=flat-square)](#status)
[![ESM + CJS](https://img.shields.io/badge/build-ESM%20%2B%20CJS-orange?style=flat-square)](#status)

</div>

---

## Why @gertsai/otel

- **Named extraction point.** PRD-001 FR-018 and ADR-004 carve out a stable, package-level surface
  for OpenTelemetry wiring (renamed from the earlier `@gertsai/observe` working name).
- **Lazy peer-deps.** `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`,
  `@opentelemetry/resources`, `@opentelemetry/semantic-conventions` and `moleculer` are
  declared `peerDependenciesMeta.optional = true` and `require()`d only when the corresponding
  helper is invoked. Missing peer deps surface a clear `OtelPeerDepMissingError` with the
  package name to install — they do not break import-time.
- **Two narrow surfaces.** The root export configures the SDK; `@gertsai/otel/moleculer` produces
  a Moleculer `BrokerOptions.tracing` block. Pick whichever you need; do not pay for the other.
- **Tier 1.** No internal `@gertsai/*` dependencies. Anything in the workspace can import it
  without creating a cycle.

## Install

```sh
pnpm add @gertsai/otel
# Plus the OTel peer-deps you actually want at runtime:
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http \
         @opentelemetry/resources @opentelemetry/semantic-conventions
```

Peer runtime: Node.js 22+ (matches the rest of the `@gertsai/*` monorepo).

## Quickstart

**Bootstrap the NodeSDK at process start:**

```ts
import { setupObservability } from '@gertsai/otel';

const handle = setupObservability({
  serviceName: 'orders-api',
  otlpEndpoint: 'http://otel-collector:4318/v1/traces',
  sampling: 1,
  resource: { 'deployment.environment': 'prod' },
});

process.on('SIGTERM', () => handle.shutdown());
```

**Wrap a Moleculer broker config with tracing:**

```ts
import { withMoleculerTracing } from '@gertsai/otel/moleculer';
import type { BrokerOptions } from 'moleculer';

const broker: BrokerOptions = withMoleculerTracing(
  { nodeID: 'orders-1', logLevel: 'info' },
  { otlpEndpoint: 'http://otel-collector:9411/api/v2/spans', sampling: 0.1 },
);
```

## API

| Export | Source | Purpose |
|---|---|---|
| `setupObservability(opts)` | `.` | Lazy-loads `@opentelemetry/sdk-node` + OTLP/HTTP exporter, starts the SDK, returns a handle with `shutdown()` |
| `OtelPeerDepMissingError` | `.` | Thrown by `setupObservability` when an OTel peer dep is not installed |
| `SetupObservabilityOpts` | `.` | Type for `setupObservability` input |
| `ObservabilityHandle` | `.` | Type for `setupObservability` return |
| `withMoleculerTracing(brokerOptions, opts?)` | `./moleculer` | Adds a `tracing` block to a Moleculer `BrokerOptions` (Zipkin exporter shape) |
| `MoleculerTracingOpts` | `./moleculer` | Type for `withMoleculerTracing` second arg |

## Status

| | |
|---|---|
| **Version** | `0.0.0` (initial release pending) |
| **Tier** | 1 — no internal `@gertsai/*` dependencies |
| **Build** | Dual ESM (`dist/index.js`, `dist/moleculer.js`) + CJS (`dist/index.cjs`, `dist/moleculer.cjs`), types per format |
| **Runtime** | Node.js 22+ |
| **Peer deps** | All optional (`@opentelemetry/*`, `moleculer`) — resolved at call time |
| **Stability** | Pre-1.0 — surface may shift; breaking changes called out in changelog |

## License

[Apache-2.0](./LICENSE)
