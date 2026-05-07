// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consoleBackend } from '../console-backend.js';
import { createLogger } from '../logger.js';

describe('consoleBackend', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('routes info → console.log, warn → console.warn, error/fatal → console.error', () => {
    consoleBackend.log('info', 'hi', { a: 1 });
    consoleBackend.log('warn', 'w', {});
    consoleBackend.log('error', 'e', {});
    consoleBackend.log('fatal', 'f', {});
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('default factory uses consoleBackend with redaction applied before backend', () => {
    const logger = createLogger({ level: 'info' });
    logger.info('hello', { token: 'sneaky', userId: 7 });
    expect(logSpy).toHaveBeenCalledWith('[INFO]', 'hello', {
      token: '[REDACTED]',
      userId: 7,
    });
  });
});
