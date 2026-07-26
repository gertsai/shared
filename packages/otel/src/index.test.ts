// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  OtelPeerDepMissingError,
  loadPeerDep,
  setupObservability,
  type ObservabilityHandle,
  type SetupObservabilityOpts,
} from './index';

describe('@gertsai/otel OtelPeerDepMissingError', () => {
  it('sets a stable error name and includes the missing package name', () => {
    const err = new OtelPeerDepMissingError('@opentelemetry/sdk-node');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OtelPeerDepMissingError');
    expect(err.message).toContain('@opentelemetry/sdk-node');
    expect(err.message).toContain('Install: pnpm add @opentelemetry/sdk-node');
  });
});

describe('@gertsai/otel setupObservability — public types', () => {
  it('exports SetupObservabilityOpts and ObservabilityHandle types (compile-time shape)', () => {
    const opts: SetupObservabilityOpts = {
      serviceName: 'demo',
      otlpEndpoint: 'http://localhost:4318/v1/traces',
      sampling: 0.1,
      resource: { 'k8s.pod': 'pod-x' },
    };
    expect(opts.serviceName).toBe('demo');

    const fake: ObservabilityHandle = {
      sdk: {},
      shutdown: () => Promise.resolve(),
    };
    expect(typeof fake.shutdown).toBe('function');
  });
});

describe('@gertsai/otel loadPeerDep — lazy require contract', () => {
  // We verify the contract on the internal helper rather than the full
  // setupObservability flow so that the test does not depend on whether the
  // OTel SDKs happen to be installed in node_modules at test time. The
  // contract under test is: if `require()` throws MODULE_NOT_FOUND, wrap it
  // as OtelPeerDepMissingError with the package name; otherwise pass the
  // module through.

  it('throws OtelPeerDepMissingError naming the missing module when require fails', () => {
    // A name that genuinely cannot be resolved from anywhere on disk.
    const name = '@gertsai/__definitely_not_installed__';
    try {
      loadPeerDep(name);
      expect.fail('loadPeerDep should have thrown for a missing module');
    } catch (e) {
      expect(e).toBeInstanceOf(OtelPeerDepMissingError);
      expect((e as Error).message).toContain(name);
      expect((e as Error).message).toContain('Install: pnpm add');
    }
  });

  it('returns the module exports when the package is installed', () => {
    // node:path is always available — verifies the success path returns the
    // module object as-is rather than throwing.
    const mod = loadPeerDep<typeof import('node:path')>('node:path');
    expect(typeof mod.join).toBe('function');
    expect(mod.join('a', 'b')).toBe('a/b');
  });

  it('does not swallow non-MODULE_NOT_FOUND require errors', () => {
    // Build a module that throws at top-level evaluation. We do this by
    // creating a CJS module on disk via Node's createRequire + a Buffer-backed
    // require hook is overkill — instead, use a name that resolves but throws
    // at load time. We piggyback on `require.cache` to inject a fake.
    const name = '@gertsai/__throws_at_load__';
    const fakeError = new Error('boom — not a missing-module error');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require('node:module') as {
      _resolveFilename: typeof require.resolve;
      _load: (req: string, parent: unknown, isMain: boolean) => unknown;
    };
    const origResolve = Module._resolveFilename;
    const origLoad = Module._load;
    Module._resolveFilename = function patched(this: unknown, request: string, ...rest: unknown[]) {
      if (request === name) return name;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origResolve as any).call(this, request, ...rest);
    } as typeof Module._resolveFilename;
    Module._load = function patched(this: unknown, request: string, parent: unknown, isMain: boolean) {
      if (request === name) throw fakeError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origLoad as any).call(this, request, parent, isMain);
    };
    try {
      loadPeerDep(name);
      expect.fail('loadPeerDep should have rethrown the non-MODULE_NOT_FOUND error');
    } catch (e) {
      expect(e).toBe(fakeError);
      expect(e).not.toBeInstanceOf(OtelPeerDepMissingError);
    } finally {
      Module._resolveFilename = origResolve;
      Module._load = origLoad;
    }
  });
});

