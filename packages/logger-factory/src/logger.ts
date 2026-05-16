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
import { redactDetails } from '@gertsai/errors';
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
  // Wave 12.D-fix (PRD-036 FR-006): pre-lowercased user-supplied keys
  // are passed verbatim to `redactDetails` so each `emit()` call
  // re-uses the same Set rather than recomputing it. Default
  // `REDACTION_KEYS` from `@gertsai/errors` are merged inside
  // `redactDetails` itself — FR-007 expansions thus propagate
  // automatically.
  const userRedactSet: ReadonlySet<string> = new Set(
    userRedact.map((k) => k.toLowerCase()),
  );

  let currentLevel: LogLevel = opts.level ?? 'info';

  /**
   * Deep + cycle-safe + bounded-depth/breadth redaction delegated to
   * `@gertsai/errors#redactDetails`. Replaces the Sprint 3.9 shallow
   * key-loop which leaked nested credentials such as `{ user: {
   *   password } }`. See PRD-036 FR-006.
   */
  function applyRedaction(ctx: LogContext): LogContext {
    return redactDetails(ctx, userRedactSet) as LogContext;
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
