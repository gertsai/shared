// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    storage: 'src/storage-provider.ts',
  },
  external: ['@gertsai/storage-core', '@gertsai/query-dsl'],
});
