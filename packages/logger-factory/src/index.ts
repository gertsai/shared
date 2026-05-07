// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/logger-factory` — root export.
 *
 * Pluggable structured logger with default-on redaction (per ADR-009 I-17),
 * frozen child contexts (Amendment 1.2.6), and peer-optional `pino`/`winston`
 * adapter subpaths (`./pino`, `./winston`).
 */
export type {
  LogLevel,
  LogContext,
  Logger,
  LoggerBackend,
  LoggerFactoryOpts,
} from './logger.js';
export { createLogger } from './logger.js';
export { consoleBackend } from './console-backend.js';
