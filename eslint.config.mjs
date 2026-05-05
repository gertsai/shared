// SPDX-License-Identifier: Apache-2.0
/**
 * Root ESLint flat config for @gertsai/shared monorepo (ESLint 10).
 *
 * Migrated from .eslintrc.cjs (legacy eslintrc format) to flat config —
 * ESLint 10 deprecated eslintrc without an opt-in flag. See SPEC-004 §U-9.
 *
 * Currently scoped narrowly: enforces no-restricted-imports rule for
 * @gertsai/api-core root path (per ADR-003 §I-9). Sprint 3+ may add more.
 */

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/reports/**',
      '**/*.tsbuildinfo',
      '.moon/cache/**',
      '.changeset/**',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js builtins — keep minimal, expand when rules require it.
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
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
  },
];
