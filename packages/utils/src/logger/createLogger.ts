import type { Consola } from 'consola';
import { LogLevels, createConsola } from 'consola';

export type LogLevelOverrides = Record<string, number>;

export const loggerLevels: LogLevelOverrides = {};

export type ConsolaLogger = Consola & {
  __TAG__: string;
};

export const loggerInstances = new Map<string, ConsolaLogger>();

/**
 * Creates a new logger instance with the specified tag and log level.
 *
 * @param tag - The tag for the logger.
 * @param logLevel - The log level for the logger.
 * @returns A new logger instance.
 *
 * @example
 * ```typescript
 * const logger = createLogger('my-app');
 * logger.info('This is an info message');
 * ```
 */
export const createLogger = (tag: string, logLevel?: number) => {
  const logger = createConsola({
    level: logLevel ?? loggerLevels[tag] ?? LogLevels.warn,
  }).withTag(tag);

  // @ts-expect-error __TAG__ is not part of the public API
  logger.__TAG__ = tag;

  // @ts-expect-error __TAG__ is not part of the public API
  loggerInstances.set(tag, logger);

  return logger;
};

/**
 * Sets the log levels for different tags.
 * This function should be called before any logger instances are created.
 *
 * @param levels - An object with the log levels for different tags.
 *
 * @example
 * ```typescript
 * setLogLevels({
 *   'my-app': LogLevels.debug,
 * });
 * ```
 */
export const setLogLevels = (levels: LogLevelOverrides) => {
  Object.entries(levels).forEach(([tag, level]) => {
    if (level === undefined) return;
    loggerLevels[tag] = level;
    if (loggerInstances.has(tag)) {
      loggerInstances.get(tag)!.level = level;
    }
  });
};
