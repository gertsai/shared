"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleLogger = void 0;
function shouldLog(current, level) {
    const weights = {
        debug: 10,
        info: 20,
        warn: 30,
        error: 40,
    };
    return weights[level] >= weights[current];
}
class ConsoleLogger {
    level;
    constructor(level = 'info') {
        this.level = level;
    }
    debug(message, meta) {
        if (shouldLog(this.level, 'debug'))
            console.debug('[debug]', message, meta ?? '');
    }
    info(message, meta) {
        if (shouldLog(this.level, 'info'))
            console.info('[info]', message, meta ?? '');
    }
    warn(message, meta) {
        if (shouldLog(this.level, 'warn'))
            console.warn('[warn]', message, meta ?? '');
    }
    error(message, meta) {
        if (!shouldLog(this.level, 'error'))
            return;
        const content = message instanceof Error ? `${message.name}: ${message.message}` : message;
        console.error('[error]', content, meta ?? '');
    }
}
exports.ConsoleLogger = ConsoleLogger;
//# sourceMappingURL=logger.js.map