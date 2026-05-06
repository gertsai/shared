// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/logger-factory/pino` — peer-optional adapter wrapping a
 * `pino` instance into a `LoggerBackend`. Lazy `createRequire('pino')`
 * on the FIRST call without a pre-built pino instance: consumers who do
 * not import this subpath never pay for the peer dep.
 *
 * Per ADR-009 Decision B + Amendment 1.3.5.
 */
import { createRequire } from 'node:module';
import type { LoggerBackend, LogContext } from '../logger.js';

const require = createRequire(import.meta.url);

interface PinoLogger {
  trace(ctx: LogContext, msg?: string): void;
  debug(ctx: LogContext, msg?: string): void;
  info(ctx: LogContext, msg?: string): void;
  warn(ctx: LogContext, msg?: string): void;
  error(ctx: LogContext, msg?: string): void;
  fatal(ctx: LogContext, msg?: string): void;
}

type PinoFactory = () => PinoLogger;

export function createPinoBackend(pinoInstance?: PinoLogger): LoggerBackend {
  let logger: PinoLogger;
  if (pinoInstance) {
    logger = pinoInstance;
  } else {
    try {
      const pinoModule = require('pino') as PinoFactory | { default: PinoFactory };
      const factory =
        typeof pinoModule === 'function'
          ? pinoModule
          : (pinoModule.default as PinoFactory);
      logger = factory();
    } catch {
      throw new Error(
        '@gertsai/logger-factory/pino requires "pino" >=8.0.0 as a peer dependency. Install it with: pnpm add pino',
      );
    }
  }
  return {
    log(level, msg, ctx) {
      logger[level](ctx, msg);
    },
  };
}
