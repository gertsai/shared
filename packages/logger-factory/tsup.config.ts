// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    'pino/index': 'src/pino/index.ts',
    'winston/index': 'src/winston/index.ts',
  },
  external: ['@gertsai/errors', 'pino', 'winston'],
});
