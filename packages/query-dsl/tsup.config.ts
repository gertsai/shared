// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

/**
 * Multi-entry build: root barrel (`index`) + Postgres reference compiler
 * (`sql`). Splitting `compileToSql` into its own subpath keeps consumers
 * that only need the constraint factories from pulling SQL string-building
 * code into their bundle.
 *
 * `@gertsai/storage-core` is treated as external by the base config
 * (matches `^@gertsai/`).
 */
export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    sql: 'src/sql.ts',
  },
  external: [
    ...((baseConfig.external as (string | RegExp)[] | undefined) ?? []),
    '@gertsai/storage-core',
  ],
});
