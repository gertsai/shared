// SPDX-License-Identifier: Apache-2.0
/**
 * Dependency-cruiser configuration for examples/m9s-example.
 *
 * Enforces hexagonal layer rules per ADR-002:
 *   composition/   → may import any layer (composition root)
 *   mol-services/  → services + lib + Moleculer (thin transport)
 *   services/      → application + lib + composition (НЕ infrastructure direct)
 *   lib/           → @gertsai/api-core wrappers
 *   application/   → only domain/ (use cases use ports, not adapters)
 *   domain/        → stdlib + @gertsai/core types only
 *   infrastructure/→ implements domain/ports/* через @gertsai/*
 *
 * Plus ADR-003 enforcement: prefer subpath imports of @gertsai/api-core.
 *
 * Layer violations are `error`. Subpath warning is `warn` (deprecated root works).
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-leaks-out',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: {
        pathNot: [
          '^src/domain/',
          'node_modules/typescript',
          'node_modules/@gertsai/core',
          // Shared Kernel exception — domain MAY depend on error taxonomy
          // classes per ADR-006 §D §6 (errors as @gertsai/* Shared Kernel) +
          // ADR-010 Amendment 1 §A1.1. Sprint 3.10 m9s integration uses
          // ValidationError in domain/document.ts for invariant guards.
          // Patterns cover (a) the bare specifier as recorded in the
          // import (CI matches `@gertsai/errors` literally before resolution),
          // (b) the node_modules symlink, and (c) the resolved pnpm workspace
          // path (`../../packages/errors`). All three forms are seen across
          // local + CI environments.
          '^@gertsai/errors',
          'node_modules/@gertsai/errors',
          'packages/errors/',
        ],
      },
      comment:
        'Domain layer depends only on stdlib + @gertsai/core types + @gertsai/errors Shared Kernel. ADR-002 + ADR-006 §D §6.',
    },
    {
      name: 'no-application-to-infrastructure',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^src/infrastructure/' },
      comment:
        'Application layer depends on domain (ports) only — NOT direct infrastructure imports. ADR-002.',
    },
    {
      name: 'no-application-to-services-or-mol',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^(src/services/|src/mol-services/|src/lib/)' },
      comment:
        'Application layer is transport-agnostic — must not depend on services/lib/mol-services. ADR-002.',
    },
    {
      name: 'no-services-to-infrastructure-direct',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^src/infrastructure/' },
      comment:
        'Services must wire infrastructure через composition root, not direct import. ADR-002.',
    },
    {
      name: 'no-application-to-composition',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^src/composition/' },
      comment:
        'Application layer must import error/types from src/shared/, never from src/composition/. Composition is wiring; shared is the neutral kernel. Wave 8.3 audit Arch#1.',
    },
    {
      name: 'no-services-to-composition-errors',
      severity: 'error',
      from: { path: '^src/services/' },
      // Allow services → composition/wave5-middlewares (existing pattern; that's
      // request-context wiring that services legitimately need). Block only the
      // errors module which has a kernel sibling now.
      to: { path: '^src/composition/errors\\.ts$' },
      comment:
        'Services layer must import error types from src/shared/errors, not the composition HTTP scrubber. Wave 8.3 audit Arch#1.',
    },
    {
      name: 'no-domain-to-infrastructure',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/infrastructure/' },
      comment:
        'Domain ports define contracts; concrete adapters live в infrastructure/. Domain must not see them.',
    },
    {
      name: 'prefer-api-core-subpath',
      severity: 'warn',
      from: { path: '^src/' },
      to: { path: '^@gertsai/api-core$' },
      comment:
        'Prefer subpath imports of @gertsai/api-core (/contracts | /moleculer | /runtime/node). ADR-003.',
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