// ---------------------------------------------------------------------------
// setupObservability — metrics (opt-in). We inject fake `@opentelemetry/*`
// modules through Module._load (same mechanism as the loadPeerDep test above)
// so the suite never depends on the real SDKs being installed.
// ---------------------------------------------------------------------------

interface Sink {
  adds: Array<{ n: string; v: number; attrs: unknown }>;
  records: Array<{ n: string; v: number; attrs: unknown }>;
  exporterOpts?: { url?: string };
  readerOpts?: { exportIntervalMillis?: number; exporter?: unknown };
  providerOpts?: { resource?: unknown; readers?: unknown[] };
  meterName?: string;
  sdkShutdowns: number;
  providerShutdowns: number;
}

function makeSink(): Sink {
  return { adds: [], records: [], sdkShutdowns: 0, providerShutdowns: 0 };
}

function traceFakes(sink: Sink): Record<string, Record<string, unknown>> {
  return {
    '@opentelemetry/sdk-node': {
      NodeSDK: class {
        readonly kind = 'node-sdk';
        constructor(_o: unknown) {}
        start(): void {}
        shutdown(): Promise<void> {
          sink.sdkShutdowns += 1;
          return Promise.resolve();
        }
      },
    },
    '@opentelemetry/exporter-trace-otlp-http': {
      OTLPTraceExporter: class {
        readonly kind = 'trace-exporter';
        constructor(_o: { url?: string }) {}
      },
    },
    '@opentelemetry/resources': { resourceFromAttributes: (a: unknown) => ({ __resource: a }) },
    '@opentelemetry/semantic-conventions': { ATTR_SERVICE_NAME: 'service.name' },
  };
}

function metricFakes(sink: Sink): Record<string, Record<string, unknown>> {
  return {
    '@opentelemetry/exporter-metrics-otlp-http': {
      OTLPMetricExporter: class {
        readonly kind = 'metric-exporter';
        constructor(o: { url?: string }) {
          sink.exporterOpts = o;
        }
      },
    },
    '@opentelemetry/sdk-metrics': {
      PeriodicExportingMetricReader: class {
        readonly kind = 'reader';
        constructor(o: { exportIntervalMillis?: number; exporter?: unknown }) {
          sink.readerOpts = o;
        }
      },
      MeterProvider: class {
        constructor(o: { resource?: unknown; readers?: unknown[] }) {
          sink.providerOpts = o;
        }
        getMeter(name: string) {
          sink.meterName = name;
          return {
            createCounter: (n: string) => ({
              add: (v: number, attrs?: unknown) => {
                sink.adds.push({ n, v, attrs });
              },
            }),
            createHistogram: (n: string) => ({
              record: (v: number, attrs?: unknown) => {
                sink.records.push({ n, v, attrs });
              },
            }),
          };
        }
        shutdown(): Promise<void> {
          sink.providerShutdowns += 1;
          return Promise.resolve();
        }
      },
    },
  };
}

function withModules(
  served: Record<string, Record<string, unknown>>,
  missing: readonly string[],
  requested: string[],
  fn: () => void,
): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('node:module') as {
    _resolveFilename: (req: string, ...rest: unknown[]) => string;
    _load: (req: string, parent: unknown, isMain: boolean) => unknown;
  };
  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;
  const notFound = (name: string): never => {
    const err = new Error(`Cannot find module '${name}'`) as NodeJS.ErrnoException;
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  };
  Module._resolveFilename = function patched(this: unknown, request: string, ...rest: unknown[]) {
    if (request in served) return request;
    if (missing.includes(request)) return notFound(request);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origResolve as any).call(this, request, ...rest);
  } as typeof Module._resolveFilename;
  Module._load = function patched(this: unknown, request: string, parent: unknown, isMain: boolean) {
    if (request in served) {
      requested.push(request);
      return served[request];
    }
    if (missing.includes(request)) {
      requested.push(request);
      return notFound(request);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origLoad as any).call(this, request, parent, isMain);
  };
  try {
    fn();
  } finally {
    Module._resolveFilename = origResolve;
    Module._load = origLoad;
  }
}

