// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 16.B sanity test (EVID-067 §Doctor Strange #3 closure).
 *
 * The `@gertsai/api-core` package declares `"sideEffects": false` and
 * deliberately keeps `runtime/node` out of the root barrel re-export so
 * that consumers importing `@gertsai/api-core` or
 * `@gertsai/api-core/moleculer` don't pick up `dotenv`-eager env-var
 * reads at module load time. Wave 15 audit (EVID-067 §DS#3) found that
 * the intent was leaking — both `apiGateService.template.ts` and the
 * legacy `oauth.class.ts` imported `from '../config'`, which itself
 * called `loadConfig({...})` at module top-level. That meant the moment
 * anything in the `/moleculer` subpath was imported, ~30 env vars were
 * read into the resolved config object.
 *
 * Wave 16.B converted `src/config.ts` to a lazy `Proxy` that memoises
 * `loadConfig` on first property access. This test asserts the new
 * behaviour: simply requiring the config module must NOT read
 * `process.env`. Any future regression that re-eagerifies the loader
 * will trip this guard.
 *
 * Wave 16.A note: the legacy OAuth module was deleted in the same wave,
 * so the `oauth.class.ts → '../../config'` arm of the original leak no
 * longer exists. This test focuses on the surviving call sites
 * (apiGateService.template.ts, moleculerConfig.template.ts,
 * ApiController.class.ts).
 */
import { describe, expect, it, vi } from 'vitest';

describe('Wave 16.B — config module is lazy (no env reads at import)', () => {
  it('importing the config module does not access tracked env keys', async () => {
    // Tracked = the keys the legacy eager loader read. If module-load
    // ever reads any of these, the lazy guarantee broke.
    const trackedKeys = new Set([
      'MOLECULER_NODE_NAME',
      'MOLECULER_NODE_ID',
      'MOLECULER_NAMESPACE',
      'ALLOWED_ORIGINS',
      'BYPASS_AUTH',
      'TRANSPORT_TYPE',
      'TRANSPORT_NATS_URL',
      'TRANSPORT_NATS_USERNAME',
      'TRANSPORT_NATS_PASSWORD',
      'TRANSPORT_REDIS_HOST',
      'TRANSPORT_REDIS_PORT',
      'TRANSPORT_REDIS_CLUSTER_NAME',
      'CACHER_TYPE',
      'CACHER_REDIS_HOST',
      'CACHER_REDIS_PORT',
      'CACHER_REDIS_CLUSTER_NAME',
      'HEALTHCHECK_ENABLED',
      'HEALTHCHECK_READY_PATH',
      'HEALTHCHECK_LIVE_PATH',
      'HEALTHCHECK_PORT',
      'REDIS_CLUSTER',
      'LOG_DEPTH',
      'LOGGER_GOOGLE',
      'LOGGER_GOOGLE__SEVERITY',
      'LOGGER_CONSOLE',
      'LOGGER_CONSOLE__SEVERITY',
      'RESPONSE_VALIDATION',
    ]);

    const accessed: string[] = [];
    const realEnv = process.env;

    // Proxy `process.env` so every read of a tracked key is recorded.
    const proxiedEnv = new Proxy(realEnv, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && trackedKeys.has(prop)) {
          accessed.push(prop);
        }
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (typeof prop === 'string' && trackedKeys.has(prop)) {
          accessed.push(prop);
        }
        return Reflect.has(target, prop);
      },
    });

    process.env = proxiedEnv;

    try {
      // Drop Vitest's module cache so this import re-evaluates the
      // module top-level. The Proxy records anything `loadConfig`
      // touches during evaluation. (Outside Vitest `vi.resetModules`
      // is a no-op — the test is meant to run under `vitest run`.)
      vi.resetModules();
      const mod = await import('../config');
      // Touch the default export to make sure the import resolved.
      void mod.default;

      expect(accessed).toEqual([]);
    } finally {
      process.env = realEnv;
    }
  });

  it('first property access on `config` reads env lazily', async () => {
    process.env['ALLOWED_ORIGINS'] = 'https://lazy.example';

    // Force re-evaluation so the per-module memoised value is fresh.
    vi.resetModules();
    const mod = await import('../config');
    mod.__resetConfigForTests();

    expect(mod.default.ALLOWED_ORIGINS).toBe('https://lazy.example');

    delete process.env['ALLOWED_ORIGINS'];
    mod.__resetConfigForTests();
  });
});
