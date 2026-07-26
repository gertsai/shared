---
"@gertsai/otel": minor
---

feat(otel): add opt-in metrics (Meter/Counter/Histogram) alongside traces

`@gertsai/otel` was traces-only. `setupObservability` now accepts an optional
`metricsEndpoint` (plus `metricsIntervalMs`, default `60_000`) that stands up an
OTLP/HTTP metrics pipeline and exposes `handle.meter` — a structural `MeterLike`
with `createCounter` / `createHistogram`.

- **Opt-in & honest:** without `metricsEndpoint`, `handle.meter` is `undefined`
  (no no-op meter that would silently drop every write) and no metrics SDK is
  resolved — traces behave byte-for-byte as before.
- **Separate endpoint:** `metricsEndpoint` is distinct from `otlpEndpoint` — in real
  deployments trace and metric collectors can live at different addresses.
- **No `@opentelemetry/api` dependency:** the meter is read straight off a standalone
  `MeterProvider`; `MeterLike` / `CounterLike` / `HistogramLike` are structural and
  assignable from the OTel API's `Meter` without a cast.
- **Lazy peer-deps:** `@opentelemetry/sdk-metrics` and
  `@opentelemetry/exporter-metrics-otlp-http` are new **optional** peer-deps loaded
  via the existing `loadPeerDep()`; a missing one throws `OtelPeerDepMissingError`,
  the same contract as traces.
- `handle.shutdown()` flushes traces **and** metrics and is idempotent on repeat calls.
- The `./moleculer` subpath is untouched.

Additive — existing `setupObservability({ serviceName, otlpEndpoint })` calls are unchanged.
