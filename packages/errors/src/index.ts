// SPDX-License-Identifier: Apache-2.0
export { ErrorKind } from './error-kind.js';
export { AppError } from './app-error.js';
export type { AppErrorOpts } from './app-error.js';
export type { SerializedAppError } from './serialize.js';
export { serializeAppError } from './serialize.js';

export { ValidationError } from './errors/validation.js';
export { NotFoundError } from './errors/not-found.js';
export { UnauthorizedError } from './errors/unauthorized.js';
export { ForbiddenError } from './errors/forbidden.js';
export { ConflictError } from './errors/conflict.js';
export { SessionDestroyedError } from './session.js';
export { RateLimitedError } from './errors/rate-limited.js';
export { InternalError } from './errors/internal.js';
export { UpstreamFailureError } from './errors/upstream-failure.js';
export { TimeoutError } from './errors/timeout.js';
export { BadGatewayError } from './errors/bad-gateway.js';

export { isAppError, wrapUnknownError } from './helpers.js';
export { getUserMessage, registerErrorLocale } from './locale.js';
