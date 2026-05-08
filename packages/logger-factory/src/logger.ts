// SPDX-License-Identifier: Apache-2.0
/**
 * `@gertsai/logger-factory` core — `createLogger`, public types, and shared
 * helpers. Per ADR-009 Decision B + Amendment 1.2.5/1.2.6 + I-17.
 *
 * Default-on redaction (I-17): consumer's `redact` extends the default
 * `REDACTION_KEYS` from `@gertsai/errors` (set union, case-insensitive).
 * Cannot be disabled.
 *
 * `child(boundCtx)` (Amendment 1.2.6): returns a NEW Logger whose merged
 * context is a frozen shallow copy. Parent context mutations DO NOT
 * propagate. Independent level state (parent.setLevel does not affect
 * child).
 */
import { REDACTION_KEYS } from '@gertsai/errors/http';
import { consoleBackend } from './console-backend.js';

export type LogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal';

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface Logger {
  trace(msg: string, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  fatal(msg: string, ctx?: LogContext): void;
  child(boundCtx: LogContext): Logger;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

export interface LoggerBackend {
  log(level: LogLevel, msg: string, ctx: LogContext): void;
}

export interface LoggerFactoryOpts {
  readonly level?: LogLevel;
  readonly backend?: LoggerBackend;
  readonly baseContext?: LogContext;
  readonly redact?: readonly string[];
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export function createLogger(opts: LoggerFactoryOpts = {}): Logger {
  const backend = opts.backend ?? consoleBackend;
  const baseContext: LogContext = Object.freeze({ ...opts.baseContext });
  const userRedact = opts.redact ?? [];
  const redactSet = new Set(
    [...REDACTION_KEYS, ...userRedact].map((k) => k.toLowerCase()),
  );

  let currentLevel: LogLevel = opts.level ?? 'info';

  function applyRedaction(ctx: LogContext): LogContext {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx)) {
      if (redactSet.has(k.toLowerCase())) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
  }

  function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (!shouldLog(level)) return;
    const merged: LogContext = { ...baseContext, ...ctx };
    backend.log(level, msg, applyRedaction(merged));
  }

  return {
    trace: (msg, ctx) => emit('trace', msg, ctx),
    debug: (msg, ctx) => emit('debug', msg, ctx),
    info: (msg, ctx) => emit('info', msg, ctx),
    warn: (msg, ctx) => emit('warn', msg, ctx),
    error: (msg, ctx) => emit('error', msg, ctx),
    fatal: (msg, ctx) => emit('fatal', msg, ctx),
    child(boundCtx) {
      return createLogger({
        level: currentLevel,
        backend,
        baseContext: Object.freeze({ ...baseContext, ...boundCtx }),
        redact: userRedact,
      });
    },
    setLevel(level) {
      currentLevel = level;
    },
    getLevel() {
      return currentLevel;
    },
  };
}
