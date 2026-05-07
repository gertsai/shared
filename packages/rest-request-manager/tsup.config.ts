// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: [
    ...(Array.isArray(baseConfig.external) ? baseConfig.external : []),
    '@gertsai/async-utils',
    '@gertsai/errors',
    '@gertsai/fetch',
    '@gertsai/logger-factory',
  ],
});
