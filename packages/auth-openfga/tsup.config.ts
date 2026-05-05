// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import baseConfig from '../../tsup.config';

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'queries/index': 'src/queries/index.ts',
    'mutations/index': 'src/mutations/index.ts',
  },
});
