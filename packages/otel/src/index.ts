// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/otel — OpenTelemetry setup for @gertsai/* services.
 *
 * Lazy-loads `@opentelemetry/*` SDKs at `setupObservability()` call time so
 * consumers without OTel needs do not pay for package weight. All OTel
 * dependencies are declared as optional peer-deps.
 *
 * Per PRD-001 FR-018 + ADR-004 (renamed from @gertsai/observe).
 */

/**
 * Options accepted by {@link setupObservability}.
 */
export interface SetupObservabilityOpts {
  /** `service.name` resource attribute reported on every span. */
  readonly serviceName: string;
  /** OTLP/HTTP traces endpoint (e.g. `http://collector:4318/v1/traces`). */
  readonly otlpEndpoint?: string;
  /** Sampling ratio in `[0, 1]`. Defaults to `1` (always sample). */
  readonly sampling?: number;
  /** Extra resource attributes merged on top of `service.name`. */
  readonly resource?: Readonly<Record<string, string>>;
}

/**
 * Handle returned from {@link setupObservability} — opaque SDK reference plus
 * a `shutdown()` for graceful flush during process shutdown.
 */
export interface ObservabilityHandle {
  /** Underlying NodeSDK instance — typed as `unknown` because it is lazy-loaded. */
  readonly sdk: unknown;
  /** Flushes spans and shuts down all exporters. Should be awaited on SIGTERM. */
  readonly shutdown: () => Promise<void>;
}

/**
 * Thrown by {@link setupObservability} when an `@opentelemetry/*` peer
 * dependency is not installed. The error message includes the missing package
 * name and an install hint.
 */
export class OtelPeerDepMissingError extends Error {
  constructor(missing: string) {
    super(`@gertsai/otel: missing optional peer dep '${missing}'. Install: pnpm add ${missing}`);
    this.name = 'OtelPeerDepMissingError';
  }
}

/**
 * Lazily resolve a peer-dep module via `require()`. On `MODULE_NOT_FOUND` it
 * raises an {@link OtelPeerDepMissingError} with the package name so callers
 * get an actionable install hint. Other require-time errors propagate as-is.
 *
 * Exported for unit-testing the missing-peer-dep contract; not part of the
 * public surface. Use {@link setupObservability} instead.
 *
 * @internal
 */
export function loadPeerDep<T = unknown>(name: string): T {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name) as T;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      throw new OtelPeerDepMissingError(name);
    }
    throw e;
  }
}

/**
 * Bootstraps the OpenTelemetry NodeSDK with an OTLP/HTTP trace exporter and
 * the supplied resource attributes, then starts it.
 *
 * All `@opentelemetry/*` packages are resolved with `require()` at call time;
 * if any is not installed, this function throws {@link OtelPeerDepMissingError}
 * with the missing package name. Importing this module does not load any OTel
 * SDK code.
 *
 * The function tolerates both the modern (`resourceFromAttributes` factory)
 * and legacy (`Resource.create` / `new Resource()`) shapes of
 * `@opentelemetry/resources` so it works across `^1.20.0` of that package.
 *
 * @param opts - Service identification and exporter wiring.
 * @returns Handle containing the SDK and a `shutdown()` hook.
 * @throws {OtelPeerDepMissingError} If any of the four `@opentelemetry/*`
 *   peer dependencies is not installed.
 *
 * @example
 * ```ts
 * const handle = setupObservability({
 *   serviceName: 'orders-api',
 *   otlpEndpoint: 'http://collector:4318/v1/traces',
 * });
 * process.on('SIGTERM', () => handle.shutdown());
 * ```
 */
export function setupObservability(opts: SetupObservabilityOpts): ObservabilityHandle {
  const sdkNode = loadPeerDep<{ NodeSDK: new (o: Record<string, unknown>) => SdkInstance }>(
    '@opentelemetry/sdk-node',
  );
  const exporterMod = loadPeerDep<{
    OTLPTraceExporter: new (o: { url?: string }) => unknown;
  }>('@opentelemetry/exporter-trace-otlp-http');
  const resourcesMod = loadPeerDep<ResourcesModule>('@opentelemetry/resources');
  const semConvMod = loadPeerDep<SemanticConventionsModule>(
    '@opentelemetry/semantic-conventions',
  );

  const serviceNameKey =
    semConvMod.ATTR_SERVICE_NAME ??
    semConvMod.SEMRESATTRS_SERVICE_NAME ??
    semConvMod.SemanticResourceAttributes?.SERVICE_NAME ??
    'service.name';

  const resourceAttrs: Record<string, string> = {
    [serviceNameKey]: opts.serviceName,
    ...(opts.resource ?? {}),
  };

  const resource = buildResource(resourcesMod, resourceAttrs);

  const exporter = new exporterMod.OTLPTraceExporter({ url: opts.otlpEndpoint });

  const sdk = new sdkNode.NodeSDK({
    resource,
    traceExporter: exporter,
  });

  sdk.start();

  return {
    sdk,
    shutdown: () => sdk.shutdown(),
  };
}

// ---------------------------------------------------------------------------
// Internal types — describe the loosely-typed shapes of OTel modules across
// versions. Kept private; consumers do not see these.
// ---------------------------------------------------------------------------

interface SdkInstance {
  start(): void;
  shutdown(): Promise<void>;
}

interface ResourcesModule {
  /** Modern factory (`@opentelemetry/resources >= 1.27` ish). */
  readonly resourceFromAttributes?: (attrs: Record<string, string>) => unknown;
  /** Legacy constructor / static factory. */
  readonly Resource?: ResourceCtor;
}

interface ResourceCtor {
  new (attrs: Record<string, string>): unknown;
  create?: (attrs: Record<string, string>) => unknown;
}

interface SemanticConventionsModule {
  readonly ATTR_SERVICE_NAME?: string;
  readonly SEMRESATTRS_SERVICE_NAME?: string;
  readonly SemanticResourceAttributes?: { readonly SERVICE_NAME?: string };
}

/**
 * Build an OTel `Resource` instance using whichever construction shape the
 * installed `@opentelemetry/resources` exposes. Prefers the modern
 * `resourceFromAttributes` factory, falls back to `Resource.create`, and
 * finally to `new Resource(attrs)`.
 */
function buildResource(mod: ResourcesModule, attrs: Record<string, string>): unknown {
  if (typeof mod.resourceFromAttributes === 'function') {
    return mod.resourceFromAttributes(attrs);
  }
  if (mod.Resource) {
    if (typeof mod.Resource.create === 'function') {
      return mod.Resource.create(attrs);
    }
    return new mod.Resource(attrs);
  }
  // The peer-dep was loadable but neither shape was found — surface a clear
  // error rather than letting the SDK explode with a generic TypeError.
  throw new OtelPeerDepMissingError('@opentelemetry/resources');
}
