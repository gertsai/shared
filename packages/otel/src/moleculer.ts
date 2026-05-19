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
import type { BrokerOptions, TracerOptions } from 'moleculer';

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
/**
 * W3C Trace Context fragment for queue/Pub/Sub job propagation.
 *
 * Mirrors the `QueueTraceContext` shape that `@gertsai/api-queue` and the
 * Wave 15.C `@gertsai/api-core` extraction consume — separated here so any
 * tracing producer can assemble a traceparent without depending on api-core
 * internals.
 */
export interface BuiltTraceparent {
  /** Trace ID (32 hex chars). Echoes the Moleculer `ctx.requestID`. */
  readonly traceId?: string;
  /** Parent span ID (16 hex chars). Echoes the Moleculer `ctx.parentID`. */
  readonly parentId?: string;
  /** Whether the trace is sampled. Mirrors `ctx.tracing === true`. */
  readonly sampled?: boolean;
  /** W3C traceparent header — `00-{traceId32hex}-{spanId16hex}-{flags}`. */
  readonly traceparent: string;
}

/**
 * Inputs accepted by {@link buildTraceparent}. Mirrors the subset of
 * `moleculer.Context` that the assembler needs — kept structural so the
 * helper can be called from non-Moleculer hosts as well.
 */
export interface BuildTraceparentInput {
  /** Moleculer `ctx.requestID` (used as the trace ID source). */
  readonly requestID?: unknown;
  /** Moleculer `ctx.id` (used as the span ID source). */
  readonly id?: unknown;
  /** Moleculer `ctx.parentID` (carried through unchanged). */
  readonly parentID?: unknown;
  /** Moleculer `ctx.tracing` — only `true` signals "sampled". */
  readonly tracing?: unknown;
}

/**
 * Build a W3C-compatible traceparent record from a Moleculer-flavoured
 * action context.
 *
 * Replaces the inline IIFE that lived in `ApiController._createActionSchema`
 * pre-Wave-15.C. Pure / total: returns `undefined` when `input.tracing` is
 * falsy, otherwise normalises `requestID`/`id` into 32-/16-hex IDs (stripping
 * dashes, right-padding short values, replacing all-zeros with the W3C-spec
 * "non-zero" fallback), and emits the canonical `00-<traceId>-<spanId>-01`
 * header.
 *
 * The W3C spec requires both `traceId` and `spanId` to be non-zero;
 * `buildTraceparent` enforces that constraint.
 *
 * @param input - Subset of a Moleculer `Context` (or any object with the
 *   same fields). When `input.tracing` is falsy/undefined the function
 *   returns `undefined` so callers can spread it conditionally.
 * @returns Either a {@link BuiltTraceparent} or `undefined`.
 *
 * @example
 * ```ts
 * import { buildTraceparent } from '@gertsai/otel/moleculer';
 *
 * const traceContext = buildTraceparent(ctx);
 * if (traceContext) {
 *   await queue.add('job', { _traceContext: traceContext, ...payload });
 * }
 * ```
 */
export function buildTraceparent(input: BuildTraceparentInput): BuiltTraceparent | undefined {
  if (!input.tracing) return undefined;

  const requestIDRaw = typeof input.requestID === 'string' ? input.requestID : '';
  const idRaw = typeof input.id === 'string' ? input.id : '';

  const rawTraceId = requestIDRaw.replace(/-/g, '');
  const rawSpanId = idRaw.replace(/-/g, '');
  const traceId = rawTraceId.padEnd(32, '0').slice(0, 32);
  const spanId = rawSpanId.padEnd(16, '0').slice(0, 16);

  // W3C spec: traceId and spanId must be non-zero.
  const safeTraceId = traceId === '0'.repeat(32) ? '0'.repeat(31) + '1' : traceId;
  const safeSpanId = spanId === '0'.repeat(16) ? '0'.repeat(15) + '1' : spanId;

  const reqId = input.requestID;
  const parId = input.parentID;

  return {
    ...(typeof reqId === 'string' && { traceId: reqId }),
    ...(typeof parId === 'string' && { parentId: parId }),
    ...(input.tracing === true && { sampled: true as const }),
    traceparent: `00-${safeTraceId}-${safeSpanId}-01`,
  };
}

export function withMoleculerTracing(
  brokerOptions: BrokerOptions,
  opts: MoleculerTracingOpts = {},
): BrokerOptions {
  const existingTracing = (brokerOptions as { tracing?: unknown }).tracing as
    | object
    | undefined;

  // Build via mutation to avoid object-literal exact-shape conflict with
  // Moleculer's non-EOPT BrokerOptions (its `field?: T` would otherwise reject
  // the spread carrying `field?: T | undefined`).
  const tracing: TracerOptions = {
    enabled: true,
    sampling: { rate: opts.sampling ?? 1 },
    exporter: {
      type: 'Zipkin',
      options: {
        endpoint: opts.otlpEndpoint ?? 'http://localhost:9411/api/v2/spans',
      },
    },
    ...existingTracing,
  };
  const result: BrokerOptions = { ...brokerOptions };
  result.tracing = tracing;
  return result;
}
