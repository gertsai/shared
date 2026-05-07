// SPDX-License-Identifier: Apache-2.0
/**
 * Default `LoggerBackend` writing to `console.*`. Used when a consumer of
 * `createLogger` does not pass an explicit `backend` opt.
 *
 * Levels `error` / `fatal` go to `console.error`; `warn` to `console.warn`;
 * everything else to `console.log`. Redaction is applied by `createLogger`
 * before reaching the backend (I-17).
 */
import type { LoggerBackend } from './logger.js';

export const consoleBackend: LoggerBackend = {
  log(level, msg, ctx) {
    const fn =
      level === 'error' || level === 'fatal'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;
    fn(`[${level.toUpperCase()}]`, msg, ctx);
  },
};
