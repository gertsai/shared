export type ErrorSeverity = 'info' | 'warn' | 'error' | 'fatal';
export interface ErrorContext {
    code: string;
    cause?: unknown;
    severity?: ErrorSeverity;
    details?: Record<string, unknown>;
}
export declare class GertsError extends Error {
    readonly code: string;
    readonly severity: ErrorSeverity;
    readonly details?: Record<string, unknown>;
    constructor(message: string, context: ErrorContext);
}
export declare class NotFoundError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ValidationError extends GertsError {
    constructor(message: string, details?: Record<string, unknown>);
}
//# sourceMappingURL=errors.d.ts.map