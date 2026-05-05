// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  OtelPeerDepMissingError,
  loadPeerDep,
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
