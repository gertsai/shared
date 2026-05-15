import type { LogLevels } from 'moleculer';

import { loadConfig } from './project-config';

export default loadConfig({
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
  // EVID-043 Security C1 fix (CWE-347 / CWE-345): Allows bypassing JWT
  // signature verification. Decodes Firebase token payload via `atob()`
  // without verifying the signature — instant impersonation if true in
  // production. Hard-gated at consume site (oauth.class.ts) to throw at
  // boot when NODE_ENV === 'production' AND BYPASS_AUTH === true.
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
});
