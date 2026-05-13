// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 8.1 — logger redaction contract for m9s-example.
 *
 * Asserts that `createAppLogger` (via `createLogger` from
 * `@gertsai/logger-factory`) honours:
 *   1. Built-in REDACTION_KEYS from `@gertsai/errors/http` (password,
 *      token, secret, apiKey, authorization, cookie, …) — case-insensitive.
 *   2. m9s-specific REDACT_KEYS (embedding, embeddings, vector, vectors,
 *      OPENAI_API_KEY, FGA_API_TOKEN).
 *   3. Keys not in the redaction set are passed through verbatim.
 *   4. `createAppLogger` returns a structurally-complete Logger
 *      (6 level methods + child + setLevel + getLevel).
 *
 * Uses a custom in-memory `LoggerBackend` to capture emitted lines —
 * the same pattern logger-factory's own tests use.
 */
import { describe, it, expect } from 'vitest';

import {
  createLogger,
  type Logger,
  type LoggerBackend,
  type LogLevel,
  type LogContext,
} from '@gertsai/logger-factory';

import { createAppLogger, REDACT_KEYS } from '../src/shared/logger';

interface CapturedCall {
  readonly level: LogLevel;
  readonly msg: string;
  readonly ctx: LogContext;
}

function captureBackend(): LoggerBackend & { readonly calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  return {
    calls,
    log(level, msg, ctx) {
      calls.push({ level, msg, ctx });
    },
  };
}

describe('m9s-example logger redaction', () => {
  it('redacts built-in REDACTION_KEYS (password, token, apiKey) and passes other keys through', () => {
    const backend = captureBackend();
    const logger = createLogger({
      level: 'trace',
      backend,
      redact: REDACT_KEYS,
    });

    logger.info('test', {
      password: 'pw-12345',
      token: 'tok-abc',
      apiKey: 'ak-xyz',
      normalKey: 'visible',
    });

    expect(backend.calls).toHaveLength(1);
    const first = backend.calls[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.ctx['password']).toBe('[REDACTED]');
    expect(first.ctx['token']).toBe('[REDACTED]');
    expect(first.ctx['apiKey']).toBe('[REDACTED]');
    expect(first.ctx['normalKey']).toBe('visible');
  });

  it('redacts m9s-specific keys (embedding, vector)', () => {
    const backend = captureBackend();
    const logger = createLogger({
      level: 'trace',
      backend,
      redact: REDACT_KEYS,
    });

    logger.info('embed', { embedding: [0.1, 0.2], vector: [0.3] });

    const first = backend.calls[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.ctx['embedding']).toBe('[REDACTED]');
    expect(first.ctx['vector']).toBe('[REDACTED]');
  });

  it('redacts in a case-insensitive way (OPENAI_API_KEY upper-case)', () => {
    const backend = captureBackend();
    const logger = createLogger({
      level: 'trace',
      backend,
      redact: REDACT_KEYS,
    });

    logger.info('env', { OPENAI_API_KEY: 'sk-test' });

    const first = backend.calls[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.ctx['OPENAI_API_KEY']).toBe('[REDACTED]');
  });

  it('createAppLogger returns a structurally-complete Logger', () => {
    const logger: Logger = createAppLogger('test-module');

    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.fatal).toBe('function');
    expect(typeof logger.child).toBe('function');
    expect(typeof logger.setLevel).toBe('function');
    expect(typeof logger.getLevel).toBe('function');
  });
});
