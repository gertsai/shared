// SPDX-License-Identifier: Apache-2.0
/**
 * Shared logger factory for the m9s-example application — Wave 8.1.
 *
 * Wraps `@gertsai/logger-factory`'s `createLogger` with project-wide defaults:
 *   - `module` field bound into baseContext for greppable log lines
 *   - LOG_LEVEL env override (default 'info'); unknown values fall back silently
 *   - `REDACT_KEYS` adds m9s-specific sensitive keys ON TOP of the built-in
 *     `REDACTION_KEYS` from `@gertsai/errors/http` (logger-factory I-17 unions
 *     them case-insensitively — no need to repeat 'apiToken', 'password', etc.)
 *
 * Usage:
 *   import { createAppLogger } from './composition/logger.js';
 *   const log = createAppLogger('ollama-embedder');
 *   log.info('embedding batch', { count: texts.length });
 *   log.error('request failed', { err, url });
 */
import {
  consoleBackend,
  createLogger,
  type LogLevel,
  type Logger,
} from '@gertsai/logger-factory';

/**
 * m9s-example-specific redaction additions on top of `@gertsai/errors`
 * built-in REDACTION_KEYS. Case-insensitive match per logger-factory I-17.
 *
 * Built-in keys ALREADY redacted (no need to list here):
 *   `password`, `token`, `secret`, `apiKey`, `api_key`, `authorization`,
 *   `cookie`, `set-cookie`, `pwd`, `passwd`, `private_key`, `privateKey`,
 *   `connection_string`, `connectionString`.
 *
 * Wave 8.2 audit Sec#5 (CWE-532): closed gaps for connection strings
 * (`POSTGRES_URL`, `REDIS_URL`) that embed credentials but whose key
 * names do not match any built-in. Also expanded coverage for JWT /
 * OAuth2 bearer / session shapes.
 */
export const REDACT_KEYS: readonly string[] = Object.freeze([
  // Embedding payloads — bulk, expensive to log, sometimes PII-derived.
  'embedding',
  'embeddings',
  'vector',
  'vectors',
  // Project-specific API tokens (key-name based — case-insensitive match).
  'OPENAI_API_KEY',
  'FGA_API_TOKEN',
  // Wave 8.2 — connection strings with embedded auth (CWE-532).
  'POSTGRES_URL',
  'REDIS_URL',
  'DATABASE_URL',
  // Wave 8.2 — JWT / OAuth2 / session shapes (CWE-532).
  'bearer',
  'x-api-key',
  'refresh_token',
  'refreshToken',
  'client_secret',
  'clientSecret',
  'jwt',
  'session',
  'sessionId',
  'sessionid',
  'session_id',
] as const);

const VALID_LEVELS: ReadonlySet<LogLevel> = new Set<LogLevel>([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

function resolveLogLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL'];
  if (raw !== undefined && VALID_LEVELS.has(raw as LogLevel)) {
    return raw as LogLevel;
  }
  return 'info';
}

/**
 * Create a module-scoped logger. The `module` field is bound into the
 * base context so every emitted log line carries it.
 */
export function createAppLogger(moduleName: string): Logger {
  return createLogger({
    level: resolveLogLevel(),
    backend: consoleBackend,
    baseContext: { module: moduleName },
    redact: REDACT_KEYS,
  });
}
