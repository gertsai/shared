// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 36.A (Wave 31 EVID-087 follow-up — production-realistic m9s coverage)
 *
 * OpenTelemetry observability wiring for m9s-example.
 *
 * Initializes `@gertsai/otel.setupObservability()` with OTLP/HTTP export
 * when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. When unset, this module is a
 * no-op — m9s starts without OTel instrumentation (acceptable for local
 * dev, where you don't need a collector running).
 *
 * Wiring pattern (per `@gertsai/otel` docs):
 *   1. Import + call BEFORE any other module-load that creates spans.
 *   2. Capture handle for graceful shutdown on SIGTERM / SIGINT.
 *
 * NOTE: This file deliberately performs only SDK setup. Manual span
 * emission inside business logic is out of scope for Wave 36.A and is
 * tracked as Wave 37+ work — see `examples/m9s-example/CLAUDE.md`.
 */

import { setupObservability, type ObservabilityHandle } from '@gertsai/otel';

let observabilityHandle: ObservabilityHandle | undefined;

/**
 * Initialize OTel SDK if `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.
 * Safe to call multiple times — second call is a no-op and returns the
 * existing handle.
 *
 * Returns `undefined` when the endpoint env var is absent so callers can
 * branch on observability availability without try/catch.
 */
export function initObservability(): ObservabilityHandle | undefined {
  if (observabilityHandle) return observabilityHandle;

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) {
    return undefined;
  }

  const samplingRaw = process.env['OTEL_SAMPLING_RATIO'];
  const sampling = samplingRaw !== undefined ? Number(samplingRaw) : 1;

  observabilityHandle = setupObservability({
    serviceName: 'm9s-example',
    otlpEndpoint: endpoint,
    sampling: Number.isFinite(sampling) ? sampling : 1,
    resource: {
      'service.version': process.env['npm_package_version'] ?? '0.0.0',
      'deployment.environment': process.env['NODE_ENV'] ?? 'development',
    },
  });

  return observabilityHandle;
}

/**
 * Graceful shutdown — awaits exporter flush. Safe to call when
 * `initObservability()` was a no-op (no handle was captured).
 *
 * Idempotent: a second call after a successful shutdown is a no-op.
 */
export async function shutdownObservability(): Promise<void> {
  if (!observabilityHandle) return;
  const handle = observabilityHandle;
  observabilityHandle = undefined;
  await handle.shutdown();
}
