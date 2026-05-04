import { isIP } from 'node:net';

import { APIError, ResponseCode } from '@gertsai/api-core';
import type { IncomingRequest } from 'moleculer-web';

import type { Store } from './types.js';

class ValidationError extends Error {
  override name: string;
  code: string;
  help: string;

  /**
   * The code must be a string, in snake case and all capital, that starts with
   * the substring `ERR_ERL_`.
   *
   * The message must be a string, starting with an uppercase character,
   * describing the issue in detail.
   */
  constructor(code: string, message: string) {
    const url = `https://express-rate-limit.github.io/${code}/`;
    super(`${message} See ${url} for more information.`);

    // `this.constructor.name` is the class name
    this.name = this.constructor.name;
    this.code = code;
    this.help = url;
  }
}

/**
 * A warning logged when the configuration used will/has been changed by a
 * newly released version of the library.
 */
class ChangeWarning extends ValidationError {}

/**
 * Maps the key used in a store for a certain request, and ensures that the
 * same key isn't used more than once per request.
 *
 * The store can be any one of the following:
 *  - An instance, for stores like the MemoryStore where two instances do not
 *    share state.
 *  - A string (class name), for stores where multiple instances
 *    typically share state, such as the Redis store.
 */
const singleCountKeys = new WeakMap<IncomingRequest, Map<Store | string, string[]>>();

export const validations = {
  /**
   * Checks whether the IP address is valid, and that it does not have a port
   * number in it.
   *
   * @param ip {string | undefined} - The IP address provided by Express as request.ip.
   *
   * @returns {void}
   */
  ip(ip: string | undefined): void {
    if (ip === undefined) {
      throw new ValidationError(
        'ERR_ERL_UNDEFINED_IP_ADDRESS',
        `An undefined 'request.ip' was detected. This might indicate a misconfiguration or the connection being destroyed prematurely.`,
      );
    }

    if (!isIP(ip)) {
      throw new ValidationError(
        'ERR_ERL_INVALID_IP_ADDRESS',
        `An invalid 'request.ip' (${ip}) was detected. Consider passing a custom 'keyGenerator' function to the rate limiter.`,
      );
    }
  },
  /**
   * Makes sure the trust proxy setting is set in case the `X-Forwarded-For`
   * header is present.
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  xForwardedForHeader(request: IncomingRequest): void {
    if (
      // @ts-ignore -- moleculer IncomingRequest typing may not include 'headers'
      request.headers['x-forwarded-for'] &&
      // @ts-ignore -- 'app' property not present in generic IncomingRequest typings
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      request.app.get('trust proxy') === false
    ) {
      throw new ValidationError(
        'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR',
        `The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false (default). This could indicate a misconfiguration which would prevent express-rate-limit from accurately identifying users.`,
      );
    }
  },

  /**
   * Ensures a given key is incremented only once per request.
   *
   * @param request {Request} - The Express request object.
   * @param store {Store} - The store class.
   * @param key {string} - The key used to store the client's hit count.
   *
   * @returns {void}
   */
  singleCount(request: IncomingRequest, store: Store, key: string): void {
    let storeKeys = singleCountKeys.get(request);
    if (!storeKeys) {
      storeKeys = new Map();
      singleCountKeys.set(request, storeKeys);
    }

    const storeKey = store.constructor.name;
    let keys = storeKeys.get(storeKey);
    if (!keys) {
      keys = [];
      storeKeys.set(storeKey, keys);
    }

    const prefixedKey = `${store.config.prefix ?? ''}${key}`;

    if (keys.includes(prefixedKey)) {
      throw new APIError(
        ResponseCode.BAD_REQUEST__INVALID_PARAMS,
        undefined,
        `The hit count for ${key} was incremented more than once for a single request.`,
      );
    }

    keys.push(prefixedKey);
  },

  /**
   * Warns the user that the behaviour for `max: 0` / `limit: 0` is changing in the next
   * major release.
   *
   * @param limit {number} - The maximum number of hits per client.
   *
   * @returns {void}
   */
  limit(limit: number): void {
    if (limit === 0) {
      throw new ChangeWarning(
        'WRN_ERL_MAX_ZERO',
        `Setting limit or max to 0 disables rate limiting in express-rate-limit v6 and older, but will cause all requests to be blocked in v7`,
      );
    }
  },
};

export type Validations = typeof validations;
