// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/core/*.ts',
    'src/mixins/*.ts',
    'src/operations/*.ts',
    'src/specialized/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
});
