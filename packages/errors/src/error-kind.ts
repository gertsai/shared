// SPDX-License-Identifier: Apache-2.0

/**
 * Universal error taxonomy for @gertsai/* packages — Shared Kernel per ADR-006.
 *
 * Implemented as `as const` object (not `const enum`) per Amendment 1.1.1:
 * `const enum` is incompatible with `isolatedModules: true` (tsconfig.base.json baseline).
 *
 * The 10 closed values cover RFC 9457 ProblemDetails + canonical microservice taxonomy.
 */
export const ErrorKind = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  UPSTREAM_FAILURE: 'UPSTREAM_FAILURE',
  TIMEOUT: 'TIMEOUT',
  BAD_GATEWAY: 'BAD_GATEWAY',
} as const;

export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind];
