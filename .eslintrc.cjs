// SPDX-License-Identifier: Apache-2.0
/**
 * Root ESLint configuration for @gertsai/shared monorepo.
 *
 * Currently scoped narrowly: enforces no-restricted-imports rule
 * for @gertsai/api-core root path (per ADR-003 §I-9).
 * Additional shared rules will land here in Sprint 3+.
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-restricted-imports': [
      'warn',
      {
        paths: [
          {
            name: '@gertsai/api-core',
            message:
              "Use subpath imports: '@gertsai/api-core/contracts' | '/moleculer' | '/runtime/node'. See ADR-003.",
          },
          {
            name: '@gerts/api-core',
            message:
              "Pre-rename name. Use '@gertsai/api-core/<subpath>' instead. See ADR-009.",
          },
        ],
      },
    ],
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.tsbuildinfo',
    'coverage/',
    'reports/',
    '**/dist/**',
    '**/node_modules/**',
  ],
};
