import { describe, expect, it, vi } from 'vitest';

import { createLogger, loggerInstances, setLogLevels } from './createLogger';
import { LogLevels } from 'consola';

const createMockLogger = (initialLevel = 2) => ({
  level: initialLevel,
  withTag: vi.fn(function (this: { level: number }) {
    return this;
  }),
});

vi.mock('consola', () => ({
  createConsola: vi.fn((options: { level?: number } = {}) =>
    createMockLogger(options.level),
  ),
  LogLevels: {
    warn: 2,
    info: 3,
    debug: 5,
    error: 1,
  },
}));

describe('createLogger', () => {
  it('should create a logger with the correct tag', () => {
    const logger = createLogger('test');
    // @ts-expect-error - __TAG__ is not part of the public API
    expect(logger.__TAG__).toBe('test');
  });

  it('should create a logger with the default log level', () => {
    const logger = createLogger('test');
    expect(logger.level).toBe(LogLevels.warn);
  });

  it('should create a logger with a custom log level', () => {
    const logger = createLogger('test', LogLevels.debug);
    expect(logger.level).toBe(LogLevels.debug);
  });

  it('should store the logger instance', () => {
    const logger = createLogger('test');
    expect(loggerInstances.get('test')).toBe(logger);
  });
});

describe('setLogLevels', () => {
  it('should set the log level for a tag', () => {
    setLogLevels({ test: LogLevels.info });
    const logger = createLogger('test');
    expect(logger.level).toBe(LogLevels.info);
  });

  it('should update the log level of an existing logger instance', () => {
    const logger = createLogger('test');
    setLogLevels({ test: LogLevels.error });
    expect(logger.level).toBe(LogLevels.error);
  });
});
