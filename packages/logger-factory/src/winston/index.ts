// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/logger-factory/winston` — peer-optional adapter wrapping a
 * `winston.Logger` instance into a `LoggerBackend`. Lazy
 * `createRequire('winston')` on the FIRST call without a pre-built logger:
 * consumers who do not import this subpath never pay for the peer dep.
 *
 * Per ADR-009 Decision B + Amendment 1.3.5.
 *
 * NOTE: winston uses `'verbose'` and `'silly'` levels; this adapter maps
 * `gertsai` `'trace'` → winston `'silly'` and routes the remaining levels
 * to their winston equivalents.
 */
import { createRequire } from 'node:module';
import type { LoggerBackend, LogContext, LogLevel } from '../logger.js';

const require = createRequire(import.meta.url);

interface WinstonLogger {
  log(level: string, msg: string, meta?: LogContext): void;
}

interface WinstonModule {
  createLogger(opts?: unknown): WinstonLogger;
  default?: WinstonModule;
}

const LEVEL_MAP: Record<LogLevel, string> = {
  trace: 'silly',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

export function createWinstonBackend(
  winstonInstance?: WinstonLogger,
): LoggerBackend {
  let logger: WinstonLogger;
  if (winstonInstance) {
    logger = winstonInstance;
  } else {
    try {
      const winstonModule = require('winston') as WinstonModule;
      const mod = winstonModule.default ?? winstonModule;
      logger = mod.createLogger();
    } catch {
      throw new Error(
        '@gertsai/logger-factory/winston requires "winston" >=3.0.0 as a peer dependency. Install it with: pnpm add winston',
      );
    }
  }
  return {
    log(level, msg, ctx) {
      logger.log(LEVEL_MAP[level], msg, ctx);
    },
  };
}
