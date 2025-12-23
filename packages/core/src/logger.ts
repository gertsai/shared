export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  level: LogLevel;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string | Error, meta?: Record<string, unknown>): void;
}

function shouldLog(current: LogLevel, level: LogLevel): boolean {
  const weights: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };
  return weights[level] >= weights[current];
}

export class ConsoleLogger implements Logger {
  level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(this.level, 'debug')) console.debug('[debug]', message, meta ?? '');
  }

  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(this.level, 'info')) console.info('[info]', message, meta ?? '');
  }

  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(this.level, 'warn')) console.warn('[warn]', message, meta ?? '');
  }

  error(message: string | Error, meta?: Record<string, unknown>) {
    if (!shouldLog(this.level, 'error')) return;
    const content = message instanceof Error ? `${message.name}: ${message.message}` : message;
    console.error('[error]', content, meta ?? '');
  }
}