describe('@gertsai/otel setupObservability — metrics (opt-in)', () => {
  it('criterion 1: no metricsEndpoint → meter undefined, no metrics SDK resolved, traces intact', () => {
    const sink = makeSink();
    const requested: string[] = [];
    let handle: ObservabilityHandle | undefined;
    withModules(traceFakes(sink), [], requested, () => {
      handle = setupObservability({ serviceName: 'demo', otlpEndpoint: 'http://c:4318/v1/traces' });
    });
    expect(handle?.meter).toBeUndefined();
    expect(handle?.sdk).toBeDefined();
    expect(
      requested.some((r) => r.includes('sdk-metrics') || r.includes('exporter-metrics')),
    ).toBe(false);
  });

  it('criterion 2: metricsEndpoint + peer-deps → meter present, add/record reach the exporter wiring', () => {
    const sink = makeSink();
    let handle: ObservabilityHandle | undefined;
    withModules({ ...traceFakes(sink), ...metricFakes(sink) }, [], [], () => {
      handle = setupObservability({
        serviceName: 'demo',
        otlpEndpoint: 'http://c:4318/v1/traces',
        metricsEndpoint: 'http://c:4318/v1/metrics',
        metricsIntervalMs: 5000,
      });
      handle.meter?.createCounter('llm.cost', { unit: 'usd' }).add(1, { model: 'x' });
      handle.meter?.createHistogram('transcribe.latency').record(120, { lang: 'en' });
    });
    expect(handle?.meter).toBeDefined();
    expect(sink.meterName).toBe('demo');
    expect(sink.exporterOpts?.url).toBe('http://c:4318/v1/metrics');
    expect(sink.readerOpts?.exportIntervalMillis).toBe(5000);
    expect(sink.providerOpts?.readers).toHaveLength(1);
    expect(sink.adds).toContainEqual({ n: 'llm.cost', v: 1, attrs: { model: 'x' } });
    expect(sink.records).toContainEqual({ n: 'transcribe.latency', v: 120, attrs: { lang: 'en' } });
  });

  it('criterion 2b: default export interval is 60_000 when metricsIntervalMs is omitted', () => {
    const sink = makeSink();
    withModules({ ...traceFakes(sink), ...metricFakes(sink) }, [], [], () => {
      setupObservability({ serviceName: 'demo', metricsEndpoint: 'http://c:4318/v1/metrics' });
    });
    expect(sink.readerOpts?.exportIntervalMillis).toBe(60_000);
  });

  it('criterion 3: metricsEndpoint but missing metrics peer-dep → OtelPeerDepMissingError naming it', () => {
    const sink = makeSink();
    let caught: unknown;
    withModules(
      traceFakes(sink),
      ['@opentelemetry/sdk-metrics', '@opentelemetry/exporter-metrics-otlp-http'],
      [],
      () => {
        try {
          setupObservability({
            serviceName: 'demo',
            otlpEndpoint: 't',
            metricsEndpoint: 'http://c:4318/v1/metrics',
          });
        } catch (e) {
          caught = e;
        }
      },
    );
    expect(caught).toBeInstanceOf(OtelPeerDepMissingError);
    expect((caught as Error).message).toContain('@opentelemetry/sdk-metrics');
  });

  it('criterion 4: shutdown() flushes traces + metrics and is idempotent on repeat calls', async () => {
    const sink = makeSink();
    let handle: ObservabilityHandle | undefined;
    withModules({ ...traceFakes(sink), ...metricFakes(sink) }, [], [], () => {
      handle = setupObservability({
        serviceName: 'demo',
        otlpEndpoint: 't',
        metricsEndpoint: 'http://c:4318/v1/metrics',
      });
    });
    await handle?.shutdown();
    await handle?.shutdown();
    expect(sink.sdkShutdowns).toBe(1);
    expect(sink.providerShutdowns).toBe(1);
  });
});
