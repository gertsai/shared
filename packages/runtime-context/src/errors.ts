// SPDX-License-Identifier: Apache-2.0
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@gertsai/errors';

/**
 * Thrown by `RequestContext.session` getter (and related) when the session
 * has not been attached. Subclass of `NotFoundError` per ADR-007 §A §6.
 */
export class SessionMissingError extends NotFoundError<{ contextField: 'session' }> {}

/**
 * Thrown by `RequestContext.tenantId` getter when the tenant context has
 * not been resolved (no `tenantId` set on the request, no upstream resolver
 * provided one). Subclass of `UnauthorizedError` because tenancy is an
 * authentication boundary per ADR-006 I-16.
 */
export class TenantContextMissingError extends UnauthorizedError<{
  reason: 'tenant-context-not-resolved';
}> {}

/**
 * Thrown by `ProviderContext.get<T>(token)` when no binding nor resolver
 * resolves the symbol. `details.token` is the symbol's description; redact
 * via `@gertsai/errors/http` REDACTION_KEYS list before transport per
 * ADR-007 I-21.
 */
export class ProviderNotFoundError extends NotFoundError<{ token: string }> {}

/**
 * Thrown by `RequestContext.$setSession`, `$setTenantId`, `$setCorrelationId`
 * after `$freeze()` has been invoked. Subclass of `ConflictError`.
 */
export class ContextFrozenError extends ConflictError<{ frozen: true }> {}

/**
 * Thrown by feature-flag enforcement code when a required flag is not
 * enabled. Not used by the core RequestContext directly, but exported
 * so consumers building feature gates can throw a typed AppError instead
 * of a bare `Error`. Subclass of `ForbiddenError`.
 */
export class FeatureNotEnabledError extends ForbiddenError<{ flag: string }> {}
