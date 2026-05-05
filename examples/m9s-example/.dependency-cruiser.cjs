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
        ],
      },
      comment:
        'Domain layer depends only on stdlib + @gertsai/core types. ADR-002.',
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
