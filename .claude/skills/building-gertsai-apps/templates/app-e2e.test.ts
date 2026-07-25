// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// e2e / real-infra test skeleton for a @gertsai/* Moleculer app.
// Derived from examples/m9s-example/tests/{e2e,real-infra/*}.test.ts.
//
// PRE-REQUISITE: `pnpm --filter <your-app> run build` MUST run first.
//   Your actions use `typia.createValidate<T>()`; vitest's esbuild lacks the
//   typia transform, so source imports throw NoTransformConfigurationError.
//   Always import RUNTIME side-effects from the pre-built `dist/`.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Middleware } from 'moleculer';

// CRITICAL: route ALL @gertsai/api-core + dist imports through createRequire so
// they share CJS module identity with the dist side-effect (which registers
// controllers in ApiController._controllers). An ESM `await import` of the same
// package yields a SEPARATE class whose registry is empty -> ServiceNotFoundError.
const requireFromHere = createRequire(import.meta.url);

// --- Real-infra gate (DELETE this block for a pure mock-mode broker test) ----
// TODO: point at your dependency's health endpoint.
const INFRA_URL = process.env['MY_INFRA_URL'] ?? 'http://localhost:PORT';
const FORCE = process.env['MY_INFRA_E2E'] === '1';
async function infraAlive(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1000);
    const resp = await fetch(`${INFRA_URL}/healthz`, { signal: ctrl.signal });
    clearTimeout(t);
    return resp.ok;
  } catch {
    return false;
  }
}
const ready = FORCE || (await infraAlive());
const maybe = ready ? describe : describe.skip;
// -----------------------------------------------------------------------------

// JWT_SECRET hard-fails at boot if unset (Wave 12). Set a test-only value
// BEFORE any require triggers ApiController.Start. Never used for signing here.
process.env.JWT_SECRET ??= 'test-only-secret-not-used-for-signing';

// Inject a real Session fixture via meta.testSession instead of minting a JWT.
// The seam is gated on GERTSAI_TEST_SESSION_ALLOW=1 (set in vitest.config.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAuthSession(opts: { tenantId: string; operatorUuid?: string }): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Session } = requireFromHere('@gertsai/session');
  return new Session({
    operatorUuid: opts.operatorUuid ?? 'user-test-default',
    operatorType: 'web',
    tokenGetter: async () => 'tok',
    dialog: { confirm: async () => true, alert: () => {}, error: () => {} },
    clientPlatform: 'web',
    clientVersion: '0.0.0-test',
    tenantId: opts.tenantId,
  });
}

maybe('<your-app> e2e (broker.call)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let broker: any;

  beforeAll(async () => {
    // TODO: set env BEFORE the dist requires — project.config.ts reads env once
    //       at module load, and dotenv won't overwrite an already-set var.
    process.env['STORAGE_PROVIDER'] = 'memory'; // or 'postgres'
    process.env['EMBEDDER_PROVIDER'] = 'mock';  // or 'ollama' for real-infra

    // Side-effect: registers controllers in ApiController._controllers.
    requireFromHere('../dist/src/services/index.js');

    const { ApiController } = requireFromHere(
      '@gertsai/api-core/moleculer',
    ) as typeof import('@gertsai/api-core/moleculer');
    const brokerConfigDefault = requireFromHere('../dist/moleculer.config.js')
      .default as import('moleculer').BrokerOptions;
    const ApiService = requireFromHere('../dist/src/mol-services/api.service.js')
      .default;

    const brokerConfig = {
      ...brokerConfigDefault,
      // Keep production Wave 5 middleware chain (tenant resolver + session).
      middlewares: brokerConfigDefault.middlewares as Middleware[],
      // Silence broker logs in test output.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: { type: 'Console', options: { level: 'error' } } as any,
    };

    broker = await ApiController.Start({
      brokerConfig,
      services: [ApiService],
      repl: false,
    });
  }, 60_000);

  afterAll(async () => {
    if (broker !== undefined) await broker.stop();
  });

  it('runs an authenticated action end-to-end', async () => {
    const resp = await broker.call(
      'v1.<action>', // TODO
      { /* TODO: action input */ },
      {
        meta: {
          headers: { 'x-tenant-id': 'tenant-acme' },
          testSession: makeAuthSession({ tenantId: 'tenant-acme' }),
        },
      },
    );
    expect(resp).toBeDefined();
    // TODO: assert resp.data shape
  }, 15_000);

  it('rejects an anonymous call with 401', async () => {
    const result = await broker
      .call('v1.<action>', { /* TODO */ })
      .then(() => ({ ok: true as const }), (err: unknown) => ({ ok: false as const, err }));
    expect(result.ok).toBe(false);
  }, 15_000);
});

if (!ready) {
  // eslint-disable-next-line no-console
  console.log('[my-infra.test] infra unavailable at', INFRA_URL,
    '— skipping. Set MY_INFRA_E2E=1 to force, or run `pnpm infra:up`.');
}
