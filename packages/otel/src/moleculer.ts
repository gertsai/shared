// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/otel/moleculer — Moleculer broker tracing integration.
 *
 * Adds an OpenTelemetry-friendly tracer config to Moleculer's `tracing` block.
 * Pure-functional: takes a `BrokerOptions`, returns a new one with tracing
 * wired. Does not import or require any `@opentelemetry/*` package directly —
 * the actual exporter wiring happens inside Moleculer at broker.start() time
 * based on the `tracing.exporter` config below, and only if the corresponding
 * peer-deps are installed at the consumer.
 *
 * Per PRD-001 FR-018 + ADR-004 (renamed from @gertsai/observe).
 */
import type { BrokerOptions } from 'moleculer';

/**
 * Options for {@link withMoleculerTracing}.
 */
export interface MoleculerTracingOpts {
  /**
   * Endpoint for the Zipkin-compatible spans exporter. Defaults to
   * `http://localhost:9411/api/v2/spans` if omitted.
   */
  readonly otlpEndpoint?: string;
  /** Sampling ratio in `[0, 1]`. Defaults to `1` (always sample). */
  readonly sampling?: number;
}

/**
 * Returns a new {@link BrokerOptions} with a `tracing` block wired for
 * OpenTelemetry-style span export.
 *
 * If the input already has a `tracing` block, that block wins on conflicting
 * keys (overlay-on-top semantics) — the helper produces sensible defaults
 * but never overrides explicit consumer choices.
 *
 * @param brokerOptions - Existing Moleculer broker config to extend.
 * @param opts - Optional sampling ratio + exporter endpoint overrides.
 * @returns A new `BrokerOptions` with `tracing` populated.
 *
 * @example
 * ```ts
 * import { withMoleculerTracing } from '@gertsai/otel/moleculer';
 *
 * const broker = withMoleculerTracing(
 *   { nodeID: 'orders-1' },
 *   { otlpEndpoint: 'http://collector:9411/api/v2/spans', sampling: 0.1 },
 * );
 * ```
 */
export function withMoleculerTracing(
  brokerOptions: BrokerOptions,
  opts: MoleculerTracingOpts = {},
): BrokerOptions {
  const existingTracing = (brokerOptions as { tracing?: unknown }).tracing as
    | object
    | undefined;

  return {
    ...brokerOptions,
    tracing: {
      enabled: true,
      sampling: { rate: opts.sampling ?? 1 },
      exporter: {
        type: 'Zipkin',
        options: {
          endpoint: opts.otlpEndpoint ?? 'http://localhost:9411/api/v2/spans',
        },
      },
      ...existingTracing,
    } as BrokerOptions['tracing'],
  };
}
