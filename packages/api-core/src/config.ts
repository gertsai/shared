// SPDX-License-Identifier: Apache-2.0
import type { LogLevels } from 'moleculer';

import { loadConfig } from './project-config';

/**
 * Default config shape. NOT the live env-resolved object — see `config`
 * below for the lazy proxy that overlays `process.env`. Exported as a
 * `type` source-of-truth so consumers can name the shape.
 */
const defaults = {
  /* REQUIRED */
  MOLECULER_NODE_NAME: null as null | string,
  MOLECULER_NODE_ID: null as null | string,
  MOLECULER_NAMESPACE: 'development',
  //
  // EVID-043 Security C3 fix: ALLOWED_ORIGINS is consumed by the API
  // gateway's CORS config. The legacy string sentinel `'none'` (with
  // `credentials: true`) caused some cors-lib versions to coerce to `*`,
  // creating CWE-942 permissive CORS. New default is the empty string `''`
  // — apiGateService.template.ts parses comma-separated values into an
  // array and fails closed in production (throws at boot if NODE_ENV is
  // production and the parsed list is empty / contains `*`).
  ALLOWED_ORIGINS: '',
  // Wave 16.A — BYPASS_AUTH was a knob for the legacy OAuth mixin that
  // is now removed. Kept as a config field for back-compat (consumers
  // reading `config.BYPASS_AUTH` keep type-checking) but no code path in
  // `@gertsai/api-core` reads it anymore.
  BYPASS_AUTH: false,
  //
  TRANSPORT_TYPE: 'Nats' as 'Redis' | 'Nats' | 'Local',
  //
  TRANSPORT_NATS_URL: 'nats://0.0.0.0:4222' as `nats://${string}:${number}`,
  TRANSPORT_NATS_USERNAME: '',
  TRANSPORT_NATS_PASSWORD: '',
  //
  TRANSPORT_REDIS_HOST: 'localhost',
  TRANSPORT_REDIS_PORT: 6379,
  TRANSPORT_REDIS_CLUSTER_NAME: 'default',
  //
  //
  CACHER_TYPE: 'Redis' as 'Redis' | 'Memory',
  //
  CACHER_REDIS_HOST: 'localhost',
  CACHER_REDIS_PORT: 6379,
  CACHER_REDIS_CLUSTER_NAME: 'default',
  //
  //
  HEALTHCHECK_ENABLED: false as boolean,
  HEALTHCHECK_READY_PATH: '/ready',
  HEALTHCHECK_LIVE_PATH: '/live',
  HEALTHCHECK_PORT: 3344,
  //
  REDIS_CLUSTER: false as boolean,
  //
  LOG_DEPTH: 4,
  // Enable google cloud logging
  LOGGER_GOOGLE: false as boolean,
  LOGGER_GOOGLE__SEVERITY: 'info' as LogLevels,
  // Enable console logging
  LOGGER_CONSOLE: true as boolean,
  LOGGER_CONSOLE__SEVERITY: 'info' as LogLevels,
  //
  RESPONSE_VALIDATION: true as boolean,
};

type ConfigShape = typeof defaults;

/**
 * Wave 16.B — lazy env-var resolution.
 *
 * Previously this module called `loadConfig({...})` at module top level.
 * That side-effect fired the moment anything in the `@gertsai/api-core/moleculer`
 * subpath was imported, leaking ~30 env vars into the resolved object
 * regardless of whether any code path actually read them.
 *
 * The subpath was supposed to be side-effect-free (root export deliberately
 * skips `runtime/node` to avoid eager dotenv loading per EVID-067 §DS#3),
 * but transitive imports of `../config` defeated that contract.
 *
 * Now the default export is a `Proxy` that memoises `loadConfig({...defaults})`
 * on the first property access. Properties of the returned object look and
 * read identically (`config.ALLOWED_ORIGINS`, `config.HEALTHCHECK_ENABLED`)
 * — no consumer call site changes — but the `process.env` read happens
 * lazily, the first time something actually asks for a field.
 *
 * If your code calls `loadConfig` directly (e.g. tests or apps wiring
 * their own config), nothing changes — `loadConfig` is still re-exported
 * from `@gertsai/api-core/runtime/node`.
 */
let _resolved: ConfigShape | undefined;

function resolve(): ConfigShape {
  if (_resolved === undefined) {
    // Clone defaults so re-resolution (e.g. tests mutating process.env
    // between calls) doesn't bleed back into the literal above. Cast is
    // safe — same shape, same keys.
    _resolved = loadConfig({ ...defaults } as ConfigShape);
  }
  return _resolved;
}

const config = new Proxy({} as ConfigShape, {
  get(_target, prop, receiver) {
    if (typeof prop === 'symbol') {
      return Reflect.get(resolve(), prop, receiver);
    }
    return resolve()[prop as keyof ConfigShape];
  },
  has(_target, prop) {
    return prop in resolve();
  },
  ownKeys() {
    return Reflect.ownKeys(resolve());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(resolve(), prop);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(resolve(), prop, value, receiver);
  },
});

export default config;

/**
 * Test-only escape hatch. Lets the `__test__/configLoader.test.ts`
 * lifecycle (and any future test that mutates `process.env` between
 * cases) force the next property access to re-run `loadConfig`.
 *
 * Not part of the public API.
 *
 * @internal
 */
export function __resetConfigForTests(): void {
  _resolved = undefined;
}
