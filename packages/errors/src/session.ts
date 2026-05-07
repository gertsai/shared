// SPDX-License-Identifier: Apache-2.0
import { ConflictError } from './errors/conflict.js';

/**
 * Thrown when an operation is attempted on a destroyed session. Reuses
 * {@link ConflictError} taxonomy — the session lifecycle precondition has
 * been violated (HTTP 409 / gRPC ABORTED).
 *
 * Shared Kernel error per ADR-010 Amendment 1 §A1.1: relocated from
 * `@gertsai/session-guard` to `@gertsai/errors` to preserve tier discipline
 * (`@gertsai/session` Tier 1 cannot peer-depend on `@gertsai/session-guard`
 * Tier 2). `@gertsai/session-guard` continues to re-export this class for
 * backward compatibility.
 */
export class SessionDestroyedError extends ConflictError<{
  contextField: 'session';
}> {}
