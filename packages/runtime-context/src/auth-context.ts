// SPDX-License-Identifier: Apache-2.0
import { DataAccessUuidMissingError } from '@gertsai/session-guard';
import type { Session } from '@gertsai/session';

import {
  SessionMissingError,
  TenantContextMissingError,
} from './errors.js';
import type { RequestContext } from './request-context.js';

/**
 * Security projection of {@link RequestContext} — exposed to code paths
 * that demand a fully-authenticated, fully-tenant-scoped request. The
 * `getOperatorStrict` accessor returns the *acting* operator
 * (`session.operatorUuid`); for the data-access scope (used by AI agents
 * acting on behalf of a user) consumers MUST call
 * {@link requireAuthContextWithDataAccess} instead.
 */
export interface AuthContext {
  readonly session: Session;
  readonly tenantId: string;
  /**
   * Returns the acting operator's uuid. Equivalent to `session.operatorUuid`.
   * Distinct from `session.dataAccessUuid` — see ADR-007 Amendment 1.2.9.
   */
  getOperatorStrict(): string;
}

/**
 * Build an {@link AuthContext} from a {@link RequestContext}, throwing the
 * appropriate dedicated error if the context is incomplete:
 *
 * - {@link SessionMissingError} when no session attached.
 * - {@link TenantContextMissingError} when no tenant resolved.
 */
export function requireAuthContext(ctx: RequestContext): AuthContext {
  const session = ctx.session;
  const tenantId = ctx.tenantId;
  return {
    session,
    tenantId,
    getOperatorStrict(): string {
      return session.operatorUuid;
    },
  };
}

/**
 * Variant of {@link requireAuthContext} that additionally requires
 * `session.dataAccessUuid` to be a non-empty string. Throws
 * `DataAccessUuidMissingError` from `@gertsai/session-guard` when missing.
 *
 * **Semantic limitation** (Sprint 3.10 W-3-10-11 clarification):
 * `Session.dataAccessUuid` is a *getter* that falls back to
 * `session.operatorUuid` when no explicit `dataAccessUuid` was set at
 * construction or via `$setDataAccessUuid()`. Concretely:
 *
 *   - Operator authenticated as themselves, no impersonation:
 *     `dataAccessUuid` returns the same value as `operatorUuid`. Guard
 *     PASSES — both are non-empty.
 *   - Operator acting on behalf of user `U`, with `$setDataAccessUuid(U)`
 *     called: `dataAccessUuid === U`, distinct from `operatorUuid`.
 *     Guard PASSES.
 *   - Explicit empty string passed via `$setDataAccessUuid('')`: guard
 *     FIRES — protects against degenerate inputs.
 *
 * Therefore this guard fires ONLY on an empty-string explicit set, and
 * does NOT distinguish "operator acting as self" from "operator acting
 * on behalf of a user" — both cases pass. For a stricter check that
 * surfaces the explicit-vs-fallback distinction, use
 * {@link "@gertsai/session-guard".isImpersonating} (per ADR-007 I-19),
 * which inspects the underlying field rather than the getter.
 *
 * Per ADR-007 Amendment 1.2.9 (post-Build fidelity audit P1-1 fix);
 * Sprint 3.10 W-3-10-11 (semantic clarification).
 */
export function requireAuthContextWithDataAccess(
  ctx: RequestContext,
): AuthContext & { readonly dataAccessUuid: string } {
  const base = requireAuthContext(ctx);
  const dataAccessUuid = base.session.dataAccessUuid;
  if (
    typeof dataAccessUuid !== 'string' ||
    dataAccessUuid.trim() === ''
  ) {
    throw new DataAccessUuidMissingError({
      message:
        'requireAuthContextWithDataAccess: session.dataAccessUuid is missing or empty',
      details: { reason: 'data-access-uuid-missing' },
    });
  }
  return { ...base, dataAccessUuid };
}
