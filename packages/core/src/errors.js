export class GertsError extends Error {
    code;
    severity;
    details;
    constructor(message, context) {
        super(message);
        this.name = 'GertsError';
        this.code = context.code;
        this.severity = context.severity ?? 'error';
        this.details = context.details;
        if (context.cause instanceof Error && context.cause.stack) {
            this.stack += `\nCaused by: ${context.cause.stack}`;
        }
    }
}
export class NotFoundError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'NOT_FOUND', details });
        this.name = 'NotFoundError';
    }
}
export class ValidationError extends GertsError {
    constructor(message, details) {
        super(message, { code: 'VALIDATION_FAILED', details, severity: 'warn' });
        this.name = 'ValidationError';
    }
}
