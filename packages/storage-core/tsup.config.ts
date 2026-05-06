// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

/**
 * Single-entry build for `@gertsai/storage-core`.
 *
 * Backend-agnostic types + DI token only — no peer-dep guards needed.
 * `@gertsai/di` is treated as external by the base config (matches `^@gertsai/`).
 */
export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: [
    ...((baseConfig.external as (string | RegExp)[] | undefined) ?? []),
    '@gertsai/di',
  ],
});
